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
// done correctly is split into a BASE-form verb ("answer") and its object
// ("wh questions"). The sentence builder conjugates to past for the success
// clause ("answered") and uses the base for the miss clause ("did not answer").
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

// Common irregular verbs a clinician might enter as a base measuredVerb.
const IRREGULAR_PAST: Record<string, string> = {
  make: "made",
  give: "gave",
  tell: "told",
  retell: "retold",
  write: "wrote",
  read: "read",
  say: "said",
  choose: "chose",
  take: "took",
  hold: "held",
  find: "found",
  draw: "drew",
  build: "built",
  speak: "spoke",
  understand: "understood",
  spell: "spelled",
  show: "showed",
};

// Conjugate a base-form verb to simple past (US spelling, no consonant doubling).
// Tolerant: a value already in past tense (legacy data) is returned unchanged.
export function pastTense(verb: string): string {
  const w = verb.trim();
  if (!w) return w;
  if (IRREGULAR_PAST[w.toLowerCase()]) return IRREGULAR_PAST[w.toLowerCase()]!;
  if (/ed$/i.test(w)) return w; // already past tense (legacy data)
  if (/e$/i.test(w)) return `${w}d`; // produce → produced, sequence → sequenced
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ied`; // identify → identified
  return `${w}ed`; // answer → answered, maintain → maintained
}

// Base form of a verb. New data stores base already (passes through); legacy
// past-tense data ("answered") is stripped back so the miss clause reads right.
export function baseForm(verb: string): string {
  const w = verb.trim();
  if (/ied$/i.test(w)) return `${w.slice(0, -3)}y`; // identified → identify
  if (/ed$/i.test(w)) return w.slice(0, -2); // answered → answer (base form has no "ed")
  return w;
}

// Join trial-result clauses: 1 → "a"; 2 → "a and b"; 3+ → "a, b, and c".
function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

// One measurement's data sentence (the live-preview contract). "" when incomplete.
// Form: "{Name} correctly {past-verb} {c1}/{total} {noun} given {phrase1}[, {c2}/{total}
// given {phrase2}][, and {cN}/{total} given {phraseN}]." Rows are listed by count
// descending; the noun appears only after the first fraction. A miss clause
// ("{Pron} did not {verb} {miss}/{total} {noun}.") is added only when there are 2+
// support rows — with a single row the miss is trivially derivable, so it's omitted.
//
// `pastForms` is an optional base→past map (e.g. from an LLM conjugation pass at
// generation time, which handles irregulars); when a verb is absent it falls back
// to the rules-based pastTense(). The live form preview passes nothing (rules only).
export function trialEntrySentence(
  studentName: string,
  pronoun: string,
  e: TrialEntry,
  pastForms?: Record<string, string>,
): string {
  const total = e.total.trim();
  const base = baseForm(e.verb);
  const noun = (e.noun ?? "").trim();
  if ((!base && !noun) || !total) return "";
  const rows = (e.rows ?? [])
    .filter((r) => num(r.count) > 0)
    .sort((a, b) => num(b.count) - num(a.count)); // descending by count
  if (rows.length === 0) return "";
  const parts = rows.map((r, i) => {
    const head = i === 0 && noun ? `${num(r.count)}/${total} ${noun}` : `${num(r.count)}/${total}`;
    return `${head} given ${trialSupportPhrase(r)}`;
  });
  const Pron = pronoun ? pronoun.charAt(0).toUpperCase() + pronoun.slice(1) : "They";
  const past = pastForms?.[base.toLowerCase()] ?? pastTense(base);
  let s = `${studentName} correctly ${past} ${joinClauses(parts)}.`;
  const failed = trialFailed(e);
  if (rows.length >= 2 && failed > 0) {
    s += ` ${Pron} did not ${base}${noun ? ` ${failed}/${total} ${noun}` : ` ${failed}/${total}`}.`;
  }
  return normalizeAcronyms(s);
}

// All of an activity's measurement sentences, joined (fed to the draft prompt).
export function trialSentence(
  studentName: string,
  pronoun: string,
  t: TrialData,
  pastForms?: Record<string, string>,
): string {
  if (!t.enabled) return "";
  return (t.entries ?? [])
    .map((e) => trialEntrySentence(studentName, pronoun, e, pastForms))
    .filter(Boolean)
    .join(" ");
}

// Trial sentences are reproduced into the note verbatim, but LLMs can't be
// trusted to copy prose exactly (they re-punctuate, fuse, or drop clauses). So
// instead the note carries an opaque token per activity, which is replaced with
// the exact sentence in code after all passes. The token is keyed by the
// activity's index in the rendered list (guaranteed unique).
export function trialToken(index: number): string {
  return `[[TRIAL:${index}]]`;
}

const TRIAL_TOKEN_RE = /\[\[TRIAL:\d+\]\]/g;

// Replace each [[TRIAL:n]] token in the note with its exact sentence. Tokens the
// model dropped have their sentence appended (data is never lost); stray tokens
// with no mapping are stripped. Returns the spliced note.
export function spliceTrials(note: string, replacements: Record<string, string>): string {
  // The token is a complete sentence, but the model sometimes mis-places it: as
  // the object of "given" (a prompting phrase it isn't), or with a redundant
  // period right after it (the trial text already ends in one). It also sometimes
  // leaves an orphan "prompting" fragment beside it (the activity's prompting is
  // already inside the token). Normalize those boundaries before substituting.
  let out = note
    .replace(/\s*,?\s*\bgiven\s+(\[\[TRIAL:\d+\]\])/gi, ". $1")
    .replace(/(\[\[TRIAL:\d+\]\])\s*\.(?=\s|$)/g, "$1")
    // Orphan "given prompting" (no level/type between) only appears when the model
    // botches a trial activity — a real clause is always "{level} {type} prompting".
    .replace(/\s*,?\s*\bgiven\s+prompting\b/gi, "");
  const dropped: string[] = [];
  for (const [token, sentence] of Object.entries(replacements)) {
    if (out.includes(token)) {
      out = out.split(token).join(sentence);
    } else {
      dropped.push(sentence);
    }
  }
  // Any token without a mapping (shouldn't happen) — remove it cleanly.
  out = out.replace(TRIAL_TOKEN_RE, "");
  if (dropped.length > 0) {
    console.warn(`spliceTrials: ${dropped.length} trial token(s) missing from the note; appending.`);
    out = `${out.trim()} ${dropped.join(" ")}`;
  }
  // Tidy: drop a lone "prompting." sentence (orphan fragment the model left next
  // to a trial token), then collapse double spaces/periods and space-before-punct.
  return out
    .replace(/([.!?])\s+prompting\.(?=\s|$)/gi, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([.,;])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}
