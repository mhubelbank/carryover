// Tiny expression + template engine for teachers.json `sessionCaptures`.
// Intentionally minimal — supports just what the schema doc specifies:
//   - dotted paths: `student.needsBengali`, `activity.name`
//   - bare identifiers: resolve against current capture's field values
//   - `&&` between atoms
//   - `<path> startsWith "..."` operator
//   - `{path | default: "fallback"}` substitution in templates (single-brace)

import type { Student } from "./student";
import type { SessionCapture, Teacher } from "./teacher";

export interface EvalContext {
  student?: Student;
  // Free-form activity (typically the rendered ActivityDef with `name`, etc.).
  activity?: Record<string, unknown>;
  // Current capture's field-state values, keyed by field name.
  capture?: Record<string, unknown>;
}

// Truthy evaluation of a showIf / when expression. Empty/undefined → true.
export function evalCondition(expr: string | undefined, ctx: EvalContext): boolean {
  if (!expr || !expr.trim()) return true;
  const atoms = expr.split("&&").map((s) => s.trim()).filter(Boolean);
  for (const atom of atoms) {
    if (!evalAtom(atom, ctx)) return false;
  }
  return true;
}

function evalAtom(expr: string, ctx: EvalContext): boolean {
  const sw = /^(.+?)\s+startsWith\s+["'](.+?)["']\s*$/.exec(expr);
  if (sw) {
    const v = resolvePath(sw[1]!.trim(), ctx);
    return typeof v === "string" && v.startsWith(sw[2]!);
  }
  return truthy(resolvePath(expr, ctx));
}

function resolvePath(path: string, ctx: EvalContext): unknown {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  // Bare identifiers prefer current capture state; falling back to a top-level
  // key on the eval context (so e.g. `student` or `activity` standalone work).
  if (parts.length === 1) {
    const key = parts[0]!;
    if (ctx.capture && Object.prototype.hasOwnProperty.call(ctx.capture, key)) {
      return ctx.capture[key];
    }
    return (ctx as Record<string, unknown>)[key];
  }
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

// Renders a single-brace template ({path | default: "fallback"}) against the
// eval context. Distinct from the LLM-prompt renderer in notes.ts, which uses
// double-brace Mustache syntax.
export function renderCaptureTemplate(template: string, ctx: EvalContext): string {
  return template.replace(/\{([^{}]+)\}/g, (_, raw: string) => {
    const [path, ...filters] = raw.split("|").map((s) => s.trim());
    let v = resolvePath(path!, ctx);
    for (const f of filters) {
      const joinM = /^join\s*:\s*["'](.*?)["']\s*$/.exec(f);
      if (joinM && Array.isArray(v)) {
        v = v.join(joinM[1]);
        continue;
      }
      const defM = /^default\s*:\s*["'](.+?)["']\s*$/.exec(f);
      if (defM && (v == null || v === "" || (Array.isArray(v) && v.length === 0))) {
        v = defM[1];
      }
    }
    return v == null ? "" : String(v);
  });
}

// ---------------------------------------------------------------------------
// Higher-level helpers used by Generate
// ---------------------------------------------------------------------------

// Captures whose top-level `showIf` passes for this student (regardless of
// activity). Used to know which capture forms to render. Defensive against
// pre-migration teacher records that lack `sessionCaptures` entirely.
export function activeCapturesFor(teacher: Teacher, student: Student): SessionCapture[] {
  return (teacher.sessionCaptures ?? []).filter((c) => evalCondition(c.showIf, { student }));
}

// Build the `additionalContext` string by appending each active capture's
// promptInjection template (when its `when` condition is met by the capture
// state). Empty if no injections fire.
export function buildAdditionalContext(
  teacher: Teacher,
  student: Student,
  captureState: Record<string, Record<string, unknown>>,
): string {
  let out = "";
  for (const cap of activeCapturesFor(teacher, student)) {
    const inj = cap.promptInjection;
    if (!inj) continue;
    const state = captureState[cap.name] ?? {};
    const ctx: EvalContext = { student, capture: state };
    if (!evalCondition(inj.when, ctx)) continue;
    out += renderCaptureTemplate(inj.template, ctx);
  }
  return out;
}

// Builds the deterministic post-process function for a student. Walks captures
// with a `postProcess` block whose condition is met (typically a student attr
// like `student.needsSpanish`) and appends those strings to the final note.
export function buildPostProcess(
  teacher: Teacher,
  student: Student,
): ((finalNote: string) => string) | undefined {
  const appends: string[] = [];
  for (const cap of teacher.sessionCaptures ?? []) {
    const pp = cap.postProcess;
    if (!pp) continue;
    if (!evalCondition(pp.when, { student })) continue;
    appends.push(pp.appendToFinalNote);
  }
  if (appends.length === 0) return undefined;
  return (note: string) => note + appends.join("");
}

// If an active capture's activityDescriptionTemplate matches this activity
// (via the capture's `showIf` with the activity in scope), return the rendered
// description; otherwise return the default. The capture's own field state is
// threaded in as `capture` so the rewrite can interpolate per-session input
// (e.g. a multiselect of skills: `{skills | join: ", "}`).
export function applyActivityRewrite(
  teacher: Teacher,
  student: Student,
  activity: { name: string; additionalInfo?: string },
  captureState: Record<string, Record<string, unknown>>,
  defaultDescription: string,
): string {
  for (const cap of teacher.sessionCaptures ?? []) {
    if (!cap.activityDescriptionTemplate) continue;
    const ctx: EvalContext = { student, activity, capture: captureState[cap.name] ?? {} };
    if (!evalCondition(cap.showIf, ctx)) continue;
    return renderCaptureTemplate(cap.activityDescriptionTemplate, ctx);
  }
  return defaultDescription;
}
