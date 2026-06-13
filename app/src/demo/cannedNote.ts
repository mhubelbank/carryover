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
  (c) => `This activity built ${c.domain}, carrying over ${c.poss} skills toward ${c.ltg1}.`,
  (c) => `The work addressed ${c.domain}, continuing ${c.poss} goals of ${joinList(c.ltgs)}.`,
  (c) => `This session advanced ${c.domain} and ${c.poss} steady progress on ${c.short1}.`,
  (c) => `Together this strengthened ${c.domain}, supporting ${c.name}'s work toward ${c.ltg1}.`,
  (c) => `This reinforced ${c.domain} as part of ${c.poss} broader goal of ${c.ltg1}.`,
];

// A "level type prompting" phrase from the form's selections (e.g. ["minimal",
// "moderate"] + ["verbal","visual"] → "minimal to moderate verbal and visual
// prompting"), or "" when the form had none.
function promptingPhrase(levels: string[], types: string[]): string {
  const lvl = levels.filter(Boolean).join(" to ");
  const typ = joinList(types.filter(Boolean));
  const parts = [lvl, typ].filter(Boolean).join(" ");
  return parts ? `${parts} prompting` : "";
}

export function cannedNote(opts: {
  student: Student;
  goals?: Goal[];
  index?: number; // position in the session batch (for without-replacement closings)
  variant?: number; // regeneration nonce
  promptLevels?: string[]; // prompting captured in the form, used as-is when present
  promptTypes?: string[];
}): string {
  const { student } = opts;
  const goals = (opts.goals ?? []).filter((g) => !g.archived);
  const goal = goals[0];
  const idx = (opts.index ?? 0) + (opts.variant ?? 0);
  const seed = `${student.id}:${opts.variant ?? 0}`;
  const name = (student.firstName || fullName(student) || "The student").trim();
  const Subj = subjectPronoun(student.pronouns);
  const poss = possessive(student.pronouns);
  const { domain, context } = goal
    ? framing(goal.longTermGoal)
    : { domain: "communication", context: "during a structured language activity" };
  // Use the prompting the clinician entered in the form; fall back to a pick when
  // nothing was captured so the sentence still reads.
  const prompting =
    promptingPhrase(opts.promptLevels ?? [], opts.promptTypes ?? []) ||
    `${pick(["minimal", "moderate", "significant"], seed + "lvl")} ${pick(["verbal", "visual", "tactile"], seed + "typ")} prompting`;
  // Response varies without replacement across the session (like the closings).
  const responses = [
    `${Subj} stayed engaged and required occasional redirection to task`,
    `${Subj} participated actively and responded well to cueing`,
    `${Subj} showed steady effort across the activity`,
    `${Subj} attended well and benefited from repeated models`,
    `${Subj} remained on task with periodic encouragement`,
    `${Subj} engaged readily and self-corrected when given feedback`,
  ];
  const response = responses[idx % responses.length]!;

  if (!goal) {
    return `${name} participated ${context}, given ${prompting}. ${response}. This work supported ${poss} communication goals.`;
  }

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
  return `${name} ${action} ${context}, given ${prompting}. ${response}. ${closing}`;
}
