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
    blurb: "The recommended option, scored best on quality evaluation. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    noteTokens: { input: 6100, output: 179 },
  },
  {
    id: "claude-opus",
    label: "Claude Opus",
    blurb: "Anthropic's most capable model — highest tier, pricier than Sonnet. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    noteTokens: { input: 8591, output: 283 },
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku",
    blurb: "Faster and cheaper than Sonnet, with slightly less polish. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    noteTokens: { input: 6102, output: 189 },
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "OpenAI alternative for a different voice. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.4",
    noteTokens: { input: 5659, output: 165 },
  },
  {
    id: "chatgpt-pro",
    label: "ChatGPT Pro",
    blurb: "OpenAI's most capable model — the best quality option, and the priciest. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.5",
    noteTokens: { input: 5652, output: 1294 },
  },
  {
    id: "chatgpt-mini",
    label: "ChatGPT Mini",
    blurb: "Cheapest, lowest quality option. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.4-mini",
    noteTokens: { input: 5661, output: 170 },
  },
];

export const DEFAULT_MODEL_CHOICE = "claude-sonnet";
export const DEFAULT_MODEL =
  MODEL_CHOICES.find((c) => c.id === DEFAULT_MODEL_CHOICE)?.modelId ?? MODEL_CHOICES[0]!.modelId;

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

// --- Estimate freshness -----------------------------------------------------
// Stamped by `npm run measure:prices`: when the per-model token estimates were
// last measured, and the total prompt size (chars) they were measured against.
// Settings compares the live prompt size to this baseline and nudges to refresh
// the estimates (re-run measure:prices) once they drift past the threshold.
export const MEASURED_ON = "2026-06-11";
export const BASELINE_PROMPT_CHARS = 26143;
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
