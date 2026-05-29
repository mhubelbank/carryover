import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GitHubClient } from "../clients/github";
import {
  loadTermData,
  writeGoals,
  writeSchedule,
  writeStudents,
  writeTeachers,
  writeTerm,
  type FileShas,
  type TermData,
} from "../domain/data";
import type { Goal } from "../domain/goal";
import type { ScheduleEntry } from "../domain/schedule";
import type { Student } from "../domain/student";
import type { Teacher } from "../domain/teacher";
import type { Term } from "../domain/term";
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
  // Persist the roster: writes students.csv and updates state in place.
  saveStudents: (students: Student[]) => Promise<void>;
  // Persist goals: writes goals.csv and updates state in place.
  saveGoals: (goals: Goal[]) => Promise<void>;
  // Persist term metadata (label, dates, closures): writes term.json.
  saveTerm: (term: Term) => Promise<void>;
  // Persist teachers: writes teachers.json and updates state in place.
  saveTeachers: (teachers: Teacher[]) => Promise<void>;
  // Persist the schedule: writes schedule.csv and updates state in place.
  saveSchedule: (schedule: ScheduleEntry[]) => Promise<void>;
}

const TermContext = createContext<TermContextValue | null>(null);

export function TermProvider({ children }: { children: ReactNode }) {
  const { keys, testMode } = useAuth();
  const [state, setState] = useState<TermState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const shasRef = useRef<FileShas>({});

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
      .then((loaded) => {
        if (cancelled) return;
        if (loaded) {
          shasRef.current = loaded.shas;
          setState({ status: "ready", data: loaded.data });
        } else {
          shasRef.current = {};
          setState({ status: "empty" });
        }
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

  const saveStudents = useCallback(
    async (students: Student[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeStudents(client, students, shasRef.current.students);
      shasRef.current = { ...shasRef.current, students: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, students } } : prev,
      );
    },
    [client],
  );

  const saveGoals = useCallback(
    async (goals: Goal[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeGoals(client, goals, shasRef.current.goals);
      shasRef.current = { ...shasRef.current, goals: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, goals } } : prev,
      );
    },
    [client],
  );

  const saveTerm = useCallback(
    async (term: Term) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeTerm(client, term, shasRef.current.term);
      shasRef.current = { ...shasRef.current, term: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, term } } : prev,
      );
    },
    [client],
  );

  const saveTeachers = useCallback(
    async (teachers: Teacher[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeTeachers(client, teachers, shasRef.current.teachers);
      shasRef.current = { ...shasRef.current, teachers: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, teachers } } : prev,
      );
    },
    [client],
  );

  const saveSchedule = useCallback(
    async (schedule: ScheduleEntry[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeSchedule(client, schedule, shasRef.current.schedule);
      shasRef.current = { ...shasRef.current, schedule: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, schedule } } : prev,
      );
    },
    [client],
  );

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
    () => ({
      state,
      reload,
      client,
      teacherById,
      studentById,
      saveStudents,
      saveGoals,
      saveTerm,
      saveTeachers,
      saveSchedule,
    }),
    [
      state,
      reload,
      client,
      teacherById,
      studentById,
      saveStudents,
      saveGoals,
      saveTerm,
      saveTeachers,
      saveSchedule,
    ],
  );

  return <TermContext.Provider value={value}>{children}</TermContext.Provider>;
}

export function useTerm(): TermContextValue {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error("useTerm must be used inside <TermProvider>");
  return ctx;
}
