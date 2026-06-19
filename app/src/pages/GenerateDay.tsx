import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { resolvePipeline, PROVIDER_META, type PipelineId, type Provider } from "../clients/models";
import { isOutOfCredits } from "../clients/llm";
import { getPipelineId, setPipelineId } from "../clients/modelPref";
import { addToBatch, removeFromBatch } from "../clients/batch";
import { getAllNotes } from "../clients/noteCache";
import { appendFeedbackRule, loadFeedbackRules, loadGoldenExamples, loadSession, loadTermArchive, writeSessionMetadata, type TermData } from "../domain/data";
import { archiveKey } from "../domain/term";
import { formatLong, parseDate, weekdayName } from "../domain/dates";
import { slotStartMinutes } from "../domain/schedule";
import { activityOptionsForGenerate } from "../domain/activity";
import { resolveRoles } from "../domain/role";
import { absentNote, singlePromptingActivityTypes, type ActivityDef } from "../domain/generate";
import { MAX_TOKENS_BY_MODE, conjugatePastForms, generateNote, loadPromptSet, type PromptSet } from "../domain/notes";
import { buildPostProcess } from "../domain/captures";
import { displayName, isActiveOn, type Student } from "../domain/student";
import { teacherColor, type Mode } from "../domain/teacher";
import { cannedNote } from "../demo/cannedNote";
import { storage, StorageKeys } from "../clients/storage";
import { buildSessions } from "./Today";
import {
  SessionInputs,
  ResultsView,
  buildContext,
  noteWarnings,
  collectTrialVerbs,
  buildVarietyNote,
  goalsWithMeasuredFromTrials,
  buildSessionMetadata,
  runPool,
  GENERATE_CONCURRENCY,
  loadFormSnapshot,
  saveFormSnapshot,
  blankActivity,
  blankRegularInput,
  blankNews,
  type ResultRow,
  type StudentState,
} from "./Generate";

interface SessionSpec {
  teacherId: string;
  timeSlot: string;
  studentIds: string[];
  // The teacher's real time slots that day (a teacher does the same activity for
  // all of them, so the batch groups them into one entry). Used for batch-store
  // bookkeeping (add/remove the underlying per-slot refs).
  slots?: string[];
}

interface SessionDraft {
  mode: Mode;
  activities: ActivityDef[];
  studentState: Record<string, StudentState>;
}

// The batch groups a teacher's whole day into one entry; this synthetic slot keys
// that entry (and the cached notes), matching Generate's "All sessions" value.
const WHOLE_DAY = "All sessions";

const sessionKey = (teacherId: string, timeSlot: string) => `${teacherId}|${timeSlot}`;

// Per-session "readiness" from its draft: how many included, non-absent students
// have at least one substantive entry (activity / prompting / trial).
type ReadyState = "ready" | "partial" | "empty";

// Readiness from a session's draft (StudentState has no mode field — the draft's
// mode governs whether news-role or regular-activity entry counts).
function draftReadiness(draft: SessionDraft): ReadyState {
  const included = Object.keys(draft.studentState).filter((id) => draft.studentState[id]?.included);
  if (included.length === 0) return "empty";
  const nonAbsent = included.filter((id) => !draft.studentState[id]?.absent);
  const anyAbsent = nonAbsent.length < included.length;
  // Every included student is absent — the session is complete (it generates absent
  // notes, which need no input). This is the case the old "non-absent only" filter
  // wrongly reported as empty.
  if (nonAbsent.length === 0) return "ready";
  const activeMode = draft.mode;
  const entered = nonAbsent.filter((id) => {
    const st = draft.studentState[id]!;
    if (activeMode === "news-day") return !!st.roleId || (st.newsGoalIds?.length ?? 0) > 0;
    return (st.regular ?? []).some(
      (a) =>
        a.goals.length > 0 ||
        a.promptingLevel.length > 0 ||
        a.promptingType.length > 0 ||
        (a.additionalNotes ?? "").trim().length > 0 ||
        (a.trials?.entries ?? []).length > 0,
    );
  });
  // Regular mode also needs at least one selected activity to be truly "ready".
  const hasActivity = activeMode === "news-day" || draft.activities.some((a) => a.activityId);
  if (entered.length === nonAbsent.length && hasActivity) return "ready";
  // Nothing entered and nobody absent → empty; otherwise some students are handled
  // (absent or entered) and some are pending → partial.
  if (entered.length === 0 && !anyAbsent) return "empty";
  return "partial";
}

interface Props {
  date: string;
  sessions: SessionSpec[];
  onClose: () => void;
  onNavigate: (page: NavPage) => void;
  onReviewIep?: (studentId: string) => void;
  onOpenStudent?: (id: string, view?: "detail" | "goals") => void;
}

export function GenerateDay({ date, sessions, onClose, onNavigate, onReviewIep, onOpenStudent }: Props) {
  const { state, client, saveGoals, termHistory } = useTerm();
  const { keys, demoMode } = useAuth();

  // Past-term batches: when the day falls in a finished term, the whole view reads
  // from that term's frozen archive (genData) instead of the live term — mirrors
  // Generate. The date is fixed for this view, so the term resolves once.
  const liveData = state.status === "ready" ? state.data : null;
  const [pastData, setPastData] = useState<TermData | null>(null);
  const [pastApprox, setPastApprox] = useState(false);
  const dateTermKey = useMemo(() => {
    if (!date) return null;
    if (liveData && date >= liveData.term.firstDay && date <= liveData.term.lastDay) return null;
    const past = termHistory.find(
      (t) => t.firstDay && t.lastDay && date >= t.firstDay && date <= t.lastDay,
    );
    return past ? archiveKey(past) : null;
  }, [date, liveData, termHistory]);
  const pastMode = dateTermKey !== null;
  const genData: TermData | null = pastMode ? pastData : liveData;
  const pastTermLabel = useMemo(
    () => termHistory.find((t) => archiveKey(t) === dateTermKey)?.label ?? "a previous term",
    [termHistory, dateTermKey],
  );
  useEffect(() => {
    if (!dateTermKey) {
      setPastData(null);
      setPastApprox(false);
      return;
    }
    const entry = termHistory.find((t) => archiveKey(t) === dateTermKey);
    let cancelled = false;
    const reconstruct = (): TermData | null =>
      entry && liveData
        ? {
            term: entry,
            teachers: liveData.teachers,
            students: liveData.students,
            goals: liveData.goals,
            schedule: liveData.schedule,
            activities: liveData.activities,
            newsRoles: liveData.newsRoles,
            studentFields: liveData.studentFields,
          }
        : null;
    setPastData(null);
    if (!client) {
      setPastData(reconstruct());
      setPastApprox(true);
      return;
    }
    loadTermArchive(client, dateTermKey)
      .then((arch) => {
        if (cancelled) return;
        setPastData(arch ?? reconstruct());
        setPastApprox(!arch);
      })
      .catch(() => {
        if (cancelled) return;
        setPastData(reconstruct());
        setPastApprox(true);
      });
    return () => {
      cancelled = true;
    };
    // liveData omitted on purpose (read via closure); re-running on live-data
    // changes would clobber a loaded archive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateTermKey, client, termHistory]);

  const [pipelineId, setPipelineIdState] = useState(getPipelineId);
  const changeModel = (id: PipelineId) => {
    setPipelineIdState(id);
    setPipelineId(id);
  };
  const pipeline = resolvePipeline(pipelineId);
  // Two passes: premium draft → one conservative review (no streamline pass).
  const pipelinePasses = {
    draft: { provider: pipeline.provider, model: pipeline.draft.model },
    review: { provider: pipeline.provider, model: pipeline.review.model },
  };
  const providerKey = pipeline.provider === "openai" ? keys?.openaiApiKey : keys?.anthropicApiKey;
  const hasModelKey = providerKey != null && providerKey.length > 0;
  const useCanned = demoMode && !hasModelKey;

  // Sticky out-of-credits flag for the selected provider (mirrors Generate, minus
  // the per-provider persistence detail — v1 keeps it simple but non-crashing).
  const [creditsOutProvider, setCreditsOutProvider] = useState<Provider | null>(null);
  const creditBanner =
    creditsOutProvider === pipeline.provider ? (
      <div className="banner banner--warning" style={{ marginBottom: "1rem" }}>
        <Icon name="alert-circle" size={16} />
        <span>
          Your {PROVIDER_META[pipeline.provider].label} account is out of credits. Add credit or
          switch pipelines in the results view, then regenerate.
        </span>
      </div>
    ) : null;

  // How the rail is organized: one row per teacher (their whole day, shared
  // activity — the default, matching her workflow) or one per teacher × slot.
  const [groupBy, setGroupBy] = useState<"teacher" | "session">("teacher");
  const byTeacher = groupBy === "teacher";

  // Sessions on this day that already have generated notes (in the local cache),
  // keyed by sessionKey → earliest generation timestamp. Drives the "✓ generated"
  // rail markers and the "restored from generation at …" note. In teacher mode a
  // note maps to the teacher's WHOLE_DAY key; in session mode to its real slot.
  const [genAt, setGenAt] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    let cancelled = false;
    getAllNotes()
      .then((all) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const n of all) {
          if (n.date !== date) continue;
          const k = sessionKey(n.teacherId, byTeacher ? WHOLE_DAY : n.timeSlot);
          const prev = m.get(k);
          m.set(k, prev == null ? n.generatedAt : Math.min(prev, n.generatedAt));
        }
        setGenAt(m);
      })
      .catch(() => {
        if (!cancelled) setGenAt(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [date, byTeacher]);

  // Teachers removed from this batch via the rail's × (by teacherId).
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  // The rail: in "teacher" mode, ONE row per teacher = their whole day (a teacher
  // does the same activity for every session that day), studentIds = union of
  // their slots, `slots` = the underlying time slots. In "session" mode, one row
  // per teacher × slot. Either way only what she added to the batch shows (a cached
  // note never auto-adds a row); `removed` keys match the row id of the mode.
  const railSpecs = useMemo<SessionSpec[]>(() => {
    const day = genData ? parseDate(date) : null;
    const daySessions = genData && day ? buildSessions(genData.schedule, weekdayName(day)) : [];

    if (!byTeacher) {
      const byKey = new Map<string, SessionSpec>();
      for (const sp of daySessions)
        byKey.set(sessionKey(sp.teacherId, sp.timeSlot), { ...sp, slots: [sp.timeSlot] });
      for (const sp of sessions)
        byKey.set(sessionKey(sp.teacherId, sp.timeSlot), { ...sp, slots: [sp.timeSlot] });
      const batchedKeys = new Set(sessions.map((sp) => sessionKey(sp.teacherId, sp.timeSlot)));
      return [...byKey.values()]
        .filter((sp) => batchedKeys.has(sessionKey(sp.teacherId, sp.timeSlot)) && !removed.has(sessionKey(sp.teacherId, sp.timeSlot)))
        .sort((a, b) => slotStartMinutes(a.timeSlot) - slotStartMinutes(b.timeSlot));
    }

    // Per-teacher accumulators: union of students, real slots, earliest start.
    type Acc = { students: string[]; slots: string[]; start: number };
    const acc = new Map<string, Acc>();
    const bump = (teacherId: string, timeSlot: string, studentIds: string[]) => {
      const a = acc.get(teacherId) ?? { students: [], slots: [], start: Infinity };
      for (const id of studentIds) if (!a.students.includes(id)) a.students.push(id);
      if (!a.slots.includes(timeSlot)) a.slots.push(timeSlot);
      a.start = Math.min(a.start, slotStartMinutes(timeSlot));
      acc.set(teacherId, a);
    };
    for (const sp of daySessions) bump(sp.teacherId, sp.timeSlot, sp.studentIds);
    for (const sp of sessions) bump(sp.teacherId, sp.timeSlot, sp.studentIds);

    const batchedTeachers = new Set(sessions.map((sp) => sp.teacherId));
    const teacherIds = [...acc.keys()].filter(
      (tid) => batchedTeachers.has(tid) && !removed.has(tid),
    );
    return teacherIds
      .map((tid) => {
        const a = acc.get(tid)!;
        return { teacherId: tid, timeSlot: WHOLE_DAY, studentIds: a.students, slots: a.slots };
      })
      .sort((x, y) => (acc.get(x.teacherId)!.start ?? 0) - (acc.get(y.teacherId)!.start ?? 0));
  }, [genData, sessions, date, removed, byTeacher]);

  // Build per-session drafts, restoring any saved snapshot for the session
  // (date · teacher · slot) and seeding fresh otherwise. Generated sessions keep
  // their snapshot (re-saved at generation), so re-editing restores those inputs.
  const initialDrafts = useMemo<Record<string, SessionDraft>>(() => {
    if (!genData) return {};
    const { students: allStudents, teachers } = genData;
    const day = parseDate(date);
    const out: Record<string, SessionDraft> = {};
    for (const sp of railSpecs) {
      const teacher = teachers.find((t) => t.id === sp.teacherId);
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const snap = loadFormSnapshot(date, sp.teacherId, sp.timeSlot);
      const caseload = allStudents.filter(
        (s) => (pastMode || !s.archived) && s.teacherId === sp.teacherId && (!day || isActiveOn(s, day)),
      );
      const defaultMode: Mode = teacher?.modes[0] ?? "regular";
      if (snap) {
        out[key] = { mode: snap.mode, activities: snap.activities, studentState: snap.studentState };
        continue;
      }
      const studentState: Record<string, StudentState> = {};
      for (const s of caseload) {
        studentState[s.id] = {
          included: sp.studentIds.includes(s.id),
          absent: false,
          regular: [blankRegularInput()],
          roleId: "",
          news: blankNews(),
          newsGoalIds: [],
          captures: {},
        };
      }
      out[key] = { mode: defaultMode, activities: [blankActivity()], studentState };
    }
    return out;
  }, [genData, railSpecs, date, pastMode]);

  const [drafts, setDrafts] = useState<Record<string, SessionDraft>>(initialDrafts);
  // Merge in new drafts (e.g. generated sessions once the cache loads) without
  // clobbering edits already made to existing sessions.
  useEffect(() => setDrafts((prev) => ({ ...initialDrafts, ...prev })), [initialDrafts]);
  // This is a full-screen takeover, so reset scroll to the top when it opens
  // (otherwise it inherits Today's scroll position).
  useEffect(() => window.scrollTo(0, 0), []);

  const [activeKey, setActiveKey] = useState<string>(() =>
    sessions.length ? sessionKey(sessions[0]!.teacherId, WHOLE_DAY) : "",
  );
  // Keep the active row valid as the rail changes (mode toggle, removal): if the
  // current key isn't in the rail, snap to the first row.
  useEffect(() => {
    if (railSpecs.length === 0) return;
    const keys = new Set(railSpecs.map((sp) => sessionKey(sp.teacherId, sp.timeSlot)));
    if (!keys.has(activeKey)) {
      setActiveKey(sessionKey(railSpecs[0]!.teacherId, railSpecs[0]!.timeSlot));
    }
  }, [railSpecs, activeKey]);

  const [phase, setPhase] = useState<"form" | "running" | "results">("form");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  // Drives the "Saved" indicator so she can trust the form auto-saves.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Generated sessions she's clicked to re-edit (re-added to the batch). Until
  // clicked, a generated session is "locked" — shown disabled with a ✓ in the rail.
  const [reactivated, setReactivated] = useState<Set<string>>(new Set());
  // Per-session "restored from generation at <ts>" note, shown after re-editing a
  // generated session and cleared on the first edit.
  const [restoredAt, setRestoredAt] = useState<Map<string, number>>(new Map());

  // Debounced snapshot save per session whenever its draft changes (mirrors
  // Generate's autosave, but straight to the per-session snapshot store).
  const saveTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scheduleSave = (sp: SessionSpec, draft: SessionDraft) => {
    const key = sessionKey(sp.teacherId, sp.timeSlot);
    if (saveTimer.current[key]) clearTimeout(saveTimer.current[key]);
    saveTimer.current[key] = setTimeout(() => {
      const sessionSig = `${sp.teacherId}|${date}|${sp.timeSlot}|${sp.studentIds.join(",")}`;
      saveFormSnapshot({
        date,
        teacherId: sp.teacherId,
        timeSlot: sp.timeSlot,
        mode: draft.mode,
        activities: draft.activities,
        studentState: draft.studentState,
        sessionSig,
      });
      setSavedAt(Date.now());
    }, 800);
  };

  if (state.status !== "ready") return null;
  if (pastMode && !genData) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
        <div style={{ maxWidth: 920, margin: "0 auto", padding: "1.5rem" }}>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading term…</p>
        </div>
      </div>
    );
  }
  const gd = genData!;
  const { students: allStudents, goals, teachers } = gd;
  const catalog = gd.activities;
  const roleCatalog = gd.newsRoles;
  const day = parseDate(date);

  const specByKey = new Map(railSpecs.map((sp) => [sessionKey(sp.teacherId, sp.timeSlot), sp]));
  const activeSpec = specByKey.get(activeKey);
  const activeTeacher = teachers.find((t) => t.id === activeSpec?.teacherId);
  const activeDraft = drafts[activeKey];

  // The active teacher's whole day spans slots, so label each student with theirs.
  const activeSlotByStudent: Record<string, string> = (() => {
    if (!activeSpec || !day) return {};
    const slots: Record<string, string[]> = {};
    const add = (timeSlot: string, ids: string[]) =>
      ids.forEach((id) => (slots[id] ??= []).push(timeSlot));
    for (const sp of buildSessions(gd.schedule, weekdayName(day))) {
      if (sp.teacherId === activeSpec.teacherId) add(sp.timeSlot, sp.studentIds);
    }
    for (const sp of sessions) {
      if (sp.teacherId === activeSpec.teacherId) add(sp.timeSlot, sp.studentIds);
    }
    const out: Record<string, string> = {};
    for (const [id, list] of Object.entries(slots)) {
      out[id] = [...new Set(list)].sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b)).join(", ");
    }
    return out;
  })();

  // A generated session stays "locked" (disabled, ✓) until she clicks to re-edit it.
  const isLocked = (key: string) => genAt.has(key) && !reactivated.has(key);

  const caseloadFor = (teacherId: string) =>
    allStudents.filter(
      (s) => (pastMode || !s.archived) && s.teacherId === teacherId && (!day || isActiveOn(s, day)),
    );

  // Per-session readiness across the rail. Locked (generated, not re-edited)
  // sessions are excluded from generation, so their readiness is moot.
  const readyByKey = useMemo(() => {
    const m: Record<string, ReadyState> = {};
    for (const sp of railSpecs) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const d = drafts[key];
      m[key] = d ? draftReadiness(d) : "empty";
    }
    return m;
  }, [drafts, railSpecs]);

  // Pending = sessions still to generate (not already generated/locked); ready =
  // those of them with enough input. The button only fires when ALL pending are
  // ready (she removes any she's skipping with the rail ×); otherwise it shows
  // progress toward that and stays disabled.
  const { readySessionCount, pendingSessionCount } = useMemo(() => {
    let ready = 0;
    let pending = 0;
    for (const sp of railSpecs) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      if (isLocked(key)) continue;
      pending++;
      if (readyByKey[key] === "ready") ready++;
    }
    return { readySessionCount: ready, pendingSessionCount: pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyByKey, railSpecs, genAt, reactivated]);

  const updateActiveDraft = (patch: Partial<SessionDraft>) => {
    if (!activeSpec) return;
    // Editing a locked (generated) session re-enables it — same as clicking it in
    // the rail — so it's included again in the next "Generate all".
    if (isLocked(activeKey)) {
      setReactivated((s) => new Set(s).add(activeKey));
      // Re-queue the teacher's underlying slots so it returns on reopen.
      (activeSpec.slots ?? []).forEach((slot) => addToBatch(date, activeSpec.teacherId, slot));
    }
    // First edit to a just-restored session dismisses the "restored from …" note.
    setRestoredAt((m) => {
      if (!m.has(activeKey)) return m;
      const next = new Map(m);
      next.delete(activeKey);
      return next;
    });
    setDrafts((prev) => {
      const cur = prev[activeKey]!;
      const next = { ...cur, ...patch };
      scheduleSave(activeSpec, next);
      return { ...prev, [activeKey]: next };
    });
  };

  // Click a locked (generated) session to VIEW its restored inputs (from the
  // preserved snapshot) and show the "restored from generation at …" note. It
  // stays locked/greyed and out of the batch until she actually edits — at which
  // point updateActiveDraft re-enables it.
  const openGenerated = (sp: SessionSpec) => {
    const key = sessionKey(sp.teacherId, sp.timeSlot);
    const ts = genAt.get(key);
    if (ts != null) setRestoredAt((m) => new Map(m).set(key, ts));
    setActiveKey(key);
  };

  // Drop a teacher from this batch (the rail ×): hide them and clear their slots
  // from the persisted batch so they're skipped. If active, move to another row.
  const removeSession = (sp: SessionSpec) => {
    const key = sessionKey(sp.teacherId, sp.timeSlot);
    (sp.slots ?? []).forEach((slot) => removeFromBatch(date, sp.teacherId, slot));
    // `removed` is keyed to match railSpecs' filter for the current mode.
    setRemoved((s) => new Set(s).add(byTeacher ? sp.teacherId : key));
    if (activeKey === key) {
      const next = railSpecs.find((r) => sessionKey(r.teacherId, r.timeSlot) !== key);
      setActiveKey(next ? sessionKey(next.teacherId, next.timeSlot) : "");
    }
  };

  // The form auto-saves as she types (scheduleSave). On close, flush every
  // session's pending debounced save immediately so nothing in-flight is lost.
  const flushAndClose = () => {
    for (const sp of railSpecs) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const d = drafts[key];
      if (!d) continue;
      if (saveTimer.current[key]) clearTimeout(saveTimer.current[key]);
      const sessionSig = `${sp.teacherId}|${date}|${sp.timeSlot}|${sp.studentIds.join(",")}`;
      saveFormSnapshot({
        date,
        teacherId: sp.teacherId,
        timeSlot: sp.timeSlot,
        mode: d.mode,
        activities: d.activities,
        studentState: d.studentState,
        sessionSig,
      });
    }
    onClose();
  };

  // Clear just the active session's form (mirrors the one-off generator's "Clear
  // form"): one blank activity + fresh per-student inputs, roster inclusion kept
  // from the schedule. The cleared state is persisted immediately so it survives
  // a leave-and-return.
  const clearActiveForm = () => {
    if (!activeSpec) return;
    const inSession = new Set(activeSpec.studentIds);
    const studentState: Record<string, StudentState> = {};
    for (const s of caseloadFor(activeSpec.teacherId)) {
      studentState[s.id] = {
        included: inSession.has(s.id),
        absent: false,
        regular: [blankRegularInput()],
        roleId: "",
        news: blankNews(),
        newsGoalIds: [],
        captures: {},
      };
    }
    const next: SessionDraft = {
      mode: activeDraft?.mode ?? activeTeacher?.modes[0] ?? "regular",
      activities: [blankActivity()],
      studentState,
    };
    setDrafts((prev) => ({ ...prev, [activeKey]: next }));
    if (saveTimer.current[activeKey]) clearTimeout(saveTimer.current[activeKey]);
    saveFormSnapshot({
      date,
      teacherId: activeSpec.teacherId,
      timeSlot: activeSpec.timeSlot,
      mode: next.mode,
      activities: next.activities,
      studentState,
      sessionSig: `${activeSpec.teacherId}|${date}|${activeSpec.timeSlot}|${activeSpec.studentIds.join(",")}`,
    });
    setSavedAt(Date.now());
    setRestoredAt((m) => {
      if (!m.has(activeKey)) return m;
      const n = new Map(m);
      n.delete(activeKey);
      return n;
    });
  };

  const setActivities = (
    updater: ActivityDef[] | ((a: ActivityDef[]) => ActivityDef[]),
  ) => {
    if (!activeDraft) return;
    const nextActivities = typeof updater === "function" ? updater(activeDraft.activities) : updater;
    updateActiveDraft({ activities: nextActivities });
  };
  const setStudentState = (
    updater:
      | Record<string, StudentState>
      | ((s: Record<string, StudentState>) => Record<string, StudentState>),
  ) => {
    if (!activeDraft) return;
    const next =
      typeof updater === "function" ? updater(activeDraft.studentState) : updater;
    updateActiveDraft({ studentState: next });
  };

  const activeIdx = sessions.findIndex(
    (sp) => sessionKey(sp.teacherId, sp.timeSlot) === activeKey,
  );
  const goPrev = () => {
    if (activeIdx > 0) {
      const sp = sessions[activeIdx - 1]!;
      setActiveKey(sessionKey(sp.teacherId, sp.timeSlot));
    }
  };
  const goNext = () => {
    if (activeIdx < sessions.length - 1) {
      const sp = sessions[activeIdx + 1]!;
      setActiveKey(sessionKey(sp.teacherId, sp.timeSlot));
    }
  };

  // Included, non-absent students for one ready session, in schedule order.
  const includedOf = (sp: SessionSpec, draft: SessionDraft): Student[] => {
    const caseload = caseloadFor(sp.teacherId);
    const scheduled = sp.studentIds
      .map((id) => caseload.find((s) => s.id === id))
      .filter((s): s is Student => s != null && (draft.studentState[s.id]?.included ?? false));
    const extra = caseload
      .filter((s) => !sp.studentIds.includes(s.id) && (draft.studentState[s.id]?.included ?? false))
      .sort(
        (a, b) =>
          (draft.studentState[a.id]?.addedSeq ?? Infinity) -
          (draft.studentState[b.id]?.addedSeq ?? Infinity),
      );
    return [...scheduled, ...extra];
  };

  function updateResult(studentId: string, patch: Partial<ResultRow>) {
    setResults((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
  }

  // Demo: a canned note (no LLM), mirroring Generate's cannedResultFor.
  async function cannedResultFor(student: Student, included: Student[], variant = 0, st?: StudentState) {
    await new Promise((r) => setTimeout(r, 350 + Math.random() * 450));
    const studentGoals = goals.filter((g) => g.studentId === student.id && !g.archived);
    const index = Math.max(0, included.indexOf(student));
    const input =
      st?.regular.find((a) => a.promptingLevel.length > 0 || a.promptingType.length > 0) ??
      st?.regular[0];
    return {
      draft: "",
      reviewed: "",
      final: cannedNote({
        student,
        goals: studentGoals,
        index,
        variant,
        promptLevels: input?.promptingLevel,
        promptTypes: input?.promptingType,
      }),
    };
  }

  // A flat target across all ready sessions, so one runPool keeps the cache warm.
  interface Target {
    sp: SessionSpec;
    draft: SessionDraft;
    teacher: NonNullable<ReturnType<typeof teachers.find>>;
    student: Student;
    st: StudentState;
    included: Student[]; // session roster for displayName scoping
  }

  async function handleGenerateAll() {
    setError(null);
    const readySpecs = railSpecs.filter((sp) => {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      return readyByKey[key] === "ready" && !isLocked(key);
    });
    if (readySpecs.length === 0) return;
    if (!client || (!hasModelKey && !useCanned)) return;

    // Build the flat target list + the initial result rows (display name scoped
    // per session so duplicate first names disambiguate within their session).
    const targets: Target[] = [];
    const initialRows: ResultRow[] = [];
    const absentRows: { sp: SessionSpec; student: Student; included: Student[] }[] = [];
    for (const sp of readySpecs) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const draft = drafts[key]!;
      const teacher = teachers.find((t) => t.id === sp.teacherId);
      if (!teacher) continue;
      const included = includedOf(sp, draft);
      for (const student of included) {
        const st = draft.studentState[student.id]!;
        initialRows.push({
          studentId: student.id,
          name: displayName(student, included),
          absent: st.absent,
        });
        if (st.absent) {
          absentRows.push({ sp, student, included });
        } else {
          targets.push({ sp, draft, teacher, student, st, included });
        }
      }
    }
    if (initialRows.length === 0) return;

    setPhase("running");
    setResults(initialRows);

    // Absent students get a fixed note immediately.
    for (const { student, included } of absentRows) {
      updateResult(student.id, {
        result: { draft: "", reviewed: "", final: absentNote(displayName(student, included)) },
      });
    }

    const total = initialRows.length;
    let done = absentRows.length;
    setProgress({ current: done, total });

    // Load prompts per distinct mode across ready sessions (once each).
    const modes = [...new Set(readySpecs.map((sp) => drafts[sessionKey(sp.teacherId, sp.timeSlot)]!.mode))];
    const promptsByMode: Record<string, PromptSet> = {};
    if (!useCanned) {
      try {
        for (const m of modes) promptsByMode[m] = await loadPromptSet(client, m as Mode);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load prompts");
        setPhase("form");
        return;
      }
    }
    const feedbackRules = await loadFeedbackRules(client).catch(() => "");
    const goldenExamples = await loadGoldenExamples(client).catch(() => "");
    const varietyNote = buildVarietyNote(date);
    const apiKey = providerKey!;

    // Conjugate every trial verb across all ready sessions in one batched call.
    const pastForms = useCanned
      ? {}
      : await conjugatePastForms(
          apiKey,
          collectTrialVerbs(targets.map((t) => t.st)),
          pipeline.provider,
          pipeline.review.model,
        );

    await runPool(targets, GENERATE_CONCURRENCY, async (t) => {
      try {
        if (useCanned) {
          const result = await cannedResultFor(t.student, t.included, 0, t.st);
          updateResult(t.student.id, { result, warnings: [] });
          return;
        }
        const ctx = buildContext(
          t.draft.mode,
          t.teacher,
          t.student,
          t.st,
          t.draft.activities,
          goals,
          catalog,
          roleCatalog,
          pastForms,
        );
        const result = await generateNote(apiKey, promptsByMode[t.draft.mode]!, ctx, {
          passes: pipelinePasses,
          maxTokens: MAX_TOKENS_BY_MODE[t.draft.mode],
          postProcess: buildPostProcess(t.teacher, t.student),
          feedbackRules,
          goldenExamples,
          varietyNote,
          requiredPromptingTypes: singlePromptingActivityTypes(t.st.regular),
        });
        updateResult(t.student.id, {
          result,
          warnings: noteWarnings(result.final, t.student.pronouns.trim() || "they/them", t.st),
        });
        setCreditsOutProvider((cur) => (cur === pipeline.provider ? null : cur));
      } catch (e) {
        if (isOutOfCredits(e)) {
          setCreditsOutProvider(pipeline.provider);
          storage.set(StorageKeys.outOfCreditsProvider, pipeline.provider);
        }
        updateResult(t.student.id, { error: e instanceof Error ? e.message : "Failed" });
      } finally {
        done++;
        setProgress({ current: done, total });
      }
    });
    setProgress(null);

    // Goal trial-sync across the WHOLE day in ONE write — per-session writes would
    // each start from the base `goals` and clobber earlier sessions' measurements.
    // Skipped in past-term mode (documenting a prior term must not mutate live goals).
    if (!pastMode) {
      try {
        const allStates = readySpecs.flatMap((sp) => {
          const draft = drafts[sessionKey(sp.teacherId, sp.timeSlot)]!;
          return includedOf(sp, draft).map((s) => draft.studentState[s.id]!);
        });
        const updated = goalsWithMeasuredFromTrials(goals, allStates);
        if (updated) await saveGoals(updated);
      } catch {
        // best effort — the notes are already generated
      }
    }

    // Per-teacher: write session metadata (keyed by date+teacher) and refresh the
    // snapshot so a later return restores it. The rail is one entry per teacher
    // (their whole day), so the metadata file is written once — no slot clobber.
    // Schedule roster write-back is intentionally skipped in the batch flow.
    for (const sp of readySpecs) {
      const draft = drafts[sessionKey(sp.teacherId, sp.timeSlot)]!;
      const included = includedOf(sp, draft);
      try {
        const meta = buildSessionMetadata(date, sp.teacherId, draft.mode, included, draft.studentState);
        const existing = await loadSession(client, date, sp.teacherId);
        await writeSessionMetadata(client, meta, existing?.sha);
      } catch {
        // best effort
      }
      const sessionSig = `${sp.teacherId}|${date}|${sp.timeSlot}|${sp.studentIds.join(",")}`;
      saveFormSnapshot({
        date,
        teacherId: sp.teacherId,
        timeSlot: sp.timeSlot,
        mode: draft.mode,
        activities: draft.activities,
        studentState: draft.studentState,
        sessionSig,
      });
      // Generating the batch empties it (clear the teacher's underlying slots).
      (sp.slots ?? []).forEach((slot) => removeFromBatch(date, sp.teacherId, slot));
    }

    // Re-lock the just-generated sessions so the rail shows them with a ✓ (and
    // they're excluded from the next "Generate all") when she returns to the form.
    const generatedKeys = readySpecs.map((sp) => sessionKey(sp.teacherId, sp.timeSlot));
    const stamp = Date.now();
    setGenAt((m) => {
      const next = new Map(m);
      for (const k of generatedKeys) next.set(k, stamp);
      return next;
    });
    setReactivated((s) => {
      const next = new Set(s);
      for (const k of generatedKeys) next.delete(k);
      return next;
    });
    setRestoredAt((m) => {
      const next = new Map(m);
      for (const k of generatedKeys) next.delete(k);
      return next;
    });

    setPhase("results");
  }

  // Regenerate a set of notes by mapping each student back to its session draft.
  async function regenerate(studentIds: string[], feedback = "", saveAsRule = false) {
    if (!client || (!hasModelKey && !useCanned) || studentIds.length === 0) return;
    // Resolve each studentId back to its owning session's target.
    const lookups = studentIds
      .map((id) => {
        for (const sp of railSpecs) {
          const key = sessionKey(sp.teacherId, sp.timeSlot);
          const draft = drafts[key];
          if (!draft) continue;
          const teacher = teachers.find((t) => t.id === sp.teacherId);
          const st = draft.studentState[id];
          const student = allStudents.find((s) => s.id === id);
          if (teacher && st && student && st.included && !st.absent) {
            return { sp, draft, teacher, student, st, included: includedOf(sp, draft) };
          }
        }
        return null;
      })
      .filter((t): t is Target => t != null);
    if (lookups.length === 0) return;

    const apiKey = providerKey!;
    const modes = [...new Set(lookups.map((t) => t.draft.mode))];
    const promptsByMode: Record<string, PromptSet> = {};
    if (!useCanned) {
      try {
        for (const m of modes) promptsByMode[m] = await loadPromptSet(client, m as Mode);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load prompts";
        for (const id of studentIds) updateResult(id, { error: msg });
        return;
      }
    }
    const persisted = await loadFeedbackRules(client).catch(() => "");
    const feedbackRules = [persisted, feedback.trim()].filter(Boolean).join("\n");
    const goldenExamples = await loadGoldenExamples(client).catch(() => "");
    const varietyNote = buildVarietyNote(date);
    const pastForms = useCanned
      ? {}
      : await conjugatePastForms(
          apiKey,
          collectTrialVerbs(lookups.map((t) => t.st)),
          pipeline.provider,
          pipeline.review.model,
        );

    await runPool(lookups, GENERATE_CONCURRENCY, async (t) => {
      updateResult(t.student.id, { regenerating: true, regenPhase: "draft", error: undefined });
      try {
        if (useCanned) {
          const result = await cannedResultFor(
            t.student,
            t.included,
            1 + Math.floor(Math.random() * 999),
            t.st,
          );
          updateResult(t.student.id, { result, warnings: [], regenerating: false, regenPhase: undefined });
          return;
        }
        const ctx = buildContext(
          t.draft.mode,
          t.teacher,
          t.student,
          t.st,
          t.draft.activities,
          goals,
          catalog,
          roleCatalog,
          pastForms,
        );
        const result = await generateNote(apiKey, promptsByMode[t.draft.mode]!, ctx, {
          passes: pipelinePasses,
          maxTokens: MAX_TOKENS_BY_MODE[t.draft.mode],
          postProcess: buildPostProcess(t.teacher, t.student),
          feedbackRules,
          goldenExamples,
          varietyNote,
          requiredPromptingTypes: singlePromptingActivityTypes(t.st.regular),
          onPhase: (pass) => updateResult(t.student.id, { regenPhase: pass }),
        });
        updateResult(t.student.id, {
          result,
          warnings: noteWarnings(result.final, t.student.pronouns.trim() || "they/them", t.st),
          regenerating: false,
          regenPhase: undefined,
        });
        setCreditsOutProvider((cur) => (cur === pipeline.provider ? null : cur));
      } catch (e) {
        if (isOutOfCredits(e)) setCreditsOutProvider(pipeline.provider);
        updateResult(t.student.id, {
          regenerating: false,
          regenPhase: undefined,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    });
    if (saveAsRule && feedback.trim()) await appendFeedbackRule(client, feedback);
  }

  if (phase === "results") {
    return (
      <ResultsView
        date={date}
        timeSlot=""
        results={results}
        error={error}
        onBack={() => setPhase("form")}
        onNavigate={(p) => {
          onClose();
          onNavigate(p);
        }}
        onOpenStudent={
          onOpenStudent && ((id, view) => {
            onClose();
            onOpenStudent(id, view);
          })
        }
        onRegenerate={regenerate}
        pipelineId={pipelineId}
        onChangeModel={changeModel}
        modelKeyMissing={!hasModelKey}
        banner={creditBanner}
        onToggleDrafts={(id) =>
          updateResult(id, { showDrafts: !results.find((r) => r.studentId === id)?.showDrafts })
        }
      />
    );
  }

  const longDate = day ? formatLong(day) : date;
  const STATUS_DOT: Record<ReadyState, { glyph: string; color: string; title: string }> = {
    ready: { glyph: "●", color: "var(--color-text-success)", title: "Ready to generate" },
    partial: { glyph: "◐", color: "var(--color-text-warning)", title: "Partially filled in" },
    empty: { glyph: "○", color: "var(--color-text-tertiary)", title: "Empty" },
  };
  // Already-generated sessions: a ✓ in the rail (vs the ● for a complete-but-not-
  // yet-generated form). Click to re-edit and regenerate.
  const GENERATED_DOT = {
    glyph: "✓",
    color: "var(--color-text-success)",
    title: "Notes generated — click to edit and regenerate",
  };

  const activeActivityOptions = activeTeacher
    ? activityOptionsForGenerate(activeTeacher, catalog)
    : [];
  const activeRoleOptions = activeTeacher ? resolveRoles(activeTeacher, roleCatalog) : [];
  const activeCaseload = activeSpec ? caseloadFor(activeSpec.teacherId) : [];

  // Soft nudge: included students in the active session whose IEP review has
  // passed. Never blocks generation — just surfaces a review entry point.
  const todayMs = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  })();
  const iepOverdue =
    activeSpec && activeDraft
      ? includedOf(activeSpec, activeDraft).filter((s) => {
          const d = parseDate(s.nextIepReview);
          return d != null && d.getTime() < todayMs;
        })
      : [];

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
      {/* Centered to the app's usual content width, on the usual page background. */}
      <div
        style={{
          maxWidth: 920,
          margin: "0 auto",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 500, margin: 0 }}>
          {pastMode ? "Write the day's notes" : "Write today's notes"} — {longDate}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Organize the rail by teacher (whole day) or by individual session. */}
          <div
            style={{
              display: "inline-flex",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              overflow: "hidden",
              fontSize: 12,
            }}
          >
            {(["teacher", "session"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  if (groupBy === m) return;
                  setGroupBy(m);
                  setActiveKey("");
                  setRemoved(new Set());
                }}
                style={{
                  padding: "5px 10px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background: groupBy === m ? "var(--color-background-info)" : "transparent",
                  color: groupBy === m ? "var(--color-text-info)" : "var(--color-text-secondary)",
                }}
              >
                {m === "teacher" ? "By teacher" : "By session"}
              </button>
            ))}
          </div>
          {/* The form auto-saves, so the X just closes — her inputs are already
              persisted and she can reopen the day to keep adding. */}
          <button
            className="button button--ghost button--small"
            onClick={flushAndClose}
            title="Close — your inputs auto-save, so you can come back and keep adding through the day"
            style={{ padding: 6, color: "var(--color-text-secondary)", display: "flex" }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

      {pastMode && (
        <p style={{ padding: "10px 24px 0", margin: 0, fontSize: 13, color: "var(--color-text-warning)" }}>
          <Icon name="info-circle" size={13} /> Generating for {pastTermLabel} (a previous term) —
          roster &amp; goals are read-only.
          {pastApprox ? " Its original schedule is unavailable; choose each session's students." : ""}
        </p>
      )}

      {creditBanner && <div style={{ padding: "12px 24px 0" }}>{creditBanner}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left rail — session list */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: "0.5px solid var(--color-border-tertiary)",
            padding: "12px 8px",
            overflowY: "auto",
          }}
        >
          {railSpecs.map((sp) => {
            const key = sessionKey(sp.teacherId, sp.timeSlot);
            const teacher = teachers.find((t) => t.id === sp.teacherId);
            const locked = isLocked(key);
            const ready = readyByKey[key] ?? "empty";
            const dot = locked ? GENERATED_DOT : STATUS_DOT[ready];
            const isActive = key === activeKey;
            return (
              <div
                key={key}
                className="batch-rail-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 2,
                  borderRadius: "var(--border-radius-md)",
                  background: isActive ? "var(--color-background-pill)" : "transparent",
                  borderLeft: `3px solid ${isActive ? teacherColor(teacher?.color).bg : "transparent"}`,
                }}
              >
                <button
                  onClick={() => (locked ? openGenerated(sp) : setActiveKey(key))}
                  title={locked ? GENERATED_DOT.title : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    fontFamily: "inherit",
                    fontSize: 13,
                    padding: "8px 10px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: locked ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                  }}
                >
                  <span style={{ color: dot.color, width: 14, flexShrink: 0 }} title={dot.title}>
                    {dot.glyph}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {byTeacher ? (
                      <>
                        {teacher?.name ?? "Unknown"}
                        <span style={{ color: "var(--color-text-tertiary)" }}>
                          {" "}· {sp.slots?.length ?? 1} session{(sp.slots?.length ?? 1) === 1 ? "" : "s"}
                        </span>
                      </>
                    ) : (
                      <>
                        {sp.timeSlot} · {teacher?.name ?? "Unknown"}
                      </>
                    )}
                  </span>
                </button>
                <button
                  className="batch-rail-remove"
                  onClick={() => removeSession(sp)}
                  title="Remove this session from today's batch"
                  aria-label={`Remove ${teacher?.name ?? "session"} from the batch`}
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 8px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  <Icon name="x" size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Main panel — active session inputs */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "16px 24px" }}>
          {activeSpec && activeDraft && activeTeacher ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: teacherColor(activeTeacher.color).bg,
                    flexShrink: 0,
                  }}
                  aria-hidden
                />
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  {activeTeacher.name}
                  <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", fontSize: 14 }}>
                    {" "}· {activeSpec.timeSlot }
                  </span>
                </h2>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  {savedAt && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 12,
                        color: "var(--color-text-tertiary)",
                      }}
                      title="This form auto-saves — you can leave and come back to keep logging through the day."
                    >
                      <Icon name="check" size={13} />
                      Saved{" "}
                      {new Date(savedAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {activeTeacher.modes.length > 1 && (
                    <select
                      className="select"
                      value={activeDraft.mode}
                      onChange={(e) => updateActiveDraft({ mode: e.target.value as Mode })}
                      style={{ width: "auto", height: 30, fontSize: 13 }}
                    >
                      {activeTeacher.modes.map((m) => (
                        <option key={m} value={m}>
                          {m === "regular" ? "Regular" : "News day"}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    className="button button--small"
                    onClick={clearActiveForm}
                    disabled={phase === "running"}
                    title="Reset activities and every student's inputs for this session"
                  >
                    Clear form
                  </button>
                </div>
              </div>
              {restoredAt.has(activeKey) && (
                <div
                  className="banner banner--info"
                  style={{ marginBottom: "1rem" }}
                >
                  <Icon name="info-circle" size={16} />
                  <span>
                    Restored from the note generated{" "}
                    {new Date(restoredAt.get(activeKey)!).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    . Edit the form to add it to the batch.
                  </span>
                </div>
              )}
              {onReviewIep && iepOverdue.length > 0 && (
                <div
                  className="banner banner--warning"
                  style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon name="clipboard-check" size={16} />
                    <span>
                      IEP review overdue for {iepOverdue.map((s) => s.firstName).join(", ")} — notes
                      still generate; review when you can.
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {iepOverdue.map((s) => (
                      <button
                        key={s.id}
                        className="button button--small"
                        onClick={() => onReviewIep(s.id)}
                      >
                        Review {s.firstName} →
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <SessionInputs
                mode={activeDraft.mode}
                teacher={activeTeacher}
                hasSession
                caseload={activeCaseload}
                goals={goals}
                activityOptions={activeActivityOptions}
                roleOptions={activeRoleOptions}
                activities={activeDraft.activities}
                studentState={activeDraft.studentState}
                scheduledIds={activeSpec?.studentIds ?? []}
                slotByStudent={byTeacher ? activeSlotByStudent : undefined}
                setActivities={setActivities}
                setStudentState={setStudentState}
                disabled={phase === "running"}
              />
            </>
          ) : (
            <p style={{ color: "var(--color-text-secondary)" }}>No session selected.</p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)", padding: "0 24px" }}>
          {error}
        </p>
      )}

      {/* Footer — prev/next + generate-all */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderTop: "0.5px solid var(--color-border-tertiary)",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button--small" onClick={goPrev} disabled={activeIdx <= 0}>
            ‹ Prev
          </button>
          <button
            className="button button--small"
            onClick={goNext}
            disabled={activeIdx < 0 || activeIdx >= sessions.length - 1}
          >
            Next ›
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!hasModelKey && !useCanned && (
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Add your {PROVIDER_META[pipeline.provider].label} key in Settings.
            </span>
          )}
          {useCanned && (
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              Demo notes use templating logic only; no LLM calls.
            </span>
          )}
          <button
            className="button button--primary"
            onClick={handleGenerateAll}
            disabled={
              pendingSessionCount === 0 ||
              readySessionCount < pendingSessionCount ||
              phase === "running" ||
              (!hasModelKey && !useCanned)
            }
          >
            {phase === "running"
              ? progress
                ? `Generating… ${progress.current} of ${progress.total}`
                : "Generating…"
              : readySessionCount < pendingSessionCount
                ? `${readySessionCount}/${pendingSessionCount} sessions ready`
                : `Generate ${pendingSessionCount} session${pendingSessionCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
