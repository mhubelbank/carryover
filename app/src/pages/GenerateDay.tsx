import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { resolvePipeline, PROVIDER_META, type PipelineId, type Provider } from "../clients/models";
import { isOutOfCredits } from "../clients/llm";
import { getPipelineId, setPipelineId } from "../clients/modelPref";
import { removeFromBatch } from "../clients/batch";
import { appendFeedbackRule, loadFeedbackRules, loadGoldenExamples, loadSession, writeSessionMetadata } from "../domain/data";
import { formatLong, parseDate } from "../domain/dates";
import { activityOptionsForGenerate } from "../domain/activity";
import { resolveRoles } from "../domain/role";
import { absentNote, type ActivityDef } from "../domain/generate";
import { MAX_TOKENS_BY_MODE, conjugatePastForms, generateNote, loadPromptSet, type PromptSet } from "../domain/notes";
import { buildPostProcess } from "../domain/captures";
import { displayName, isActiveOn, type Student } from "../domain/student";
import { teacherColor, type Mode } from "../domain/teacher";
import { cannedNote } from "../demo/cannedNote";
import { storage, StorageKeys } from "../clients/storage";
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
}

interface SessionDraft {
  mode: Mode;
  activities: ActivityDef[];
  studentState: Record<string, StudentState>;
}

const sessionKey = (teacherId: string, timeSlot: string) => `${teacherId}|${timeSlot}`;

// Per-session "readiness" from its draft: how many included, non-absent students
// have at least one substantive entry (activity / prompting / trial).
type ReadyState = "ready" | "partial" | "empty";

// Readiness from a session's draft (StudentState has no mode field — the draft's
// mode governs whether news-role or regular-activity entry counts).
function draftReadiness(draft: SessionDraft): ReadyState {
  const includedIds = Object.keys(draft.studentState).filter(
    (id) => draft.studentState[id]?.included && !draft.studentState[id]?.absent,
  );
  if (includedIds.length === 0) return "empty";
  const activeMode = draft.mode;
  const entered = includedIds.filter((id) => {
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
  if (entered.length === 0) return "empty";
  // Regular mode also needs at least one selected activity to be truly "ready".
  const hasActivity = activeMode === "news-day" || draft.activities.some((a) => a.activityId);
  if (entered.length === includedIds.length && hasActivity) return "ready";
  return "partial";
}

interface Props {
  date: string;
  sessions: SessionSpec[];
  onClose: () => void;
  onNavigate: (page: NavPage) => void;
  onReviewIep?: (studentId: string) => void;
}

export function GenerateDay({ date, sessions, onClose, onNavigate, onReviewIep }: Props) {
  const { state, client, saveGoals } = useTerm();
  const { keys, demoMode } = useAuth();

  const [pipelineId, setPipelineIdState] = useState(getPipelineId);
  const changeModel = (id: PipelineId) => {
    setPipelineIdState(id);
    setPipelineId(id);
  };
  const pipeline = resolvePipeline(pipelineId);
  const pipelinePasses = {
    draft: { provider: pipeline.provider, model: pipeline.draft.model },
    review: { provider: pipeline.provider, model: pipeline.review.model },
    streamline: { provider: pipeline.provider, model: pipeline.streamline.model },
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

  // Build per-session drafts once on mount, restoring any saved snapshot for the
  // session (date · teacher · slot) and seeding fresh otherwise.
  const initialDrafts = useMemo<Record<string, SessionDraft>>(() => {
    if (state.status !== "ready") return {};
    const { students: allStudents, teachers } = state.data;
    const day = parseDate(date);
    const out: Record<string, SessionDraft> = {};
    for (const sp of sessions) {
      const teacher = teachers.find((t) => t.id === sp.teacherId);
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const snap = loadFormSnapshot(date, sp.teacherId, sp.timeSlot);
      const caseload = allStudents.filter(
        (s) => !s.archived && s.teacherId === sp.teacherId && (!day || isActiveOn(s, day)),
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
  }, [state, sessions, date]);

  const [drafts, setDrafts] = useState<Record<string, SessionDraft>>(initialDrafts);
  // Reseed if the day/sessions change (a fresh takeover always remounts, but be safe).
  useEffect(() => setDrafts(initialDrafts), [initialDrafts]);
  // This is a full-screen takeover, so reset scroll to the top when it opens
  // (otherwise it inherits Today's scroll position).
  useEffect(() => window.scrollTo(0, 0), []);

  const [activeKey, setActiveKey] = useState<string>(() =>
    sessions.length ? sessionKey(sessions[0]!.teacherId, sessions[0]!.timeSlot) : "",
  );

  const [phase, setPhase] = useState<"form" | "running" | "results">("form");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  // Becomes true once she edits any session — surfaces a "Save and close" so it's
  // clear the inputs persist and she can keep adding through the day.
  const [dirty, setDirty] = useState(false);

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
    }, 800);
  };

  if (state.status !== "ready") return null;
  const { students: allStudents, goals, teachers } = state.data;
  const catalog = state.data.activities;
  const roleCatalog = state.data.newsRoles;
  const day = parseDate(date);

  const specByKey = new Map(sessions.map((sp) => [sessionKey(sp.teacherId, sp.timeSlot), sp]));
  const activeSpec = specByKey.get(activeKey);
  const activeTeacher = teachers.find((t) => t.id === activeSpec?.teacherId);
  const activeDraft = drafts[activeKey];

  const caseloadFor = (teacherId: string) =>
    allStudents.filter(
      (s) => !s.archived && s.teacherId === teacherId && (!day || isActiveOn(s, day)),
    );

  // Total included, non-absent students across READY sessions (the batch size).
  const readyByKey = useMemo(() => {
    const m: Record<string, ReadyState> = {};
    for (const sp of sessions) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      const d = drafts[key];
      m[key] = d ? draftReadiness(d) : "empty";
    }
    return m;
  }, [drafts, sessions]);

  const readyCount = useMemo(() => {
    let n = 0;
    for (const sp of sessions) {
      const key = sessionKey(sp.teacherId, sp.timeSlot);
      if (readyByKey[key] !== "ready") continue;
      const d = drafts[key];
      if (!d) continue;
      n += Object.values(d.studentState).filter((st) => st.included && !st.absent).length;
    }
    return n;
  }, [readyByKey, drafts, sessions]);

  const updateActiveDraft = (patch: Partial<SessionDraft>) => {
    if (!activeSpec) return;
    setDirty(true);
    setDrafts((prev) => {
      const cur = prev[activeKey]!;
      const next = { ...cur, ...patch };
      scheduleSave(activeSpec, next);
      return { ...prev, [activeKey]: next };
    });
  };

  // Flush every session's draft to its snapshot immediately (cancelling pending
  // debounced saves) so nothing in-flight is lost, then close.
  const saveAndClose = () => {
    for (const sp of sessions) {
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
    const extra = caseload.filter(
      (s) => !sp.studentIds.includes(s.id) && (draft.studentState[s.id]?.included ?? false),
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
    const readySpecs = sessions.filter(
      (sp) => readyByKey[sessionKey(sp.teacherId, sp.timeSlot)] === "ready",
    );
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
          pipeline.streamline.model,
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

    // Per-session: write session metadata (keyed by date+teacher, like the
    // single-session flow) and refresh the snapshot so a later return restores it.
    // TODO(v1): schedule roster write-back (Generate's setCellRoster/week-schedule
    // block) is intentionally skipped here to keep the batch tractable. Note: a
    // teacher with multiple slots in one day shares one metadata file (date+teacher),
    // so the last slot wins — same limitation as the single-session flow.
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
      // Generating the batch empties it.
      removeFromBatch(date, sp.teacherId, sp.timeSlot);
    }

    setPhase("results");
  }

  // Regenerate a set of notes by mapping each student back to its session draft.
  async function regenerate(studentIds: string[], feedback = "", saveAsRule = false) {
    if (!client || (!hasModelKey && !useCanned) || studentIds.length === 0) return;
    // Resolve each studentId back to its owning session's target.
    const lookups = studentIds
      .map((id) => {
        for (const sp of sessions) {
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
          pipeline.streamline.model,
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
    ready: { glyph: "✓", color: "var(--color-text-success)", title: "Ready" },
    partial: { glyph: "◐", color: "var(--color-text-warning)", title: "Partially filled in" },
    empty: { glyph: "○", color: "var(--color-text-tertiary)", title: "Empty" },
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
          maxWidth: 880,
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
          Write today's notes — {longDate}
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {dirty && (
            <button
              className="button button--small"
              onClick={saveAndClose}
              title="Your inputs are saved — you can come back and keep adding through the day"
            >
              Save and close
            </button>
          )}
          <button
            className="button button--ghost button--small"
            onClick={saveAndClose}
            title="Close (your inputs are saved)"
            style={{ padding: 6, color: "var(--color-text-secondary)", display: "flex" }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
      </div>

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
          {sessions.map((sp) => {
            const key = sessionKey(sp.teacherId, sp.timeSlot);
            const teacher = teachers.find((t) => t.id === sp.teacherId);
            const ready = readyByKey[key] ?? "empty";
            const dot = STATUS_DOT[ready];
            const isActive = key === activeKey;
            return (
              <button
                key={key}
                onClick={() => setActiveKey(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 13,
                  padding: "8px 10px",
                  marginBottom: 2,
                  borderRadius: "var(--border-radius-md)",
                  border: "none",
                  cursor: "pointer",
                  background: isActive ? "var(--color-background-pill)" : "transparent",
                  color: "var(--color-text-primary)",
                  borderLeft: `3px solid ${isActive ? teacherColor(teacher?.color).bg : "transparent"}`,
                }}
              >
                <span style={{ color: dot.color, width: 14, flexShrink: 0 }} title={dot.title}>
                  {dot.glyph}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {sp.timeSlot} · {teacher?.name ?? "Unknown"}
                </span>
              </button>
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
                  {activeSpec.timeSlot} · {activeTeacher.name}
                </h2>
                {activeTeacher.modes.length > 1 && (
                  <select
                    className="select"
                    value={activeDraft.mode}
                    onChange={(e) => updateActiveDraft({ mode: e.target.value as Mode })}
                    style={{ width: "auto", marginLeft: "auto", height: 30, fontSize: 13 }}
                  >
                    {activeTeacher.modes.map((m) => (
                      <option key={m} value={m}>
                        {m === "regular" ? "Regular" : "News day"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
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
            disabled={readyCount === 0 || phase === "running" || (!hasModelKey && !useCanned)}
          >
            {phase === "running"
              ? progress
                ? `Generating… ${progress.current} of ${progress.total} done`
                : "Generating…"
              : `Generate all ready — ${readyCount} note${readyCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
