// Pre-written sample note for Demo mode (no real LLM call, no API key). Rather than
// mashing the form's activity with a random domain, it derives a coherent, clinical-
// sounding note from the student's actual goal — so it always reads like a real note,
// varying per student and per regeneration.
import type { Student } from "../domain/student";
import type { Goal } from "../domain/goal";
import { fullName } from "../domain/student";
import { normalizeAcronyms } from "../domain/text";

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const pick = <T>(arr: T[], seed: string): T => arr[hash(seed) % arr.length]!;

function subjectPronoun(p: string): string {
  const l = (p || "they/them").toLowerCase();
  if (l.includes("she")) return "She";
  if (l.includes("he")) return "He";
  return "They";
}
function possessive(p: string): string {
  const l = (p || "they/them").toLowerCase();
  if (l.includes("she")) return "her";
  if (l.includes("he")) return "his";
  return "their";
}

const PAST: Record<string, string> = {
  answer: "answered", identify: "identified", produce: "produced", request: "requested",
  make: "made", take: "took", name: "named",
};
const past = (v: string) => PAST[v] ?? (v.endsWith("e") ? `${v}d` : `${v}ed`);

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Map a long-term goal to a language domain + a natural activity context, so the
// note's framing matches the goal instead of a random label.
function framing(longTermGoal: string): { domain: string; context: string } {
  const g = longTermGoal.toLowerCase();
  if (g.includes("text") || g.includes("comprehend"))
    return { domain: "receptive language", context: "during a guided reading activity" };
  if (g.includes("speech sound") || g.includes("articulat"))
    return { domain: "speech production", context: "during structured articulation practice" };
  if (g.includes("conversation") || g.includes("pragmatic"))
    return { domain: "pragmatic language", context: "during a small-group conversation" };
  if (g.includes("vocabulary"))
    return { domain: "expressive vocabulary", context: "during a vocabulary activity" };
  if (g.includes("communicat"))
    return { domain: "expressive language", context: "during a structured communication activity" };
  return { domain: "communication", context: "during a structured activity" };
}

interface ClosingCtx {
  name: string;
  subj: string; // lowercased subject pronoun
  poss: string;
  domain: string;
  ltg1: string; // first long-term goal
  short1: string; // first goal's terse label
  ltgs: string[]; // distinct long-term goals
}

// Closing sentence variants — selected without replacement across a session (by the
// student's index), so a batch of notes doesn't repeat the same phrasing.
const CLOSINGS: ((c: ClosingCtx) => string)[] = [
  (c) => `This work supported ${c.domain} and ${c.poss} progress toward ${c.ltg1}.`,
  (c) => `This session targeted ${c.poss} long-term goals of ${joinList(c.ltgs)}.`,
  (c) => `Overall, the activity built ${c.domain} and reinforced ${c.poss} work on ${c.short1}.`,
  (c) => `This supported ${c.domain}, advancing ${c.poss} progress in ${c.ltg1}.`,
  (c) => `The session strengthened ${c.domain} as ${c.subj} worked toward ${c.ltg1}.`,
  (c) => `This developed ${c.domain} and supported ${c.poss} goal of ${c.ltg1}.`,
  (c) => `Across the activity, ${c.name} made meaningful progress on ${c.short1}.`,
];

export function cannedNote(opts: {
  student: Student;
  goals?: Goal[];
  index?: number; // position in the session batch (for without-replacement closings)
  variant?: number; // regeneration nonce
}): string {
  const { student } = opts;
  const goals = (opts.goals ?? []).filter((g) => !g.archived);
  const goal = goals[0];
  const seed = `${student.id}:${opts.variant ?? 0}`;
  const name = (student.firstName || fullName(student) || "The student").trim();
  const Subj = subjectPronoun(student.pronouns);
  const poss = possessive(student.pronouns);
  const level = pick(["minimal", "moderate", "significant"], seed + "lvl");
  const type = pick(["verbal", "visual", "tactile"], seed + "typ");
  const response = pick(
    [
      `${Subj} stayed engaged and required occasional redirection to task`,
      `${Subj} participated actively and responded well to cueing`,
      `${Subj} showed steady effort across the activity`,
    ],
    seed + "rsp",
  );

  if (!goal) {
    return `${name} participated in a structured language activity, given ${level} ${type} prompting. ${response}. This work supported ${poss} communication goals.`;
  }

  const { domain, context } = framing(goal.longTermGoal);
  const action = `${past(goal.measuredVerb)} ${normalizeAcronyms(goal.measuredNoun)}`.trim();
  const closing = CLOSINGS[((opts.index ?? 0) + (opts.variant ?? 0)) % CLOSINGS.length]!({
    name,
    subj: Subj.toLowerCase(),
    poss,
    domain,
    ltg1: goal.longTermGoal,
    short1: goal.shortName || goal.longTermGoal,
    ltgs: [...new Set(goals.map((g) => g.longTermGoal))],
  });
  return `${name} ${action} ${context}, given ${level} ${type} prompting. ${response}. ${closing}`;
}
