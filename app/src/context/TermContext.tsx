import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { GitHubClient } from "../clients/github";
import { loadTermData, type TermData } from "../domain/data";
import type { Student } from "../domain/student";
import type { Teacher } from "../domain/teacher";
import { REPO_CONFIG, useAuth } from "./AuthContext";

type TermState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TermData };

interface TermContextValue {
  state: TermState;
  reload: () => void;
  // The data-repo client, available once keys exist (null in test mode or
  // before sign-in). Pages use it for lazy loads like session usage counts.
  client: GitHubClient | null;
  // Id lookups, populated only when ready (empty maps otherwise).
  teacherById: Map<string, Teacher>;
  studentById: Map<string, Student>;
}

const TermContext = createContext<TermContextValue | null>(null);

export function TermProvider({ children }: { children: ReactNode }) {
  const { keys, testMode } = useAuth();
  const [state, setState] = useState<TermState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  const client = useMemo(
    () => (keys ? new GitHubClient({ token: keys.githubToken, ...REPO_CONFIG }) : null),
    [keys],
  );

  useEffect(() => {
    // Test mode pretends the repo is empty without touching GitHub.
    if (testMode) {
      setState({ status: "empty" });
      return;
    }
    if (!client) {
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    loadTermData(client)
      .then((data) => {
        if (cancelled) return;
        setState(data ? { status: "ready", data } : { status: "empty" });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load data";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, [client, testMode, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const { teacherById, studentById } = useMemo(() => {
    if (state.status !== "ready") {
      return {
        teacherById: new Map<string, Teacher>(),
        studentById: new Map<string, Student>(),
      };
    }
    return {
      teacherById: new Map(state.data.teachers.map((t) => [t.id, t] as const)),
      studentById: new Map(state.data.students.map((s) => [s.id, s] as const)),
    };
  }, [state]);

  const value = useMemo<TermContextValue>(
    () => ({ state, reload, client, teacherById, studentById }),
    [state, reload, client, teacherById, studentById],
  );

  return <TermContext.Provider value={value}>{children}</TermContext.Provider>;
}

export function useTerm(): TermContextValue {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error("useTerm must be used inside <TermProvider>");
  return ctx;
}
