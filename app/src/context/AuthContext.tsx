import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { storage, StorageKeys } from "../clients/storage";


export const REPO_CONFIG = {
  owner: "mhubelbank",
  repo: "carryover",
  // App data (students/goals/schedule/sessions) is committed to its own branch,
  // keeping the code history on the default branch clean and preventing the
  // Cloudflare Pages production deploy from rebuilding on every save.
  branch: "data",
} as const;

interface Keys {
  anthropicApiKey: string;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Dev-only convenience: seed keys from .env.local (VITE_DEV_*) so local
// development can skip the Welcome screen. Guarded by import.meta.env.DEV, so
// the whole branch is stripped from production builds.
const devEnvKeys = import.meta.env.DEV
  ? {
      anthropicApiKey: import.meta.env.VITE_DEV_ANTHROPIC_KEY || null,
      githubToken: import.meta.env.VITE_DEV_GITHUB_TOKEN || null,
    }
  : { anthropicApiKey: null, githubToken: null };

function loadKeys(): Keys | null {
  const anthropicApiKey = storage.get(StorageKeys.anthropicApiKey) ?? devEnvKeys.anthropicApiKey;
  const githubToken = storage.get(StorageKeys.githubToken) ?? devEnvKeys.githubToken;
  if (!anthropicApiKey || !githubToken) return null;
  return { anthropicApiKey, githubToken };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Keys | null>(() => loadKeys());
  const [testMode, setTestMode] = useState(false);

  const value = useMemo<AuthContextValue>(
    () => ({
      keys,
      signIn: (newKeys) => {
        storage.set(StorageKeys.anthropicApiKey, newKeys.anthropicApiKey);
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
        if (partial.githubToken !== undefined) {
          storage.set(StorageKeys.githubToken, next.githubToken);
        }
        setKeys(next);
      },
      signOut: () => {
        storage.remove(StorageKeys.anthropicApiKey);
        storage.remove(StorageKeys.githubToken);
        setKeys(null);
        setTestMode(false);
      },
      testMode,
      enterTestMode: () => setTestMode(true),
    }),
    [keys, testMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
