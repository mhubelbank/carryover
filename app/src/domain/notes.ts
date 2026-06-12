import { callModel, llmErrorStatus, type LlmResponse } from "../clients/llm";
import { DEFAULT_MODEL, type Provider } from "../clients/models";
import type { GitHubClient } from "../clients/github";
import type { Mode } from "./teacher";
import { dropSelfCorrection, splitConcessive, normalizeAcronyms, streamlineLostClinicalDetail } from "./text";
import { limitMissSemicolons, spliceTrials } from "./trial";

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
}

// Render context: nested objects/arrays addressed by the templates (student,
// teacher, activities, selectedGoals, role, roleData, additionalContext, …).
export type TemplateContext = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Response cleaning
// ---------------------------------------------------------------------------

// Strips markdown/HTML artifacts Claude sometimes emits despite instructions.
// Superset of the variants across her seven TSX files (Dana's added the HTML
// strip). Applied after every pass; cleaned output of pass N feeds pass N+1.
export function cleanClaudeResponse(text: string): string {
  if (!text) return "";
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
  // Salvage a note where the model leaked its thinking ("Wait, I need to…") and
  // re-emitted the note, then split any concessive-fused affect ("…task, though
  // she was distracted"). Both are no-ops on a clean note.
  return splitConcessive(dropSelfCorrection(cleaned));
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
  provider?: Provider;
  model?: string;
  maxTokens?: number;
  // Contents of data/prompts/feedback-rules.md — appended to the DRAFT prompt only.
  feedbackRules?: string;
  // Example notes (data/prompts/golden_output.txt) — appended to the DRAFT prompt
  // as a style/structure reference.
  goldenExamples?: string;
  // Per-session variety instruction (date-derived) appended to the DRAFT prompt,
  // so the same student's notes don't read identically week to week.
  varietyNote?: string;
  // Deterministic per-teacher post-processing applied to the final note text
  // (e.g. Robin's Spanish-support sentence). No API call.
  postProcess?: (finalNote: string) => string;
  // Fired before each pass starts, so callers can show generation progress.
  onPhase?: (pass: Pass) => void;
}

// Conjugate base-form trial verbs to simple past via the model (reliable for
// irregulars — make→made — unlike a rules table). One batched call, fired when
// generation starts; the result is fed into the trial sentences. Returns a
// base→past map (lowercased keys); on any failure returns {} so callers fall back
// to the rules-based pastTense(). Never throws.
export async function conjugatePastForms(
  apiKey: string,
  verbs: string[],
  provider: Provider = "anthropic",
  model: string = DEFAULT_MODEL,
): Promise<Record<string, string>> {
  const unique = [...new Set(verbs.map((v) => v.trim().toLowerCase()).filter(Boolean))];
  if (unique.length === 0) return {};
  const prompt =
    "Give the simple past tense of each verb below. Reply with ONLY a JSON object " +
    "mapping each verb (exactly as given, lowercase) to its simple past tense — no other text.\n" +
    `Verbs: ${JSON.stringify(unique)}`;
  try {
    const res = await callModel(provider, apiKey, {
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.text;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return {};
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k.trim().toLowerCase()] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

// Section ordering and closing angle both rotate by `variant` (week index in the
// app, pass index in the eval) — so the same student's notes differ across weeks
// while staying consistent within a session. The closing angle is offset so it
// doesn't move in lockstep with the ordering.
// All keep the clinical opening (the student doing the activity) — never lead with
// affect/response, which doesn't read clinically.
const VARIETY_ORDERS = [
  "present the activities in the order they occurred",
  "when there are multiple activities, lead with the primary activity and its result, then the others",
  "present the activities in order, weaving the student's overall response in toward the end",
];
const CLOSING_ANGLES = [
  "begin the closing by naming the long-term goal being advanced, then how it was worked toward — this is the week that DOES reference the long-term goal",
  "begin the closing with a brief back-reference to the activity (e.g. \"This session,\" \"This work\") and what it built — never re-naming the activity or echoing the opening's wording — then the short-term goals; do NOT reference the long-term goal this week",
  "begin the closing with the language domain(s) addressed, then the short-term goals; do NOT reference the long-term goal this week",
];

// The per-session variety instruction appended to the draft prompt. `variant` is
// any integer; orders/angles are picked mod 3.
export function varietyNote(variant: number): string {
  const i = ((variant % 3) + 3) % 3;
  return (
    `Week-to-week variety: so this note doesn't read identically to the same student's notes from other weeks, ${VARIETY_ORDERS[i]}. ` +
    `For the closing sentence, ${CLOSING_ANGLES[(i + 1) % 3]}. ` +
    "Keep the same clinical vocabulary and the same per-student template — only the opening, the section order, and the closing's angle differ across weeks."
  );
}

const BACKOFF_MS = [1000, 3000, 10000];

// Non-negotiables sent as the system prompt on every pass. OpenAI models weight
// system instructions heavily, which measurably curbs invented detail and pronoun
// drift; Claude honors them too. Kept short so it reinforces, not competes with,
// the per-pass prompt.
const NOTE_SYSTEM =
  "You write professional SLP clinical session notes. Use ONLY the information provided — never " +
  "invent behaviors, details, numbers, or specifics that are not in the data. Do not add evaluative " +
  'or framing language that is not in the data — no "meaningful," "authentic," "valuable," "rich," ' +
  '"functional opportunities to practice," or "within an authentic … context"; state plainly what ' +
  "the student did. Use exactly the pronouns given for the student; never infer them from the " +
  "student's name. Output only the note text itself: no preamble, no questions, no commentary. One " +
  "paragraph, past tense.";

// One model call with transient-error backoff (429/5xx/network). Returns the raw
// response or throws after exhausting retries.
async function callWithRetry(
  apiKey: string,
  provider: Provider,
  model: string,
  maxTokens: number,
  prompt: string,
): Promise<LlmResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      return await callModel(provider, apiKey, {
        model,
        max_tokens: maxTokens,
        system: NOTE_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (err) {
      lastError = err;
      const status = llmErrorStatus(err);
      const retryable = status === undefined || status === 429 || (status >= 500 && status < 600);
      const wait = BACKOFF_MS[attempt];
      if (!retryable || wait === undefined) break;
      await delay(wait);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("model call failed");
}

async function callPass(
  apiKey: string,
  pass: Pass,
  provider: Provider,
  model: string,
  maxTokens: number,
  prompt: string,
): Promise<string> {
  try {
    let res = await callWithRetry(apiKey, provider, model, maxTokens, prompt);
    // Reasoning models (GPT-5 family) can spend the token budget on hidden
    // reasoning and return a cut-off note; give it one retry at double the
    // ceiling before accepting a truncated result.
    if (res.truncated) {
      res = await callWithRetry(apiKey, provider, model, maxTokens * 2, prompt);
    }
    return cleanClaudeResponse(res.text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    throw new Error(`${pass} pass failed: ${detail}`);
  }
}

// Run the three sequential passes for one student. {{draftNote}} and
// {{reviewedNote}} are injected between passes; each result is cleaned.
export async function generateNote(
  apiKey: string,
  prompts: PromptSet,
  ctx: TemplateContext,
  opts: GenerateOptions = {},
): Promise<NoteResult> {
  const provider = opts.provider ?? "anthropic";
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
  const draft = await callPass(apiKey, "draft", provider, model, maxTokens, draftPrompt);

  opts.onPhase?.("review");
  const reviewed = await callPass(
    apiKey,
    "review",
    provider,
    model,
    maxTokens,
    renderTemplate(prompts.review, { ...ctx, draftNote: draft }),
  );

  opts.onPhase?.("streamline");
  const streamlined = await callPass(
    apiKey,
    "streamline",
    provider,
    model,
    maxTokens,
    renderTemplate(prompts.streamline, { ...ctx, draftNote: draft, reviewedNote: reviewed }),
  );
  // If the streamline pass dropped clinical detail the review had (a redirection
  // clause, or all prompting), it regressed — keep the clean review note instead.
  const finalSource = streamlineLostClinicalDetail(reviewed, streamlined) ? reviewed : streamlined;
  // Splice the exact trial sentences back in for any [[TRIAL:n]] tokens the note
  // carried through the passes (regularContext put them there). Collapse any
  // internal line breaks the model inserted — the note is one continuous paragraph.
  const replacements = (ctx.trialReplacements as Record<string, string> | undefined) ?? {};
  const note = limitMissSemicolons(
    spliceTrials(finalSource.trim(), replacements).replace(/\s*\n\s*/g, " "),
  );
  // Post-processing (e.g. a teacher append), then force acronym casing ("wh" → "WH").
  const final = normalizeAcronyms(opts.postProcess ? opts.postProcess(note) : note);

  return { draft, reviewed, final };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
