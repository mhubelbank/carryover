import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { storage, StorageKeys } from "../clients/storage";
import { clearNotes } from "../clients/noteCache";


export const REPO_CONFIG = {
  owner: "mhubelbank",
  // App data (roster/goals/schedule/sessions/prompts) lives in its own PRIVATE
  // repo, separate from this (public) code repo, so contributors never see PII.
  // Read/written at runtime via the GitHub API using the user's token.
  repo: "carryover-data",
  branch: "main",
} as const;

interface Keys {
  anthropicApiKey: string;
  // Optional — only set if she uses a ChatGPT model. Empty string when unset, so
  // a missing OpenAI key never blocks sign-in (which needs Anthropic + GitHub).
  openaiApiKey: string;
  githubToken: string;
}

interface AuthContextValue {
  keys: Keys | null;
  signIn: (keys: Keys) => void;
  // Replace a single key in place, leaving the other untouched. No-op if not
  // already signed in (both keys must exist before a partial update makes sense).
  updateKeys: (partial: Partial<Keys>) => void;
  signOut: () => void;
  // Test mode pretends the data repo is empty for this session without
  // actually deleting anything. Refresh exits test mode.
  testMode: boolean;
  enterTestMode: () => void;
  // Demo mode: a keyless, seeded sandbox for portfolio viewers. Data lives only in
  // localStorage (never GitHub), generation is canned, and it persists across
  // refreshes until exited. Distinct from testMode (a signed-in dev's empty repo).
  demoMode: boolean;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadKeys(): Keys | null {
  const anthropicApiKey = storage.get(StorageKeys.anthropicApiKey);
  const githubToken = storage.get(StorageKeys.githubToken);
  if (!anthropicApiKey || !githubToken) return null;
  return { anthropicApiKey, openaiApiKey: storage.get(StorageKeys.openaiApiKey) ?? "", githubToken };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Keys | null>(() => loadKeys());
  const [testMode, setTestMode] = useState(false);
  const [demoMode, setDemoMode] = useState(() => storage.get(StorageKeys.demoMode) === "1");

  const value = useMemo<AuthContextValue>(
    () => ({
      keys,
      signIn: (newKeys) => {
        storage.set(StorageKeys.anthropicApiKey, newKeys.anthropicApiKey);
        storage.set(StorageKeys.openaiApiKey, newKeys.openaiApiKey);
        storage.set(StorageKeys.githubToken, newKeys.githubToken);
        setKeys(newKeys);
      },
      updateKeys: (partial) => {
        const base = keys ?? loadKeys();
        if (!base) return;
        const next = { ...base, ...partial };
        if (partial.anthropicApiKey !== undefined) {
          storage.set(StorageKeys.anthropicApiKey, next.anthropicApiKey);
        }
        if (partial.openaiApiKey !== undefined) {
          storage.set(StorageKeys.openaiApiKey, next.openaiApiKey);
        }
        if (partial.githubToken !== undefined) {
          storage.set(StorageKeys.githubToken, next.githubToken);
        }
        setKeys(next);
      },
      signOut: () => {
        // Wipe all local state, not just the keys: the IndexedDB note cache and
        // the namespaced localStorage (Generate form draft) hold student PII that
        // shouldn't survive a sign-out on a shared device.
        storage.clear();
        void clearNotes().catch(() => {});
        setKeys(null);
        setTestMode(false);
      },
      testMode,
      enterTestMode: () => setTestMode(true),
      demoMode,
      enterDemoMode: () => {
        storage.set(StorageKeys.demoMode, "1");
        setDemoMode(true);
      },
      exitDemoMode: () => {
        storage.remove(StorageKeys.demoMode);
        storage.remove(StorageKeys.demoFs);
        void clearNotes().catch(() => {});
        setDemoMode(false);
      },
    }),
    [keys, testMode, demoMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
