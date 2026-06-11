// Measure per-note token usage for every model in the picker and write the
// numbers back into each MODEL_CHOICES entry's `noteTokens`, so the cost
// estimates shown in Settings stay current. Re-run after prompt changes.
//
//   ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GITHUB_TOKEN=… npx tsx scripts/measure-prices.ts
//   PROMPTS_DIR=/path/to/data/prompts   measure against local (current) prompts
//   SAMPLES=5                           notes per model (default 3; counts are stable)
//
// Only models whose provider key is present are measured; the rest keep their
// current numbers. Generates regular-mode notes (the common case); the conjugation
// call is excluded, so figures are the 3 note passes. Writes src/clients/models.ts
// in place, touching only the two numbers in each `noteTokens`.
import { readFileSync, writeFileSync } from "node:fs";
import { MODEL_CHOICES, estimateCostUsd, promptSetChars } from "../src/clients/models";
import { resetUsage, snapshotUsage } from "../src/clients/llm";
import { generateNote } from "../src/domain/notes";
import { FIXTURES } from "../src/__eval__/fixtures";
import { getGolden, getPrompts, getFeedbackRules } from "./_shared";

const MODELS_PATH = "src/clients/models.ts";
const SAMPLES = Math.max(1, Number(process.env.SAMPLES) || 3);
const sample = FIXTURES.slice(0, Math.min(SAMPLES, FIXTURES.length));
const keys = { anthropic: process.env.ANTHROPIC_API_KEY ?? "", openai: process.env.OPENAI_API_KEY ?? "" };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const prompts = await getPrompts("regular");
const golden = await getGolden();
const feedbackRules = await getFeedbackRules();
const promptChars = promptSetChars({ ...prompts, golden, feedbackRules });

const measured: { modelId: string; label: string; input: number; output: number }[] = [];

for (const choice of MODEL_CHOICES) {
  const key = choice.provider === "openai" ? keys.openai : keys.anthropic;
  if (!key) {
    console.log(`· skip ${choice.label} — no ${choice.provider.toUpperCase()} key`);
    continue;
  }
  process.stdout.write(`· ${choice.label} (${choice.modelId}) — generating ${sample.length}… `);
  resetUsage();
  let n = 0;
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
      process.stdout.write(`\n    ${fx.name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  if (n === 0) {
    console.log("no notes generated, skipping");
    continue;
  }
  const u = snapshotUsage();
  const input = Math.round(u.inputTokens / n);
  const output = Math.round(u.outputTokens / n);
  measured.push({ modelId: choice.modelId, label: choice.label, input, output });
  const usd = estimateCostUsd(choice.modelId, input, output);
  console.log(`${input} in / ${output} out · ${usd === null ? "no price set" : `$${usd.toFixed(4)}/note`}`);
}

if (measured.length === 0) {
  console.error("\nNothing measured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.");
  process.exit(1);
}

// Rewrite each measured model's noteTokens in place (only the two numbers; the
// non-greedy span reaches the noteTokens that follows this model's id).
let src = readFileSync(MODELS_PATH, "utf8");
let updated = 0;
for (const m of measured) {
  const re = new RegExp(`(modelId: "${esc(m.modelId)}",[\\s\\S]*?noteTokens: \\{ input: )\\d+(, output: )\\d+( \\})`);
  if (!re.test(src)) {
    console.error(`! couldn't find noteTokens for ${m.modelId} — left unchanged`);
    continue;
  }
  src = src.replace(re, `$1${m.input}$2${m.output}$3`);
  updated++;
}
// Stamp the freshness markers the app uses to flag stale estimates.
const today = new Date().toISOString().slice(0, 10);
src = src.replace(/(export const MEASURED_ON = ")[\d-]+(";)/, `$1${today}$2`);
src = src.replace(/(export const BASELINE_PROMPT_CHARS = )\d+(;)/, `$1${promptChars}$2`);
writeFileSync(MODELS_PATH, src);
console.log(`\nUpdated ${updated}/${measured.length} models · measured ${today} · prompt size ${promptChars} chars.`);
