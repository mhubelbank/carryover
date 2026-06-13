// Thin wrapper over localStorage. All keys are namespaced under "sesis:"
// to avoid colliding with other apps if the same origin is ever shared.

const NS = "sesis:";

export const storage = {
  get(key: string): string | null {
    return localStorage.getItem(NS + key);
  },
  set(key: string, value: string): void {
    localStorage.setItem(NS + key, value);
  },
  remove(key: string): void {
    localStorage.removeItem(NS + key);
  },
  clear(): void {
    // Only clear our namespace, not the whole origin.
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  },
};

export const StorageKeys = {
  anthropicApiKey: "anthropic_api_key",
  openaiApiKey: "openai_api_key",
  githubToken: "github_token",
  modelChoice: "model_choice",
  // Cost-estimate cadence: "session" or "day" — how many notes she generates
  // together (the cache window assumed for the Settings price).
  costCadence: "cost_cadence",
  theme: "theme",
  page: "page",
  errorLog: "error_log",
  tutorialDone: "tutorial_done",
  demoMode: "demo_mode",
  demoFs: "demo_fs",
  // "1" when the demo was entered in minimal mode (one sample student) — used by
  // the first-run tour so it shows a single populated student, not the full set.
  demoMinimal: "demo_minimal",
  // Version of the seed dataset currently in the sandbox — bumped when the seed
  // changes so existing sandboxes re-seed instead of keeping stale data.
  demoSeedVersion: "demo_seed_version",
  githubTokenSavedOn: "github_token_saved_on",
  // Provider whose credits ran out mid-generation ("anthropic"/"openai"); drives a
  // sticky banner on Generate until a successful run on that provider clears it.
  outOfCreditsProvider: "out_of_credits_provider",
  // Per-day "batch" queue: sessions she's lined up to generate together (keeps the
  // prompt cache warm). One JSON blob `{ [date]: ["teacherId|timeSlot", …] }`.
  sessionBatch: "session_batch",
} as const;
