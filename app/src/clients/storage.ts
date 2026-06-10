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
  theme: "theme",
  page: "page",
} as const;
