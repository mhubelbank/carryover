// Measure per-note token usage for every model in the picker and write the
// numbers back into each MODEL_CHOICES entry's `noteTokens` (plus the MEASURED_ON
// date and BASELINE_PROMPT_CHARS), so the cost estimates in Settings stay current.
//
//   ANTHROPIC_API_KEY=… OPENAI_API_KEY=… GITHUB_TOKEN=… npx tsx scripts/measure-prices.ts
//   PROMPTS_DIR=/path/to/data/prompts   measure against local (current) prompts
//   SAMPLES=5                           notes per model (default 3; counts are stable)
//
//   …measure-prices.ts --pipelines      measure the two provider PIPELINES end to
//     end (per-pass tokens), print the four cost scenarios (current → caching →
//     cheaper-cleanup → whole-day-batch), and write the measured per-pass tokens
//     back into PIPELINES in models.ts. NOTES_PER_WEEK / NOTES_PER_DAY tune the
//     projection (defaults 44 / a fifth of the week).
//
// Pause/resume: if a provider runs out of credits mid-run, the script saves the
// models measured so far to a progress file and stops without touching models.ts.
// Top up and re-run — it skips the models already done and continues. models.ts
// is rewritten atomically only once every measurable model is complete, so it's
// never left half-updated. Other (transient) errors are logged and skipped.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  MODEL_CHOICES,
  PIPELINES,
  PRICING,
  CACHE_MULT,
  estimateCostUsd,
  promptSetChars,
  type Pipeline,
  type ModelId,
  type Provider,
} from "../src/clients/models";
import { resetUsage, snapshotUsage } from "../src/clients/llm";
import { generateNote, NOTE_SYSTEM } from "../src/domain/notes";
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

// --- Pipeline scenario mode -------------------------------------------------
// `--pipelines`: measure the two provider PIPELINES end-to-end (per-pass tokens),
// project the four cost scenarios, and write the measured tokens back into models.ts.
const argv = process.argv.slice(2);
const NOTES_PER_WEEK = Math.max(1, Number(process.env.NOTES_PER_WEEK) || 44);
const NOTES_PER_DAY = Math.max(1, Number(process.env.NOTES_PER_DAY) || Math.ceil(NOTES_PER_WEEK / 5));
// On-demand (the DEFAULT modality) generates a session's worth of notes per click,
// in parallel — so they share a warm cache window. Batch (opt-in) does a whole day
// at once. More notes sharing the window = the cache write amortizes further.
const NOTES_PER_SESSION = Math.max(1, Number(process.env.NOTES_PER_SESSION) || 4);
const TOK = (s: string) => Math.ceil(s.length / 4);
type PassKey = "draft" | "review" | "streamline";
// input = total input tokens (cached + uncached); cached = tokens that hit the
// prompt cache (the real cacheable-prefix size, 0 if caching didn't fire).
type PassTok = { input: number; output: number; cached: number };

// Static (cacheable) prompt prefix per pass — the system prompt + that pass's
// template, plus golden examples + feedback rules on the draft. These repeat
// identically across notes, so prompt caching discounts them. Tokens via chars/4.
const staticTok: Record<PassKey, number> = {
  draft: TOK(NOTE_SYSTEM) + TOK(prompts.draft) + TOK(golden) + TOK(feedbackRules),
  review: TOK(NOTE_SYSTEM) + TOK(prompts.review),
  streamline: TOK(NOTE_SYSTEM) + TOK(prompts.streamline),
};

if (argv.includes("--pipelines")) {
  await runPipelineScenarios();
  process.exit(0);
}

// Run one pipeline end-to-end over the sample, returning averaged per-pass tokens.
async function measurePipeline(p: Pipeline): Promise<Record<PassKey, PassTok> | null> {
  const key = p.provider === "openai" ? keys.openai : keys.anthropic;
  if (!key) {
    console.log(`· skip ${p.label} — no ${p.provider.toUpperCase()} key`);
    return null;
  }
  process.stdout.write(
    `· ${p.label}: ${p.draft.model} → ${p.review.model} → ${p.streamline.model} — ${sample.length} notes… `,
  );
  resetUsage();
  let n = 0;
  for (const fx of sample) {
    try {
      await generateNote(key, prompts, fx.ctx, {
        passes: {
          draft: { provider: p.provider, model: p.draft.model },
          review: { provider: p.provider, model: p.review.model },
          streamline: { provider: p.provider, model: p.streamline.model },
        },
        maxTokens: fx.maxTokens,
        goldenExamples: golden,
        feedbackRules,
      });
      n++;
    } catch (e) {
      if (isCreditError(e)) {
        console.log(`\n⏸  out of ${p.provider.toUpperCase()} credits — stopping ${p.label}.`);
        break;
      }
      process.stdout.write(`\n    ${fx.name} failed: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  if (n === 0) {
    console.log("no notes generated");
    return null;
  }
  const agg: Record<PassKey, PassTok> = {
    draft: { input: 0, output: 0, cached: 0 },
    review: { input: 0, output: 0, cached: 0 },
    streamline: { input: 0, output: 0, cached: 0 },
  };
  for (const c of snapshotUsage().callLog) {
    const a = agg[c.label as PassKey];
    if (a) {
      a.input += c.input + c.cacheRead + c.cacheWrite; // total input incl. cached
      a.output += c.output;
      a.cached += c.cacheRead + c.cacheWrite; // the cacheable-prefix size
    }
  }
  for (const k of Object.keys(agg) as PassKey[]) {
    agg[k].input = Math.round(agg[k].input / n);
    agg[k].output = Math.round(agg[k].output / n);
    agg[k].cached = Math.round(agg[k].cached / n);
  }
  const cachedNote = agg.draft.cached > 0 ? ` · cache✓ draft prefix ${agg.draft.cached} tok` : " · cache✗ (no hits)";
  console.log(
    `draft ${agg.draft.input}/${agg.draft.output} · review ${agg.review.input}/${agg.review.output} · streamline ${agg.streamline.input}/${agg.streamline.output}${cachedNote}`,
  );
  return agg;
}

// Cost of one pass under a model + cache mode. cache=false bills full input. With
// caching, ONE cache write (1.25×) is amortized across batchD notes and the other
// (batchD−1) read it cheaply (0.1×) — so batchD=1 (on-demand, cache cold between
// notes) pays the write every time and barely helps, while batchD=a-day's-notes
// approaches the read rate. This is why batching is what makes caching pay off.
function passUsd(model: ModelId, provider: Provider, tok: PassTok, stat: number, cache: boolean, batchD: number): number {
  const pin = PRICING[model].inputPerMTok / 1e6;
  const pout = PRICING[model].outputPerMTok / 1e6;
  const cached = Math.min(stat, tok.input);
  const dyn = tok.input - cached;
  const cm = CACHE_MULT[provider];
  const D = Math.max(1, batchD);
  const billedInput = cache ? (cached * (cm.write + (D - 1) * cm.read)) / D + dyn : tok.input;
  return billedInput * pin + tok.output * pout;
}

async function runPipelineScenarios(): Promise<void> {
  console.log(
    `Pipeline cost scenarios — ${sample.length} sample notes/pipeline, ${NOTES_PER_WEEK} notes/week · ` +
      `on-demand = ${NOTES_PER_SESSION}/session, batch = ${NOTES_PER_DAY}/day.\n`,
  );
  const measured = new Map<string, Record<PassKey, PassTok>>();
  for (const p of PIPELINES) {
    const agg = await measurePipeline(p);
    if (agg) measured.set(p.id, agg);
  }
  if (measured.size === 0) {
    console.error("\nNothing measured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.");
    process.exit(1);
  }

  // Cacheable-prefix size per pass: the REAL cached tokens when caching fired in
  // the run (draft caches its golden+system block; review/streamline don't, so
  // they're 0 — honest), else the chars/4 estimate (projection, pre-caching).
  const cacheFired = (agg: Record<PassKey, PassTok>) =>
    agg.draft.cached + agg.review.cached + agg.streamline.cached > 0;
  const passesOf = (p: Pipeline, agg: Record<PassKey, PassTok>): Array<[PassKey, ModelId, PassTok, number]> => {
    const real = cacheFired(agg);
    return [
      ["draft", p.draft.model, agg.draft, real ? agg.draft.cached : staticTok.draft],
      ["review", p.review.model, agg.review, real ? agg.review.cached : staticTok.review],
      ["streamline", p.streamline.model, agg.streamline, real ? agg.streamline.cached : staticTok.streamline],
    ];
  };
  const annual = (perNote: number) => perNote * NOTES_PER_WEEK * 52;
  const fmt = (perNote: number) => `${(perNote * 100).toFixed(2)}¢/note · $${annual(perNote).toFixed(0)}/yr`;

  console.log("\n=== Scenarios (per note · per year) ===\n");
  for (const p of PIPELINES) {
    const agg = measured.get(p.id);
    if (!agg) continue;
    const premium = p.draft.model; // draft tier
    const mid = p.review.model; // review tier
    const low = p.streamline.model; // streamline tier
    const rows = passesOf(p, agg);
    // 1. No caching, one model on all three passes (today's behavior), priced at
    //    each tier so the mixed pipeline can be compared against the naive choices.
    const tierAll = (m: ModelId) => rows.reduce((s, [, , tok, stat]) => s + passUsd(m, p.provider, tok, stat, false, 0), 0);
    const base = tierAll(premium); // the current baseline; % savings measured against it
    // 2. + prompt caching on the premium config, on-demand (session-sized window).
    const s2 = rows.reduce((s, [, , tok, stat]) => s + passUsd(premium, p.provider, tok, stat, true, NOTES_PER_SESSION), 0);
    // 3. + cheaper cleanup models (the pipeline split), still on-demand — DEFAULT.
    const s3 = rows.reduce((s, [, model, tok, stat]) => s + passUsd(model, p.provider, tok, stat, true, NOTES_PER_SESSION), 0);
    // 4. Same pipeline, opt-in whole-day batch (write amortized over the day).
    const s4 = rows.reduce((s, [, model, tok, stat]) => s + passUsd(model, p.provider, tok, stat, true, NOTES_PER_DAY), 0);
    const cut = (v: number) => `${Math.round((1 - v / base) * 100)}% off`;
    const cacheTag = cacheFired(agg) ? "measured cache" : "ESTIMATED cache (caching not active)";
    console.log(`${p.label} pipeline  (${premium} → ${mid} → ${low})  [${cacheTag}]`);
    console.log(`  1. No caching, one model ×3 (on-demand):`);
    console.log(`       premium  ${premium.padEnd(26)}: ${fmt(tierAll(premium))}`);
    console.log(`       mid      ${mid.padEnd(26)}: ${fmt(tierAll(mid))}`);
    console.log(`       low      ${low.padEnd(26)}: ${fmt(tierAll(low))}`);
    console.log(`  2. + prompt caching (premium ×3, on-demand) : ${fmt(s2)}  (${cut(s2)})`);
    console.log(`  3. + cheaper cleanup models (on-demand) ◀ default : ${fmt(s3)}  (${cut(s3)})`);
    console.log(`  4. + whole-day batch (opt-in)               : ${fmt(s4)}  (${cut(s4)})`);
    console.log("");
  }

  // Write measured per-pass tokens back into PIPELINES + stamp the date.
  let src = readFileSync(MODELS_PATH, "utf8");
  let updated = 0;
  for (const p of PIPELINES) {
    const agg = measured.get(p.id);
    if (!agg) continue;
    for (const [, model, tok] of passesOf(p, agg)) {
      const re = new RegExp(`(model: "${esc(model)}", tokens: \\{ input: )\\d+(, output: )\\d+(, cached: )\\d+( \\})`);
      if (re.test(src)) {
        src = src.replace(re, `$1${tok.input}$2${tok.output}$3${tok.cached}$4`);
        updated++;
      } else {
        console.error(`! couldn't find pipeline tokens for ${model} — left unchanged`);
      }
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  src = src.replace(/(export const PIPELINES_MEASURED_ON = ")[^"]*(";)/, `$1${today}$2`);
  writeFileSync(MODELS_PATH, src);
  console.log(`Updated ${updated} pipeline pass token(s) in models.ts · stamped ${today}.`);
  console.log(
    "Notes: cache mults from CACHE_MULT; static prefix sized via chars/4; cleanup output counts (measured on the cheap models) reused when re-pricing S1/S2 at the premium model.",
  );
}

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
