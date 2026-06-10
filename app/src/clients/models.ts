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

// Resolve a saved choice id back to its full record, falling back to the default
// if the id is unknown (e.g. a removed model or corrupted storage).
export function resolveChoice(id: string): ModelChoice {
  return (
    MODEL_CHOICES.find((c) => c.id === id) ??
    MODEL_CHOICES.find((c) => c.id === DEFAULT_MODEL_CHOICE) ??
    MODEL_CHOICES[0]!
  );
}
