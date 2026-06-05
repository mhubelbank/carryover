// Trials mode (per student per activity): structured trial-count capture that
// produces precise data sentences the note uses verbatim. Off by default.
//
// An activity can target multiple goals, and each goal is measured separately —
// so trials are a *list of per-goal measurements* (each tied to a goalId), not a
// single count for the whole activity.
import { normalizeAcronyms } from "./text";

export const TRIAL_SUPPORT_LEVELS = ["no support", "minimal", "moderate", "maximum"] as const;
export const TRIAL_SUPPORT_TYPES = ["verbal", "visual", "tactile", "gestural", "modeled"] as const;

export interface TrialSupportRow {
  level: string; // one of TRIAL_SUPPORT_LEVELS
  types: string[]; // subset of TRIAL_SUPPORT_TYPES
  count: string; // raw input; parsed when summing
}

// One measurement, tied to a goal (goalId "" = an unlinked/free count). What was
// done correctly is split into a past-tense verb ("answered") and its object
// ("wh questions") — mirroring the goal's measuredVerb/measuredNoun.
export interface TrialEntry {
  goalId: string;
  verb: string;
  noun: string;
  total: string;
  rows: TrialSupportRow[];
  // "" = use the auto value (total − Σ row counts); non-empty = explicit override.
  failed: string;
}

// The joined "what was done correctly" phrase ("answered wh questions"), or "".
export function trialEntryAction(e: TrialEntry): string {
  return [e.verb, e.noun].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
}

export interface TrialData {
  enabled: boolean;
  // How counts are entered: "summary" = type the totals; "live" = tap each trial
  // ✓/✗ as it happens. Both produce the SAME aggregate TrialEntry — order is not
  // stored. Defaults to "summary".
  method: "summary" | "live";
  entries: TrialEntry[];
}

export function blankTrialEntry(goalId = "", verb = "", noun = ""): TrialEntry {
  return { goalId, verb, noun, total: "", rows: [{ level: "minimal", types: [], count: "" }], failed: "" };
}

export function blankTrials(): TrialData {
  return { enabled: false, method: "summary", entries: [] };
}

const num = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

export function trialSupportTotal(e: TrialEntry): number {
  return (e.rows ?? []).reduce((sum, r) => sum + num(r.count), 0);
}

export function trialFailedAuto(e: TrialEntry): number {
  return Math.max(0, num(e.total) - trialSupportTotal(e));
}

export function trialFailed(e: TrialEntry): number {
  return e.failed.trim() !== "" ? num(e.failed) : trialFailedAuto(e);
}

// One tapped trial in "live" entry. A failure carries no support (failures only
// feed "did not do so on N trials"). Not persisted — order is recomputed from
// the aggregate when entering live mode and discarded when saving.
export interface TrialEvent {
  level: string;
  types: string[];
  ok: boolean;
}

// Expand a measurement's aggregate counts into an equivalent (order-arbitrary)
// list of tapped trials, so live mode can be entered without losing prior data.
export function expandEntryToEvents(e: TrialEntry): TrialEvent[] {
  const events: TrialEvent[] = [];
  for (const r of e.rows ?? []) {
    const n = num(r.count);
    for (let i = 0; i < n; i++) events.push({ level: r.level, types: [...r.types], ok: true });
  }
  const failed = trialFailed(e);
  for (let i = 0; i < failed; i++) events.push({ level: "", types: [], ok: false });
  return events;
}

// Collapse a tap list back into the aggregate fields (total/rows/failed),
// grouping successes by their support. This is the only thing that's stored.
export function eventsToPatch(events: TrialEvent[]): Pick<TrialEntry, "rows" | "total" | "failed"> {
  const ok = events.filter((e) => e.ok);
  const map = new Map<string, TrialSupportRow>();
  for (const e of ok) {
    const key = `${e.level}|${e.types.join(",")}`;
    const row = map.get(key);
    if (row) row.count = String(num(row.count) + 1);
    else map.set(key, { level: e.level, types: [...e.types], count: "1" });
  }
  const rows = [...map.values()];
  return {
    rows: rows.length ? rows : [{ level: "minimal", types: [], count: "" }],
    total: events.length ? String(events.length) : "",
    failed: String(events.length - ok.length),
  };
}

// A measurement is "started" once she's entered a total or any count — used to
// skip wholly-empty rows when generating/saving.
export function trialEntryStarted(e: TrialEntry): boolean {
  return e.total.trim() !== "" || trialSupportTotal(e) > 0;
}

// Validation message for a started entry, or null when fine.
export function trialError(e: TrialEntry): string | null {
  if (!trialEntryStarted(e)) return null;
  const total = num(e.total);
  if (total <= 0) return "Enter the total number of trials.";
  if (!trialEntryAction(e)) return "Say what was being counted (verb and noun).";
  const supported = trialSupportTotal(e);
  if (supported > total) return `Support rows add up to ${supported}, more than the ${total} total.`;
  if (e.failed.trim() !== "" && num(e.failed) + supported > total)
    return `Supported (${supported}) + failed (${num(e.failed)}) exceeds the ${total} total.`;
  return null;
}

// "minimal verbal prompting" / "moderate verbal prompting and an additional
// visual prompt" / "no support" — matching her established phrasing.
export function trialSupportPhrase(row: TrialSupportRow): string {
  if (row.level === "no support") return "no support";
  const [first, ...rest] = row.types ?? [];
  if (!first) return `${row.level} prompting`;
  let phrase = `${row.level} ${first} prompting`;
  if (rest.length > 0) phrase += ` and an additional ${rest.join(" and ")} prompt`;
  return phrase;
}

// One measurement's data sentence (the live-preview contract). "" when incomplete.
export function trialEntrySentence(studentName: string, pronoun: string, e: TrialEntry): string {
  const total = e.total.trim();
  const action = trialEntryAction(e);
  if (!action || !total) return "";
  const parts = (e.rows ?? [])
    .filter((r) => num(r.count) > 0)
    .map((r) => `${num(r.count)}/${total} given ${trialSupportPhrase(r)}`);
  if (parts.length === 0) return "";
  const Pron = pronoun ? pronoun.charAt(0).toUpperCase() + pronoun.slice(1) : "They";
  let s = `${studentName} correctly ${action} ${parts.join(", ")}.`;
  const failed = trialFailed(e);
  if (failed > 0) s += ` ${Pron} did not do so on ${failed}/${total} trials.`;
  return normalizeAcronyms(s);
}

// All of an activity's measurement sentences, joined (fed to the draft prompt).
export function trialSentence(studentName: string, pronoun: string, t: TrialData): string {
  if (!t.enabled) return "";
  return (t.entries ?? [])
    .map((e) => trialEntrySentence(studentName, pronoun, e))
    .filter(Boolean)
    .join(" ");
}
