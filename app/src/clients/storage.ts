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
  notesPerWeek: "notes_per_week",
  theme: "theme",
  page: "page",
  errorLog: "error_log",
  tutorialDone: "tutorial_done",
  demoMode: "demo_mode",
  demoFs: "demo_fs",
  // "1" when the demo was entered in minimal mode (one sample student) — used by
  // the first-run tour so it shows a single populated student, not the full set.
  demoMinimal: "demo_minimal",
  githubTokenSavedOn: "github_token_saved_on",
} as const;
