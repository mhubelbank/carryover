// Measure per-note token usage for every model in the picker and write the
// numbers back into each MODEL_CHOICES entry's `noteTokens` (plus the MEASURED_ON
// date and BASELINE_PROMPT_CHARS), so the cost estimates in Settings stay current.
//
//   ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GITHUB_TOKEN=… npx tsx scripts/measure-prices.ts
//   PROMPTS_DIR=/path/to/data/prompts   measure against local (current) prompts
//   SAMPLES=5                           notes per model (default 3; counts are stable)
//
// Pause/resume: if a provider runs out of credits mid-run, the script saves the
// models measured so far to a progress file and stops without touching models.ts.
// Top up and re-run — it skips the models already done and continues. models.ts
// is rewritten atomically only once every measurable model is complete, so it's
// never left half-updated. Other (transient) errors are logged and skipped.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MODEL_CHOICES, estimateCostUsd, promptSetChars } from "../src/clients/models";
import { resetUsage, snapshotUsage } from "../src/clients/llm";
import { generateNote } from "../src/domain/notes";
import { FIXTURES } from "../src/__eval__/fixtures";
import { getGolden, getPrompts, getFeedbackRules } from "./_shared";

const MODELS_PATH = "src/clients/models.ts";
const PROGRESS_PATH = "eval-output/.measure-prices-progress.json";
const SAMPLES = Math.max(1, Number(process.env.SAMPLES) || 3);
const sample = FIXTURES.slice(0, Math.min(SAMPLES, FIXTURES.length));
const keys = { anthropic: process.env.ANTHROPIC_API_KEY ?? "", openai: process.env.OPENAI_API_KEY ?? "" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Tokens = { input: number; output: number };
const loadProgress = (): Record<string, Tokens> => {
  try {
    return JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) as Record<string, Tokens>;
  } catch {
    return {};
  }
};
const saveProgress = (p: Record<string, Tokens>): void => {
  mkdirSync("eval-output", { recursive: true });
  writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
};
// A credit/quota exhaustion (vs a transient rate limit) — the cue to pause.
const isCreditError = (err: unknown): boolean =>
  /quota|insufficient|credit|billing|exceeded your current/.test(
    err instanceof Error ? err.message.toLowerCase() : "",
  );

const prompts = await getPrompts("regular");
const golden = await getGolden();
const feedbackRules = await getFeedbackRules();
const promptChars = promptSetChars({ ...prompts, golden, feedbackRules });

const progress = loadProgress();
if (Object.keys(progress).length) console.log(`Resuming — ${Object.keys(progress).length} model(s) already measured.\n`);

let pausedForCredits = false;
const skippedNoKey: string[] = [];

for (const choice of MODEL_CHOICES) {
  if (progress[choice.modelId]) {
    console.log(`· ${choice.label} — already measured, skipping`);
    continue;
  }
  const key = choice.provider === "openai" ? keys.openai : keys.anthropic;
  if (!key) {
    console.log(`· skip ${choice.label} — no ${choice.provider.toUpperCase()} key`);
    skippedNoKey.push(choice.label);
    continue;
  }
  process.stdout.write(`· ${choice.label} (${choice.modelId}) — generating ${sample.length}… `);
  resetUsage();
  let n = 0;
  let pausedHere = false;
  for (const fx of sample) {
    try {
      await generateNote(key, prompts, fx.ctx, {
        provider: choice.provider,
        model: choice.modelId,
        maxTokens: fx.maxTokens,
        goldenExamples: golden,
      });
      n++;
    } catch (e) {
      if (isCreditError(e)) {
        pausedHere = true;
        break;
      }
      process.stdout.write(`\n    ${fx.name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  if (pausedHere) {
    console.log(`\n⏸  Out of credits (${choice.provider.toUpperCase()}) — pausing.`);
    pausedForCredits = true;
    break;
  }
  if (n === 0) {
    console.log("no notes generated, skipping");
    continue;
  }
  const u = snapshotUsage();
  const tok: Tokens = { input: Math.round(u.inputTokens / n), output: Math.round(u.outputTokens / n) };
  progress[choice.modelId] = tok;
  saveProgress(progress); // persist after each model so a crash/pause keeps it
  const usd = estimateCostUsd(choice.modelId, tok.input, tok.output);
  console.log(`${tok.input} in / ${tok.output} out · ${usd === null ? "no price set" : `$${usd.toFixed(4)}/note`}`);
}

if (pausedForCredits) {
  saveProgress(progress);
  const remaining = MODEL_CHOICES.filter(
    (c) => !progress[c.modelId] && (c.provider === "openai" ? keys.openai : keys.anthropic),
  ).map((c) => c.label);
  console.log(`\nProgress saved (${Object.keys(progress).length} measured). models.ts left unchanged.`);
  console.log("Top up credits and re-run `npm run measure:prices` to resume" + (remaining.length ? ` (remaining: ${remaining.join(", ")}).` : "."));
  process.exit(0);
}

const done = Object.entries(progress);
if (done.length === 0) {
  console.error("\nNothing measured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.");
  process.exit(1);
}

// Complete (no credit pause): write every measured model's noteTokens at once,
// then stamp freshness, then clear progress.
let src = readFileSync(MODELS_PATH, "utf8");
let updated = 0;
for (const [modelId, t] of done) {
  const re = new RegExp(`(modelId: "${esc(modelId)}",[\\s\\S]*?noteTokens: \\{ input: )\\d+(, output: )\\d+( \\})`);
  if (!re.test(src)) {
    console.error(`! couldn't find noteTokens for ${modelId} — left unchanged`);
    continue;
  }
  src = src.replace(re, `$1${t.input}$2${t.output}$3`);
  updated++;
}
const today = new Date().toISOString().slice(0, 10);
src = src.replace(/(export const MEASURED_ON = ")[\d-]+(";)/, `$1${today}$2`);
src = src.replace(/(export const BASELINE_PROMPT_CHARS = )\d+(;)/, `$1${promptChars}$2`);
writeFileSync(MODELS_PATH, src);
rmSync(PROGRESS_PATH, { force: true });
console.log(`\nUpdated ${updated}/${done.length} models · measured ${today} · prompt size ${promptChars} chars.`);
if (skippedNoKey.length) console.log(`Skipped (no key, kept old numbers): ${skippedNoKey.join(", ")}`);
