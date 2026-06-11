// The curated set of LLMs the user can pick from in Settings. Friendly names
// only — the underlying API model IDs (which drift) are hidden here so a
// non-technical user never sees them, and bumping a model is a one-line change.

export type Provider = "anthropic" | "openai";

export interface ModelChoice {
  // Stable key persisted in settings (never the raw model id, so changing the
  // id below doesn't strand a saved preference).
  id: string;
  label: string;
  // One line shown under the option: why she'd choose this one.
  blurb: string;
  provider: Provider;
  // The real API model id sent to the provider. Hidden from the UI.
  modelId: string;
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    id: "chatgpt-mini",
    label: "ChatGPT Mini",
    blurb: "The recommended OpenAI option. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.4-mini",
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    blurb: "OpenAI's stronger, more expensive model. Needs an OpenAI key.",
    provider: "openai",
    modelId: "gpt-5.4",
  },
  {
    id: "claude-sonnet",
    label: "Claude Sonnet",
    blurb: "The recommended Anthropic option. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
  },
  {
    id: "claude-haiku",
    label: "Claude Haiku",
    blurb: "Faster and cheaper than Sonnet, with slightly less polish. Needs an Anthropic key.",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
  },
];

export const DEFAULT_MODEL_CHOICE = "claude-sonnet";

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
// CHANGE and can't be reliably hardcoded (especially the GPT-5.x line), so fill
// them in from the providers' pricing pages — a model left out yields a null cost
// estimate (its exact token counts are still reported):
//   Anthropic: https://www.anthropic.com/pricing
//   OpenAI:    https://platform.openai.com/docs/pricing
// Example: "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
export const PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  // Standard short-context rates as of 2026-06 (no prompt caching modelled — we
  // don't cache yet, so input is billed at the full rate). Keyed by modelId.
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  "gpt-5.5": { inputPerMTok: 5, outputPerMTok: 30 },
  "gpt-5.4": { inputPerMTok: 2.5, outputPerMTok: 15 },
  "gpt-5.4-mini": { inputPerMTok: 0.75, outputPerMTok: 4.5 },
};

// Dollar cost for a token count under the model's price, or null if its price
// isn't set in PRICING (so callers report tokens and flag the missing price).
export function estimateCostUsd(modelId: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICING[modelId];
  if (!p) return null;
  return (inputTokens / 1_000_000) * p.inputPerMTok + (outputTokens / 1_000_000) * p.outputPerMTok;
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
