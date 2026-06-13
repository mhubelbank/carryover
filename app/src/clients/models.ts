// The curated set of LLMs the user can pick from in Settings. Friendly names
// only — the underlying API model IDs (which drift) are hidden here so a
// non-technical user never sees them, and bumping a model is a one-line change.

export type Provider = "anthropic" | "openai";

// Every model id the app knows about — the single source of valid ids. Both
// MODEL_CHOICES and PRICING are typed against this, so adding a model means
// adding it here, and PRICING (a Record over ModelId) won't compile until the
// new model has a price. May include ids not currently in the picker.
export type ModelId =
  | "claude-sonnet-4-6"
  | "claude-opus-4-8"
  | "claude-haiku-4-5-20251001"
  | "gpt-5.4"
  | "gpt-5.5"
  | "gpt-5.4-mini";

export interface ModelChoice {
  // Stable key persisted in settings (never the raw model id, so changing the
  // id below doesn't strand a saved preference).
  id: string;
  label: string;
  // One line shown under the option: why she'd choose this one.
  blurb: string;
  provider: Provider;
  // The real API model id sent to the provider. Hidden from the UI.
  modelId: ModelId;
  // Representative per-note token usage, measured from a 1×3 eval batch, for the
  // at-a-glance cost shown in the picker. Input is ~prompt-size-driven (re-measure
  // when prompts change); output varies by model (reasoning models bill far more).
  noteTokens: { input: number; output: number };
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    blurb: "The recommended model, which scored the best on quality & value testing. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    noteTokens: { input: 8089, output: 181 },
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    blurb: "Anthropic's most capable model — highest tier, pricier than Sonnet. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    noteTokens: { input: 11364, output: 279 },
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku",
    blurb: "Faster and cheaper than Sonnet, with slightly less polish. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    noteTokens: { input: 8081, output: 174 },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "Primary OpenAI alternative for a different voice. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.4",
    noteTokens: { input: 7513, output: 147 },
  },
  {
    id: "chatgpt-pro",
    label: "ChatGPT Pro",
    blurb: "OpenAI's most capable model, the priciest option by far. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.5",
    noteTokens: { input: 7512, output: 1388 },
  },
];

export const DEFAULT_MODEL_CHOICE = "claude-sonnet";
export const DEFAULT_MODEL =
  MODEL_CHOICES.find((c) => c.id === DEFAULT_MODEL_CHOICE)?.modelId ?? MODEL_CHOICES[0]!.modelId;

// --- Pipelines --------------------------------------------------------------
// What the user actually picks: a provider pipeline, not a single model. Each
// runs a premium DRAFT then progressively cheaper REVIEW + STREAMLINE passes, so
// every note gets the best model on the hard part (the draft) while cleanup runs
// cheap. The individual models above are internal — only these two are shown.
export type PipelineId = "claude" | "chatgpt";

export interface PipelinePass {
  model: ModelId;
  // Per-pass token usage measured by `npm run measure:prices` (a mixed pipeline
  // can't be derived from the single-model numbers — the draft's output feeds the
  // later passes' input, so it must be measured end-to-end). `cached` is the
  // prompt-cache prefix size (of `input`), billed at the discounted rate. Seeded
  // until measured; PIPELINES_MEASURED_ON stamps the last measurement.
  tokens: { input: number; output: number; cached: number };
}

export interface Pipeline {
  id: PipelineId;
  label: string;
  blurb: string;
  provider: Provider;
  draft: PipelinePass;
  review: PipelinePass;
  streamline: PipelinePass;
}

export const PIPELINES: Pipeline[] = [
  {
    id: "claude",
    label: "Claude",
    blurb:
      "Drafts on Opus (most capable), then cleans up on Sonnet and Haiku to keep cost down. Needs an Anthropic key.",
    provider: "anthropic",
    draft: { model: "claude-opus-4-8", tokens: { input: 6112, output: 91, cached: 5780 } },
    review: { model: "claude-sonnet-4-6", tokens: { input: 2840, output: 61, cached: 0 } },
    streamline: { model: "claude-haiku-4-5-20251001", tokens: { input: 981, output: 61, cached: 0 } },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "Drafts on GPT-5.5, then cleans up on GPT-5.4 and GPT-5.4-mini. Needs an OpenAI key.",
    provider: "openai",
    draft: { model: "gpt-5.5", tokens: { input: 4005, output: 545, cached: 1109 } },
    review: { model: "gpt-5.4", tokens: { input: 2639, output: 51, cached: 0 } },
    streamline: { model: "gpt-5.4-mini", tokens: { input: 913, output: 50, cached: 0 } },
  },
];

export const DEFAULT_PIPELINE: PipelineId = "claude";

// The three passes in order, for iterating a pipeline's models/tokens.
export const pipelinePasses = (p: Pipeline): PipelinePass[] => [p.draft, p.review, p.streamline];

// Resolve a saved pipeline id to its record, falling back to the default.
export function resolvePipeline(id: string): Pipeline {
  return PIPELINES.find((p) => p.id === id) ?? PIPELINES.find((p) => p.id === DEFAULT_PIPELINE) ?? PIPELINES[0]!;
}

export const PROVIDER_META: Record<Provider, { label: string; keyLabel: string; creditsUrl: string }> = {
  anthropic: {
    label: "Anthropic",
    keyLabel: "Anthropic API key",
    creditsUrl: "https://console.anthropic.com/settings/billing",
  },
  openai: {
    label: "OpenAI",
    keyLabel: "OpenAI API key",
    creditsUrl: "https://platform.openai.com/settings/organization/billing/overview",
  },
};

// USD price per 1,000,000 tokens, input and output billed separately. These
// CHANGE and can't be reliably hardcoded (especially the GPT-5.x line), so update
// them from the providers' pricing pages. Exhaustive over ModelId — every model
// must have a price or this won't compile:
//   Anthropic: https://www.anthropic.com/pricing
//   OpenAI:    https://platform.openai.com/docs/pricing
export const PRICING: Record<ModelId, { inputPerMTok: number; outputPerMTok: number }> = {
  // Standard short-context rates as of 2026-06 (no prompt caching modelled — we
  // don't cache yet, so input is billed at the full rate). Keyed by modelId.
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "gpt-5.5": { inputPerMTok: 5, outputPerMTok: 30 },
  "gpt-5.4": { inputPerMTok: 2.5, outputPerMTok: 15 },
  "gpt-5.4-mini": { inputPerMTok: 0.75, outputPerMTok: 4.5 },
};

// Dollar cost for a token count under the model's price, or null if its price
// isn't set in PRICING (so callers report tokens and flag the missing price).
export function estimateCostUsd(modelId: ModelId, inputTokens: number, outputTokens: number): number | null {
  const p = PRICING[modelId];
  if (!p) return null;
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
}

function perNoteUsd(choice: ModelChoice): number | null {
  return estimateCostUsd(choice.modelId, choice.noteTokens.input, choice.noteTokens.output);
}

// Short cost-per-note label for the picker (e.g. "7¢", "<1¢"), or null when the
// model's price isn't set in PRICING.
export function perNoteCostLabel(choice: ModelChoice): string | null {
  const usd = perNoteUsd(choice);
  if (usd === null) return null;
  const cents = usd * 100;
  return cents < 0.5 ? "<1¢" : `${Math.round(cents)}¢`;
}

// Full-year cost estimate at a given weekly note volume (e.g. "$150/year"), or
// null when the model's price isn't set.
export function annualCostLabel(choice: ModelChoice, notesPerWeek: number): string | null {
  const usd = perNoteUsd(choice);
  if (usd === null) return null;
  return `$${Math.round(usd * notesPerWeek * 52)}/year`;
}

// Prompt-cache price multipliers on the INPUT rate. Anthropic 5-min cache: writes
// cost 1.25× and reads 0.10× of base input; OpenAI caches automatically (no write
// premium) and bills cached input at ~0.10×. Verify on the pricing pages — these
// move. Used to project caching savings in measure:prices.
export const CACHE_MULT: Record<Provider, { write: number; read: number }> = {
  anthropic: { write: 1.25, read: 0.1 },
  openai: { write: 1.0, read: 0.1 },
};

// Notes generated together share a warm cache; `session` is that window size (how
// many she generates at a time). Larger = the one cache write amortizes further =
// cheaper. Default 4. Cf. NOTES_PER_SESSION in measure:prices.
export const DEFAULT_CACHE_SESSION = 4;

// Per-note $ for a whole pipeline = each pass's model price × its tokens, with the
// cached prefix discounted (one cache write amortized across the session window,
// the rest read at the cheap rate). Matches the "default" scenario in docs/prices.md.
export function pipelineNoteUsd(p: Pipeline, session = DEFAULT_CACHE_SESSION): number {
  const cm = CACHE_MULT[p.provider];
  const D = Math.max(1, session);
  return pipelinePasses(p).reduce((sum, pass) => {
    const price = PRICING[pass.model];
    const cached = Math.min(pass.tokens.cached, pass.tokens.input);
    const dyn = pass.tokens.input - cached;
    const billedInput = (cached * (cm.write + (D - 1) * cm.read)) / D + dyn;
    return sum + (billedInput * price.inputPerMTok + pass.tokens.output * price.outputPerMTok) / 1_000_000;
  }, 0);
}

export function pipelinePerNoteCostLabel(p: Pipeline, session = DEFAULT_CACHE_SESSION): string {
  const cents = pipelineNoteUsd(p, session) * 100;
  return cents < 0.5 ? "<1¢" : `${Math.round(cents)}¢`;
}

export function pipelineAnnualCostLabel(p: Pipeline, notesPerWeek: number, session = DEFAULT_CACHE_SESSION): string {
  return `$${Math.round(pipelineNoteUsd(p, session) * notesPerWeek * 52)}/year`;
}

// --- Estimate freshness -----------------------------------------------------
// Stamped by `npm run measure:prices`: when the per-model token estimates were
// last measured, and the total prompt size (chars) they were measured against.
// Settings compares the live prompt size to this baseline and nudges to refresh
// the estimates (re-run measure:prices) once they drift past the threshold.
export const MEASURED_ON = "2026-06-13";
export const BASELINE_PROMPT_CHARS = 34945;
// When the PIPELINES per-pass token counts were last measured end-to-end by
// `npm run measure:prices -- --pipelines`. "" until first measured (the seeded
// tokens above are rough estimates, so the pipeline cost labels are approximate).
export const PIPELINES_MEASURED_ON = "2026-06-13";
export const PROMPT_DRIFT_THRESHOLD = 0.2;

// Total characters of the generation prompt inputs that drive token cost — the
// templates, golden examples, and accumulated feedback rules. Computed the same
// way by the app and by measure:prices so the comparison is apples-to-apples.
export function promptSetChars(p: {
  draft: string;
  review: string;
  streamline: string;
  golden: string;
  feedbackRules: string;
}): number {
  return p.draft.length + p.review.length + p.streamline.length + p.golden.length + p.feedbackRules.length;
}

// Resolve a saved choice id back to its full record, falling back to the default
// if the id is unknown (e.g. a removed model or corrupted storage).
export function resolveChoice(id: string): ModelChoice {
  return (
    MODEL_CHOICES.find((c) => c.id === id) ??
    MODEL_CHOICES.find((c) => c.id === DEFAULT_MODEL_CHOICE) ??
    MODEL_CHOICES[0]!
  );
}
