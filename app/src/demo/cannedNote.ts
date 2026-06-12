// Pre-written sample note for Demo mode (no real LLM call, no API key). Produces a
// believable clinical note that varies per student and per regeneration, drawing on
// the student's name, pronouns, the chosen activity, and a goal — so the demo shows
// the shape of a generated note without contacting any model.
import type { Student } from "../domain/student";
import { fullName } from "../domain/student";

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: string): T {
  return arr[hash(seed) % arr.length]!;
}

function subjectPronoun(pronouns: string): string {
  const p = (pronouns || "they/them").toLowerCase();
  if (p.includes("she")) return "She";
  if (p.includes("he")) return "He";
  return "They";
}

export function cannedNote(opts: {
  student: Student;
  activityNames: string[];
  goalLabels: string[];
  variant?: number;
}): string {
  const seed = `${opts.student.id}:${opts.variant ?? 0}`;
  const name = (opts.student.firstName || fullName(opts.student) || "The student").trim();
  const Subj = subjectPronoun(opts.student.pronouns);
  const subj = Subj.toLowerCase();
  const activity = (opts.activityNames[0] ?? "a structured activity").toLowerCase();
  const level = pick(["minimal", "moderate", "significant"], seed + "lvl");
  const type = pick(["verbal", "visual", "tactile"], seed + "typ");
  const response = pick(
    [
      `${Subj} responded consistently and stayed engaged throughout`,
      `${Subj} participated actively, with occasional redirection to task`,
      `${Subj} showed steady effort and benefited from intermittent support`,
    ],
    seed + "rsp",
  );
  const domain = pick(
    ["receptive language", "expressive language", "pragmatic language"],
    seed + "dom",
  );
  const goal = (opts.goalLabels[0] ?? "their communication goals").toLowerCase();
  return `${name} worked on ${activity}, given ${level} ${type} prompting. ${response}. This session built ${domain} as ${subj} worked toward ${goal}.`;
}
