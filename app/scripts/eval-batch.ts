// Batch note generator for manual bulk quality review. Runs N passes × M
// students through the live pipeline with randomized (but reproducible, per
// SEED) activities / goals / prompting / trials, and writes every note plus its
// inputs to a markdown file for eyeballing. Synthetic data only — fake names,
// generic goals — so no PII.
//
//   ANTHROPIC_API_KEY=... GITHUB_TOKEN=... npx tsx scripts/eval-batch.ts [passes] [students]
//   npx tsx scripts/eval-batch.ts --dry            # build inputs only, no API
//   SEED=7 npx tsx scripts/eval-batch.ts 4 8        # 4 passes of 8 students
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildRegularActivities,
  regularContext,
  type ActivityDef,
  type ActivityInput,
} from "../src/domain/generate";
import { generateNote, type TemplateContext } from "../src/domain/notes";
import type { Teacher } from "../src/domain/teacher";
import type { TrialData, TrialEntry } from "../src/domain/trial";
import { getGolden, getPrompts, mapPool, requireEnv } from "./_shared";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry") || process.env.DRY === "1";
const nums = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const PASSES = nums[0] ?? (process.env.PASSES ? Number(process.env.PASSES) : 3);
const STUDENTS = nums[1] ?? (process.env.STUDENTS ? Number(process.env.STUDENTS) : 5);
const SEED = process.env.SEED ? Number(process.env.SEED) : 1;

// Seeded PRNG (mulberry32) so a given SEED reproduces the same batch.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(SEED);
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
const pickSome = <T>(arr: T[], n: number): T[] => [...arr].sort(() => rand() - 0.5).slice(0, n);
const chance = (p: number) => rand() < p;

// --- synthetic pools (no PII) ---
const NAMES = ["Sam", "Theo", "Mia", "Alex", "Jordan", "Riley", "Casey", "Quinn", "Noa", "Eli", "Tess", "Omar"];
const PRONOUNS: [string, string][] = [["he", "he/him"], ["she", "she/her"], ["they", "they/them"]];
const TEACHER: Teacher = {
  id: "t1", name: "Carter", color: "purple", modes: ["regular"],
  activityIds: [], newsRoleIds: [], sessionCaptures: [], archived: false,
};
const ACTIVITIES = [
  { desc: "read a short passage and answered comprehension questions about it", domains: ["receptive"] },
  { desc: "sorted picture cards into categories and explained the grouping", domains: ["expressive", "receptive"] },
  { desc: "practiced requesting items during a structured snack routine", domains: ["pragmatic", "expressive"] },
  { desc: "described a sequence of events from a wordless picture book", domains: ["expressive"] },
  { desc: "took turns in a board game while practicing topic maintenance", domains: ["pragmatic"] },
  { desc: "produced target sounds in structured word and phrase drills", domains: ["expressive"] },
];
// Each goal carries the domain(s) it belongs to, so it's only paired with an
// activity that shares a domain — keeping synthetic sessions plausible (e.g. an
// articulation goal never lands on a reading-comprehension task) and the note's
// domain label consistent with its goals.
// Trials measure a base-form verb + a PLURAL count noun (measuredVerb/measuredNoun
// in the real form), e.g. "answer" + "WH questions" → "answered 4/10 WH questions".
const GOALS = [
  { short: "answer WH questions", verb: "answer", noun: "WH questions", full: "Given a familiar story, the student will answer who, what, and where questions with no more than one prompt.", domains: ["receptive", "expressive"] },
  { short: "sequence picture cards", verb: "sequence", noun: "picture cards", full: "The student will sequence 3–4 picture cards to retell an event in the correct order.", domains: ["receptive", "expressive"] },
  { short: "initiate requests", verb: "initiate", noun: "requests", full: "The student will independently initiate a request using a three-word phrase in 4 of 5 opportunities.", domains: ["pragmatic", "expressive"] },
  { short: "produce target sounds", verb: "produce", noun: "target sounds", full: "The student will produce target sounds in the initial position of words at the phrase level with 80% accuracy.", domains: ["expressive"] },
  { short: "make on-topic comments", verb: "make", noun: "on-topic comments", full: "The student will make on-topic comments during a structured conversation in 4 of 5 opportunities.", domains: ["pragmatic"] },
  { short: "identify the main idea", verb: "identify", noun: "main ideas", full: "After a short text, the student will identify the main idea in a complete sentence with no more than one cue.", domains: ["receptive"] },
];
const LEVELS = ["minimal", "moderate", "significant"];
const TYPES = ["verbal", "visual", "gestural", "tactile", "modeled"];
const REDIRECTION = ["regular", "occasional", "continuous"];
const RESPONSE = ["enthusiastic", "engaged", "alert", "distracted", "tired"];

function trialFor(goal: { short: string; verb: string; noun: string }): TrialEntry {
  const total = pick([5, 8, 10]);
  // Usually one support row; sometimes split successes across 2–3 distinct
  // prompting conditions to exercise the multi-row sentence (descending list +
  // miss clause). Each row gets ≥1; multi-row always leaves ≥1 miss.
  const nRows = chance(0.5) ? 1 : chance(0.5) ? 3 : 2;
  const levels = pickSome(LEVELS, Math.min(nRows, LEVELS.length));
  let pool = Math.min(total - (levels.length >= 2 ? 1 : 0), Math.max(levels.length, Math.round(total * (0.5 + rand() * 0.4))));
  const rows = levels.map((level, i) => {
    const count = i === levels.length - 1 ? Math.max(1, pool) : Math.max(1, Math.floor(pool / (levels.length - i)));
    pool -= count;
    return { level, types: pickSome(TYPES, 1), count: String(count) };
  });
  return { goalId: goal.short, verb: goal.verb, noun: goal.noun, total: String(total), rows, failed: "" };
}

interface BuiltStudent {
  name: string;
  pronoun: string;
  summary: string[];
  ctx: TemplateContext;
}

function buildStudent(): BuiltStudent {
  const name = pick(NAMES);
  const [pronoun, pronouns] = pick(PRONOUNS);
  const acts = pickSome(ACTIVITIES, 1 + (chance(0.5) ? 1 : 0));
  const defs: ActivityDef[] = [];
  const inputs: ActivityInput[] = [];
  const summary: string[] = [];

  acts.forEach((a, i) => {
    const compatible = GOALS.filter((g) => g.domains.some((d) => a.domains.includes(d)));
    const goals = pickSome(compatible, 1 + (chance(0.4) ? 1 : 0));
    const useTrials = chance(0.5);
    const trials: TrialData = useTrials
      ? { enabled: true, method: "summary", entries: goals.map((g) => trialFor(g)) }
      : { enabled: false, method: "summary", entries: [] };
    const input: ActivityInput = {
      goals: goals.map((g) => g.short),
      goalDetails: goals.map((g) => g.full),
      promptingLevel: useTrials ? [] : [pick(LEVELS)],
      promptingType: useTrials ? [] : pickSome(TYPES, 1 + Math.floor(rand() * 2)),
      redirection: chance(0.4) ? [pick(REDIRECTION)] : [],
      response: [pick(RESPONSE)],
      additionalNotes: "",
      captures: {},
      options: [],
      trials,
    };
    defs.push({ activityId: `a${i + 1}`, additionalInfo: "", segmentName: "", domains: a.domains });
    inputs.push(input);
    const metric = useTrials
      ? `trials ${trials.entries
          .map((e) => `${e.verb} ${e.noun} [${e.rows.map((r) => `${r.count}/${e.total} ${r.level} ${r.types.join("+")}`).join(", ")}]`)
          .join("; ")}`
      : `prompting ${input.promptingLevel.join("")} ${input.promptingType.join("+")}`;
    summary.push(
      `${a.desc} — goals: ${goals.map((g) => g.short).join(", ")}; ${metric}` +
        `${input.redirection.length ? `; redirection ${input.redirection[0]}` : ""}; ${input.response[0]}`,
    );
  });

  const activities = buildRegularActivities(defs, inputs, (_d, i) => acts[i]!.desc, name, pronoun);
  const ctx = regularContext({ studentName: name, pronouns, pronoun, individualSession: false, teacher: TEACHER, activities });
  return { name, pronoun, summary, ctx };
}

// Build all sessions up front (reproducible from SEED).
const sessions = Array.from({ length: PASSES }, () =>
  Array.from({ length: STUDENTS }, () => buildStudent()),
);

mkdirSync("eval-output", { recursive: true });
const outPath = `eval-output/batch-seed${SEED}-${PASSES}x${STUDENTS}${dry ? "-dry" : ""}.md`;
let md = `# Note batch — ${PASSES} passes × ${STUDENTS} students (seed ${SEED})\n\n`;

const flat = sessions.flatMap((students, p) => students.map((s, j) => ({ p, j, s })));
const finals: { final: string }[] = [];

if (dry) {
  console.log(`DRY: built ${PASSES}×${STUDENTS} = ${flat.length} contexts (no generation).`);
  flat.forEach(() => finals.push({ final: "_(dry run — no note generated)_" }));
} else {
  const apiKey = requireEnv("ANTHROPIC_API_KEY");
  const prompts = await getPrompts("regular");
  const golden = await getGolden();
  console.log(`Generating ${flat.length} notes${golden ? " (with golden examples)" : ""}…`);
  let done = 0;
  const results = await mapPool(flat, 4, async ({ s }) => {
    const r = await generateNote(apiKey, prompts, s.ctx, { maxTokens: 1500, goldenExamples: golden }).catch(
      (e): { final: string } => ({
        final: `[generation error: ${e instanceof Error ? e.message : String(e)}]`,
      }),
    );
    process.stdout.write(`\r  ${++done}/${flat.length}`);
    return r;
  });
  process.stdout.write("\n");
  finals.push(...results);
}

flat.forEach(({ p, j, s }, idx) => {
  if (j === 0) md += `## Pass ${p + 1}\n\n`;
  md += `### ${p + 1}.${j + 1} — ${s.name} (${s.pronoun})\n`;
  s.summary.forEach((line) => (md += `- ${line}\n`));
  md += `\n${finals[idx]!.final}\n`;
  md += `\n---\n\n`;
});

writeFileSync(outPath, md);
console.log(`Wrote ${outPath}`);
