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
import { GitHubClient, type DataClient } from "../clients/github";
import { LocalFsClient } from "../clients/localFsClient";
import { seedDemoFs } from "../demo/seed";
import {
  loadTermData,
  loadTermHistory,
  removeFromTermHistory,
  upsertTermHistory,
  writeActivities,
  writeNewsRoles,
  writeGoals,
  writeSchedule,
  writeStudentFields,
  writeStudents,
  writeTeachers,
  writeTerm,
  writeTermHistory,
  type FileShas,
  type TermData,
} from "../domain/data";
import type { Goal } from "../domain/goal";
import type { ScheduleEntry } from "../domain/schedule";
import type { Student } from "../domain/student";
import type { StudentField } from "../domain/studentField";
import type { Activity, Role, Teacher } from "../domain/teacher";
import { startOfDay, toISODate } from "../domain/dates";
import {
  buildTermSnapshot,
  isAutoArchiveDue,
  type ArchivedTerm,
  type Term,
  type TermSnapshot,
} from "../domain/term";
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
  client: DataClient | null;
  // Id lookups, populated only when ready (empty maps otherwise).
  teacherById: Map<string, Teacher>;
  studentById: Map<string, Student>;
  // Persist the roster: writes students.csv and updates state in place.
  saveStudents: (students: Student[]) => Promise<void>;
  // Persist goals: writes goals.csv and updates state in place.
  saveGoals: (goals: Goal[]) => Promise<void>;
  // Persist term metadata (label, dates, closures): writes term.json.
  saveTerm: (term: Term) => Promise<void>;
  // Past terms (oldest → newest), held in memory with its blob sha tracked so
  // saves never re-read it. Includes the current term once it's finished.
  termHistory: ArchivedTerm[];
  // Finish (archive) the current term: snapshot the live caseload into history
  // and stamp term.json finished, leaving roster/teachers/goals/schedule intact.
  // `finishedOn` is the ISO date to record (today). Returns the snapshot taken.
  finishTerm: (finishedOn: string) => Promise<TermSnapshot>;
  // Upsert a term directly into history (the new-term wizard archives the outgoing
  // term this way before term.json is overwritten with the new one).
  archiveTermToHistory: (term: ArchivedTerm) => Promise<void>;
  // Reverse the most recent archive: strip `finishedOn` from term.json and remove
  // the matching history entry. Used by the undoable auto-archive notice.
  undoFinishTerm: () => Promise<void>;
  // Set when a term was archived automatically (overdue on open, or defensively
  // before a roster edit) — drives the undoable notice. null once dismissed/undone.
  autoArchiveNotice: { label: string; finishedOn: string } | null;
  dismissAutoArchiveNotice: () => void;
  // Persist teachers: writes teachers.json and updates state in place.
  saveTeachers: (teachers: Teacher[]) => Promise<void>;
  // Persist the schedule: writes schedule.csv and updates state in place.
  saveSchedule: (schedule: ScheduleEntry[]) => Promise<void>;
  // Persist the shared activity catalog: writes activities.json.
  saveActivities: (activities: Activity[]) => Promise<void>;
  // Persist the shared news-role catalog: writes news-roles.json.
  saveNewsRoles: (roles: Role[]) => Promise<void>;
  // Persist the configurable student-field catalog: writes student-fields.json.
  saveStudentFields: (fields: StudentField[]) => Promise<void>;
}

const TermContext = createContext<TermContextValue | null>(null);

export function TermProvider({ children }: { children: ReactNode }) {
  const { keys, testMode, demoMode } = useAuth();
  const [state, setState] = useState<TermState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const shasRef = useRef<FileShas>({});
  // The current field catalog, mirrored in a ref so saveStudents (a [client]-dep
  // callback) can read it without a stale closure when writing dynamic columns.
  const studentFieldsRef = useRef<StudentField[]>([]);
  // Latest ready data, mirrored so finishTerm (a [client]-dep callback) can
  // snapshot the live caseload without a stale closure or a state dependency.
  // Save callbacks update it eagerly (before the next render) so a synchronous
  // chain of saves — e.g. the new-term wizard's saveTerm→saveTeachers — never
  // reads a stale term and mis-fires the overdue-archive safety net below.
  const dataRef = useRef<TermData | null>(null);
  dataRef.current = state.status === "ready" ? state.data : null;
  // Past terms, kept in memory and mirrored in a ref so the archive callbacks
  // mutate/write it without re-reading (see loadTermHistory in data.ts).
  const [termHistory, setTermHistory] = useState<ArchivedTerm[]>([]);
  const termHistoryRef = useRef<ArchivedTerm[]>([]);
  termHistoryRef.current = termHistory;
  const [autoArchiveNotice, setAutoArchiveNotice] = useState<
    { label: string; finishedOn: string } | null
  >(null);
  // The term key we've already tried to auto-archive this session, so the
  // on-open check fires at most once per term (idempotent under StrictMode).
  const autoArchiveKeyRef = useRef<string | null>(null);

  const client = useMemo<DataClient | null>(() => {
    // Demo mode reads/writes the localStorage sandbox; otherwise the GitHub repo.
    if (demoMode) return new LocalFsClient();
    return keys ? new GitHubClient({ token: keys.githubToken, ...REPO_CONFIG }) : null;
  }, [keys, demoMode]);

  useEffect(() => {
    // Test mode pretends the repo is empty without touching GitHub.
    if (testMode) {
      setTermHistory([]);
      setState({ status: "empty" });
      return;
    }
    if (!client) {
      setState({ status: "loading" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    // In demo mode, seed the sandbox first (idempotent — no-op once populated).
    (demoMode ? seedDemoFs(client) : Promise.resolve())
      .then(() => Promise.all([loadTermData(client), loadTermHistory(client)]))
      .then(([loaded, hist]) => {
        if (cancelled) return;
        setTermHistory(hist.history);
        if (loaded) {
          shasRef.current = { ...loaded.shas, termHistory: hist.sha };
          studentFieldsRef.current = loaded.data.studentFields;
          setState({ status: "ready", data: loaded.data });
        } else {
          shasRef.current = { termHistory: hist.sha };
          studentFieldsRef.current = [];
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
  }, [client, testMode, demoMode, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Persist the in-memory history with its tracked sha (never re-reads), updating
  // the sha/ref/state. Returns nothing — callers have already built `next`.
  const persistHistory = useCallback(
    async (next: ArchivedTerm[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const histSha = await writeTermHistory(client, next, shasRef.current.termHistory);
      shasRef.current = { ...shasRef.current, termHistory: histSha };
      termHistoryRef.current = next;
      setTermHistory(next);
    },
    [client],
  );

  // Core archive: snapshot the live caseload, write it to history, stamp term.json
  // finished, and update sha/state/ref. `notify` raises the undoable banner used
  // by the automatic paths (manual Finish stays silent).
  const doArchive = useCallback(
    async (finishedOn: string, notify: boolean) => {
      if (!client) throw new Error("Not connected to the data repo");
      const data = dataRef.current;
      if (!data) throw new Error("No term to finish");
      const { term, students, teachers, goals } = data;
      const snapshot = buildTermSnapshot(term, students, teachers, goals, finishedOn);
      const finished: Term = { ...term, finishedOn };
      await persistHistory(upsertTermHistory(termHistoryRef.current, { ...finished, snapshot }));
      const termSha = await writeTerm(client, finished, shasRef.current.term);
      shasRef.current = { ...shasRef.current, term: termSha };
      dataRef.current = { ...data, term: finished };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, term: finished } } : prev,
      );
      if (notify) setAutoArchiveNotice({ label: finished.label, finishedOn });
      return snapshot;
    },
    [client, persistHistory],
  );

  const finishTerm = useCallback((finishedOn: string) => doArchive(finishedOn, false), [doArchive]);

  const archiveTermToHistory = useCallback(
    (term: ArchivedTerm) => persistHistory(upsertTermHistory(termHistoryRef.current, term)),
    [persistHistory],
  );

  // Safety net: before the first roster/teacher overwrite once a term is over but
  // not yet finished, archive it — so the snapshot reflects the true end-of-term
  // caseload rather than the roster about to be edited (e.g. next-year prep).
  const archiveOverdueBeforeEdit = useCallback(async () => {
    const data = dataRef.current;
    if (!data) return;
    const { term } = data;
    if (term.finishedOn || !term.lastDay) return;
    const today = toISODate(startOfDay(new Date()));
    if (today >= term.lastDay) await doArchive(today, true);
  }, [doArchive]);

  const undoFinishTerm = useCallback(async () => {
    if (!client) throw new Error("Not connected to the data repo");
    const data = dataRef.current;
    if (!data || !data.term.finishedOn) return;
    const archived = data.term;
    const reverted: Term = { ...archived };
    delete reverted.finishedOn;
    await persistHistory(removeFromTermHistory(termHistoryRef.current, archived));
    const termSha = await writeTerm(client, reverted, shasRef.current.term);
    shasRef.current = { ...shasRef.current, term: termSha };
    dataRef.current = { ...data, term: reverted };
    setState((prev) =>
      prev.status === "ready" ? { ...prev, data: { ...prev.data, term: reverted } } : prev,
    );
    setAutoArchiveNotice(null);
  }, [client, persistHistory]);

  const dismissAutoArchiveNotice = useCallback(() => setAutoArchiveNotice(null), []);

  // Auto-archive an overdue term the next time the app loads past its grace window.
  // Idempotent: keyed per term, and a no-op once `finishedOn` is set.
  useEffect(() => {
    if (state.status !== "ready") return;
    const term = state.data.term;
    const today = toISODate(startOfDay(new Date()));
    if (!isAutoArchiveDue(term, today)) return;
    const key = `${term.termType}|${term.firstDay}|${term.lastDay}`;
    if (autoArchiveKeyRef.current === key) return;
    autoArchiveKeyRef.current = key;
    void doArchive(today, true).catch(() => {
      autoArchiveKeyRef.current = null; // let a later load retry
    });
  }, [state, doArchive]);

  const saveStudents = useCallback(
    async (students: Student[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      await archiveOverdueBeforeEdit();
      const newSha = await writeStudents(
        client,
        students,
        studentFieldsRef.current,
        shasRef.current.students,
      );
      shasRef.current = { ...shasRef.current, students: newSha };
      const data = dataRef.current;
      if (data) dataRef.current = { ...data, students };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, students } } : prev,
      );
    },
    [client, archiveOverdueBeforeEdit],
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
      const data = dataRef.current;
      if (data) dataRef.current = { ...data, term };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, term } } : prev,
      );
    },
    [client],
  );

  const saveTeachers = useCallback(
    async (teachers: Teacher[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      await archiveOverdueBeforeEdit();
      const newSha = await writeTeachers(client, teachers, shasRef.current.teachers);
      shasRef.current = { ...shasRef.current, teachers: newSha };
      const data = dataRef.current;
      if (data) dataRef.current = { ...data, teachers };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, teachers } } : prev,
      );
    },
    [client, archiveOverdueBeforeEdit],
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

  const saveActivities = useCallback(
    async (activities: Activity[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeActivities(client, activities, shasRef.current.activities);
      shasRef.current = { ...shasRef.current, activities: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, activities } } : prev,
      );
    },
    [client],
  );

  const saveNewsRoles = useCallback(
    async (newsRoles: Role[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeNewsRoles(client, newsRoles, shasRef.current.newsRoles);
      shasRef.current = { ...shasRef.current, newsRoles: newSha };
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, newsRoles } } : prev,
      );
    },
    [client],
  );

  const saveStudentFields = useCallback(
    async (studentFields: StudentField[]) => {
      if (!client) throw new Error("Not connected to the data repo");
      const newSha = await writeStudentFields(client, studentFields, shasRef.current.studentFields);
      shasRef.current = { ...shasRef.current, studentFields: newSha };
      studentFieldsRef.current = studentFields;
      setState((prev) =>
        prev.status === "ready" ? { ...prev, data: { ...prev.data, studentFields } } : prev,
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
      termHistory,
      finishTerm,
      archiveTermToHistory,
      undoFinishTerm,
      autoArchiveNotice,
      dismissAutoArchiveNotice,
      saveTeachers,
      saveSchedule,
      saveActivities,
      saveNewsRoles,
      saveStudentFields,
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
      termHistory,
      finishTerm,
      archiveTermToHistory,
      undoFinishTerm,
      autoArchiveNotice,
      dismissAutoArchiveNotice,
      saveTeachers,
      saveSchedule,
      saveActivities,
      saveNewsRoles,
      saveStudentFields,
    ],
  );

  return <TermContext.Provider value={value}>{children}</TermContext.Provider>;
}

export function useTerm(): TermContextValue {
  const ctx = useContext(TermContext);
  if (!ctx) throw new Error("useTerm must be used inside <TermProvider>");
  return ctx;
}
