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

export function cannedNote(opts: { student: Student; goal?: Goal; variant?: number }): string {
  const { student, goal } = opts;
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
  return (
    `${name} ${action} ${context}, given ${level} ${type} prompting. ` +
    `${response}. ` +
    `This work supported ${domain} and ${poss} progress toward ${goal.longTermGoal}.`
  );
}
