// Shared display constants for prompting types and support levels, used by the
// Generate Trials UI and the student Progress view.
import type { IconName } from "./Icon";

// Symbol per prompting/support type.
export const PROMPT_TYPE_ICON: Record<string, IconName> = {
  verbal: "message",
  visual: "eye",
  tactile: "hand-finger",
  gestural: "hand-finger-right",
  modeled: "user",
};

// Short label per support level (compact chips/buttons).
export const LEVEL_ABBR: Record<string, string> = {
  "no support": "Indep",
  minimal: "Min",
  moderate: "Mod",
  maximum: "Max",
};

// Full label per support level (legends).
export const LEVEL_FULL: Record<string, string> = {
  "no support": "Independent",
  minimal: "Minimal",
  moderate: "Moderate",
  maximum: "Maximum",
};

// Fade scale: least support (independent) = green, increasing support warms to
// red; failed trials are grey. Used for the support-breakdown bars.
// Mixed toward the surface (not literal white) so the shades adapt in dark mode.
export const LEVEL_COLOR: Record<string, string> = {
  "no support": "color-mix(in srgb, var(--color-text-success) 55%, var(--color-background-primary))",
  minimal: "color-mix(in srgb, var(--color-text-warning) 30%, var(--color-background-primary))",
  moderate: "color-mix(in srgb, var(--color-text-warning) 65%, var(--color-background-primary))",
  maximum: "color-mix(in srgb, var(--color-text-danger) 55%, var(--color-background-primary))",
};
export const FAILED_COLOR = "var(--color-background-tertiary)";
