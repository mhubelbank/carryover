import { callAnthropic, AnthropicError, DEFAULT_MODEL } from "../clients/anthropic";
import type { GitHubClient } from "../clients/github";
import type { Mode } from "./teacher";

// Token ceilings ported from her existing TSX files (bump if she sees truncation).
export const MAX_TOKENS_BY_MODE: Record<Mode, number> = {
  regular: 1500,
  "news-day": 1000,
};

export type Pass = "draft" | "review" | "streamline";
export const PASSES: Pass[] = ["draft", "review", "streamline"];

export interface PromptSet {
  draft: string;
  review: string;
  streamline: string;
}

export interface NoteResult {
  draft: string;
  reviewed: string;
  final: string;
  // Unfixable logic issues the streamline pass flagged (e.g. the targeted goals
  // don't correspond to the described activity). Shown beside the note, never in
  // it. Empty when the note is clean.
  warnings: string[];
}

const WARNINGS_MARKER = "[[WARNINGS]]";

// Split the streamline output into the clean note and any flagged warnings. The
// streamline prompt appends `[[WARNINGS]]` + bullet lines only when it can't fix
// something without inventing/removing content.
export function splitWarnings(text: string): { note: string; warnings: string[] } {
  const i = text.indexOf(WARNINGS_MARKER);
  if (i === -1) return { note: text.trim(), warnings: [] };
  const warnings = text
    .slice(i + WARNINGS_MARKER.length)
    .split("\n")
    .map((l) => l.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
  return { note: text.slice(0, i).trim(), warnings };
}

// Render context: nested objects/arrays addressed by the templates (student,
// teacher, activities, selectedGoals, role, roleData, additionalContext, …).
export type TemplateContext = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Response cleaning
// ---------------------------------------------------------------------------

// Strips markdown/HTML artifacts Claude sometimes emits despite instructions.
// Superset of the variants across her seven TSX files (Joanne's added the HTML
// strip). Applied after every pass; cleaned output of pass N feeds pass N+1.
export function cleanClaudeResponse(text: string): string {
  if (!text) return "";
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Template engine (Handlebars-subset used by data/prompts/*.md)
// Supports: {{path.dotted}}, {{x | default: "y"}}, {{list | join: ", "}},
//   {{#if cond}}…{{else}}…{{/if}}, {{#each arr}}…{{this.x}}…{{@index_plus_one}}…{{/each}}
// ---------------------------------------------------------------------------

type Token = { t: "text"; v: string } | { t: "tag"; v: string };

type Node =
  | { type: "text"; value: string }
  | { type: "var"; expr: string }
  | { type: "if"; cond: string; then: Node[]; else: Node[] }
  | { type: "each"; arr: string; body: Node[] };

function tokenize(s: string): Token[] {
  const out: Token[] = [];
  const re = /\{\{([\s\S]*?)\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
    out.push({ t: "tag", v: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: "text", v: s.slice(last) });
  return out;
}

function parseNodes(tokens: Token[], start: number): { nodes: Node[]; next: number; stop: string | null } {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i]!;
    if (tok.t === "text") {
      nodes.push({ type: "text", value: tok.v });
      i++;
      continue;
    }
    const tag = tok.v;
    if (tag === "else" || tag === "/if" || tag === "/each") {
      return { nodes, next: i, stop: tag };
    }
    if (tag.startsWith("#if")) {
      const thenR = parseNodes(tokens, i + 1);
      let elseNodes: Node[] = [];
      let end = thenR.next;
      if (thenR.stop === "else") {
        const elseR = parseNodes(tokens, thenR.next + 1);
        elseNodes = elseR.nodes;
        end = elseR.next;
      }
      nodes.push({ type: "if", cond: tag.slice(3).trim(), then: thenR.nodes, else: elseNodes });
      i = end + 1; // skip the {{/if}}
      continue;
    }
    if (tag.startsWith("#each")) {
      const bodyR = parseNodes(tokens, i + 1);
      nodes.push({ type: "each", arr: tag.slice(5).trim(), body: bodyR.nodes });
      i = bodyR.next + 1; // skip the {{/each}}
      continue;
    }
    nodes.push({ type: "var", expr: tag });
    i++;
  }
  return { nodes, next: i, stop: null };
}

export function renderTemplate(template: string, ctx: TemplateContext): string {
  const { nodes } = parseNodes(tokenize(template), 0);
  return renderNodes(nodes, ctx);
}

function renderNodes(nodes: Node[], ctx: TemplateContext): string {
  let out = "";
  for (const n of nodes) {
    if (n.type === "text") {
      out += n.value;
    } else if (n.type === "var") {
      out += renderVar(n.expr, ctx);
    } else if (n.type === "if") {
      out += truthy(resolvePath(n.cond, ctx)) ? renderNodes(n.then, ctx) : renderNodes(n.else, ctx);
    } else {
      const arr = resolvePath(n.arr, ctx);
      if (Array.isArray(arr)) {
        arr.forEach((item, idx) => {
          out += renderNodes(n.body, { ...ctx, this: item, "@index_plus_one": idx + 1 });
        });
      }
    }
  }
  return out;
}

function renderVar(expr: string, ctx: TemplateContext): string {
  const [pathPart, ...filters] = expr.split("|");
  let value = resolvePath(pathPart!.trim(), ctx);
  for (const f of filters) value = applyFilter(value, f.trim());
  return value == null ? "" : String(value);
}

function applyFilter(value: unknown, filter: string): unknown {
  const m = /^(\w+)\s*:\s*(.*)$/.exec(filter);
  if (!m) return value;
  const arg = stripQuotes(m[2]!.trim());
  if (m[1] === "default") return value == null || value === "" ? arg : value;
  if (m[1] === "join") return Array.isArray(value) ? value.join(arg) : value;
  return value;
}

function resolvePath(path: string, ctx: TemplateContext): unknown {
  if (path in ctx) return ctx[path];
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  return Boolean(v);
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const PROMPT_DIR = "data/prompts";

// Loads the three templates for a mode from data/prompts/{mode}-{pass}.md.
// Throws when any file is missing rather than substituting a placeholder — a
// silent fallback would burn API calls and yield a fake clinical note.
export async function loadPromptSet(client: GitHubClient, mode: Mode): Promise<PromptSet> {
  const files = await Promise.all(
    PASSES.map((pass) => client.readFile(`${PROMPT_DIR}/${mode}-${pass}.md`)),
  );
  const missing = PASSES.filter((_, i) => files[i] == null);
  if (missing.length > 0) {
    throw new Error(
      `Prompt template(s) not found on the data branch: ${missing
        .map((p) => `${PROMPT_DIR}/${mode}-${p}.md`)
        .join(", ")}. Commit them to the data branch and retry.`,
    );
  }
  return {
    draft: files[0]!.text,
    review: files[1]!.text,
    streamline: files[2]!.text,
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  model?: string;
  maxTokens?: number;
  // Contents of data/feedback-rules.md — appended to the DRAFT prompt only.
  feedbackRules?: string;
  // Example notes Emily likes (data/golden_output.txt) — appended to the DRAFT
  // prompt as a style/structure reference.
  goldenExamples?: string;
  // Per-session variety instruction (date-derived) appended to the DRAFT prompt,
  // so the same student's notes don't read identically week to week.
  varietyNote?: string;
  // Deterministic per-teacher post-processing applied to the final note text
  // (e.g. Nina's Spanish-support sentence). No API call.
  postProcess?: (finalNote: string) => string;
  // Fired before each pass starts, so callers can show generation progress.
  onPhase?: (pass: Pass) => void;
}

const BACKOFF_MS = [1000, 3000, 10000];

async function callPass(
  apiKey: string,
  pass: Pass,
  model: string,
  maxTokens: number,
  prompt: string,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await callAnthropic(apiKey, {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      return cleanClaudeResponse(res.content.map((b) => b.text).join(""));
    } catch (err) {
      lastError = err;
      const status = err instanceof AnthropicError ? err.status : undefined;
      const retryable = status === undefined || status === 429 || (status >= 500 && status < 600);
      const wait = BACKOFF_MS[attempt];
      if (!retryable || wait === undefined) break;
      await delay(wait);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "unknown error";
  throw new Error(`${pass} pass failed: ${detail}`);
}

// Run the three sequential passes for one student. {{draftNote}} and
// {{reviewedNote}} are injected between passes; each result is cleaned.
export async function generateNote(
  apiKey: string,
  prompts: PromptSet,
  ctx: TemplateContext,
  opts: GenerateOptions = {},
): Promise<NoteResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 1500;

  let draftPrompt = renderTemplate(prompts.draft, ctx);
  const appends: string[] = [];
  if (opts.feedbackRules?.trim()) {
    appends.push(`Additional rules from prior feedback:\n${opts.feedbackRules.trim()}`);
  }
  if (opts.goldenExamples?.trim()) {
    appends.push(
      "Below are example notes whose style and structure to follow. Use the SAME structure and " +
        "templated phrasing for every student in a session — vary only each student's specific details; " +
        "do not reach for synonyms or reword for variety between students.\n\n" +
        opts.goldenExamples.trim(),
    );
  }
  if (opts.varietyNote?.trim()) {
    appends.push(opts.varietyNote.trim());
  }
  if (appends.length > 0) draftPrompt += "\n\n" + appends.join("\n\n");
  opts.onPhase?.("draft");
  const draft = await callPass(apiKey, "draft", model, maxTokens, draftPrompt);

  opts.onPhase?.("review");
  const reviewed = await callPass(
    apiKey,
    "review",
    model,
    maxTokens,
    renderTemplate(prompts.review, { ...ctx, draftNote: draft }),
  );

  opts.onPhase?.("streamline");
  const streamlined = await callPass(
    apiKey,
    "streamline",
    model,
    maxTokens,
    renderTemplate(prompts.streamline, { ...ctx, draftNote: draft, reviewedNote: reviewed }),
  );
  const { note, warnings } = splitWarnings(streamlined);
  // Post-processing (e.g. a teacher append) applies to the note, not warnings.
  const final = opts.postProcess ? opts.postProcess(note) : note;

  return { draft, reviewed, final, warnings };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
