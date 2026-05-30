// Tiny expression + template engine for teachers.json `sessionCaptures`.
// Intentionally minimal — supports just what the schema doc specifies:
//   - dotted paths: `student.needsBengali`, `activity.name`
//   - bare identifiers: resolve against current capture's field values
//   - `&&` between atoms
//   - `<path> startsWith "..."` operator
//   - `{path | default: "fallback"}` substitution in templates (single-brace)

import { attributeSatisfied } from "./activity";
import { studentContext, type Student } from "./student";
import type { Activity, SessionCapture, Teacher } from "./teacher";

export interface EvalContext {
  // The flattened student (base columns + custom field values), via studentContext.
  student?: Record<string, unknown>;
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
  // Membership: `student.language includes "Spanish"`. For a multi-select field
  // (string[]) checks array membership; for a plain string, equality.
  const inc = /^(.+?)\s+includes\s+["'](.*?)["']\s*$/.exec(expr);
  if (inc) {
    const v = resolvePath(inc[1]!.trim(), ctx);
    return Array.isArray(v) ? v.includes(inc[2]) : v === inc[2];
  }
  // Equality: `activity.id == "a_journal"`. Lets captures bind to an activity by
  // its stable catalog id rather than a (renameable) display name.
  const eq = /^(.+?)\s*==\s*["'](.*?)["']\s*$/.exec(expr);
  if (eq) {
    return resolvePath(eq[1]!.trim(), ctx) === eq[2];
  }
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
    // A bare array (e.g. `{options}` with no explicit join filter) reads as a
    // comma-separated list rather than the default JS "a,b" stringification.
    if (Array.isArray(v)) return v.join(", ");
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
  const s = studentContext(student);
  return (teacher.sessionCaptures ?? []).filter((c) => evalCondition(c.showIf, { student: s }));
}

// Captures whose `showIf` matches a specific activity (and that have form
// fields) — rendered on the activity card in Generate so activity-scoped inputs
// like the pragmatic-skills multiselect appear only when that activity is picked.
export function activityCapturesFor(
  teacher: Teacher,
  activity: { id: string; name: string },
): SessionCapture[] {
  return (teacher.sessionCaptures ?? []).filter(
    (c) => (c.fields?.length ?? 0) > 0 && evalCondition(c.showIf, { activity }),
  );
}

// Build the `additionalContext` string by appending each active capture's
// promptInjection template (when its `when` condition is met by the capture
// state). Empty if no injections fire.
export function buildAdditionalContext(
  teacher: Teacher,
  student: Student,
  captureState: Record<string, Record<string, unknown>>,
): string {
  const s = studentContext(student);
  let out = "";
  for (const cap of activeCapturesFor(teacher, student)) {
    const inj = cap.promptInjection;
    if (!inj) continue;
    const state = captureState[cap.name] ?? {};
    const ctx: EvalContext = { student: s, capture: state };
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
  const s = studentContext(student);
  const appends: string[] = [];
  for (const cap of teacher.sessionCaptures ?? []) {
    const pp = cap.postProcess;
    if (!pp) continue;
    if (!evalCondition(pp.when, { student: s })) continue;
    appends.push(pp.appendToFinalNote);
  }
  if (appends.length === 0) return undefined;
  return (note: string) => note + appends.join("");
}

// Resolve the activity description, with two ordered rewrite sources. In
// practice only one fires per activity; the ordering is a safety net:
//   1. The catalog activity's own `descriptionTemplate` (attribute-driven —
//      e.g. the journal entry's "{student.journalMethod}"), applied when its
//      `requiresAttribute` is satisfied.
//   2. A session capture's `activityDescriptionTemplate` (form-driven — e.g.
//      José's pragmatic skills multiselect), matched by activity id. The
//      capture's field state is threaded in as `capture` so the rewrite can
//      interpolate per-session input (`{skills | join: ", "}`).
//   3. Otherwise the default description.
export function applyActivityRewrite(
  teacher: Teacher,
  student: Student,
  activity: Activity,
  additionalInfo: string,
  captureState: Record<string, Record<string, unknown>>,
  defaultDescription: string,
  selectedOptions: string[] = [],
): string {
  // Eval/template context exposes the activity's id + name + per-session info.
  const actx = { id: activity.id, name: activity.name, additionalInfo };
  const s = studentContext(student);

  // Activity-native per-student options (e.g. pragmatic skills). Only rewrites
  // when the student actually picked something — an empty selection falls
  // through to the default description (avoids "…by  while …").
  const pso = activity.perStudentOptions;
  if (pso?.template && selectedOptions.length > 0) {
    const ctx: EvalContext = {
      student: s,
      activity: actx,
      capture: { options: selectedOptions, info: additionalInfo, name: activity.name },
    };
    return renderCaptureTemplate(pso.template, ctx);
  }

  if (activity.descriptionTemplate && attributeSatisfied(activity, student)) {
    return renderCaptureTemplate(activity.descriptionTemplate, { student: s, activity: actx });
  }

  for (const cap of teacher.sessionCaptures ?? []) {
    if (!cap.activityDescriptionTemplate) continue;
    const ctx: EvalContext = { student: s, activity: actx, capture: captureState[cap.name] ?? {} };
    if (!evalCondition(cap.showIf, ctx)) continue;
    return renderCaptureTemplate(cap.activityDescriptionTemplate, ctx);
  }
  return defaultDescription;
}
