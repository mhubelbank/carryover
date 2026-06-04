import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import {
  appendFeedbackRule,
  deleteWeekSchedule,
  loadFeedbackRules,
  loadSession,
  loadWeekSchedule,
  writeSessionMetadata,
  writeWeekSchedule,
} from "../domain/data";
import {
  formatLong,
  mondayOf,
  parseDate,
  startOfDay,
  toISODate,
  toWeekday,
  weekdayName,
} from "../domain/dates";
import {
  scheduleFingerprint,
  setCellRoster,
  sortedTimeSlots,
  type ScheduleEntry,
  type Weekday,
} from "../domain/schedule";
import {
  DOMAINS,
  NEWS_PROMPT_LEVELS,
  PRAGMATIC_QUALITY_LEVELS,
  PROMPTING_LEVELS,
  PROMPTING_TYPES,
  REDIRECTION_LEVELS,
  RESPONSE_TYPES,
  STUDIO_AUDIENCE_SKILLS,
  absentNote,
  buildRegularActivities,
  buildRoleData,
  newsContext,
  regularContext,
  resolveRolePhrase,
  type ActivityDef,
  type ActivityInput,
  type NewsFieldValues,
  type PragmaticSkillKey,
  type PragmaticSkillValue,
} from "../domain/generate";
import {
  MAX_TOKENS_BY_MODE,
  generateNote,
  loadPromptSet,
  type NoteResult,
  type Pass,
} from "../domain/notes";
import {
  activeCapturesFor,
  activityCapturesFor,
  applyActivityRewrite,
  buildAdditionalContext,
  buildPostProcess,
  evalCondition,
} from "../domain/captures";
import {
  activityOptionsForGenerate,
  catalogById,
  defaultDescription,
} from "../domain/activity";
import { resolveRoles } from "../domain/role";
import type { Goal } from "../domain/goal";
import type { SessionMetadata } from "../domain/session";
import { displayName, fullName, isActiveOn, studentContext, type Student } from "../domain/student";
import { teacherColor, type Activity, type Mode, type Role, type SessionCapture, type Teacher } from "../domain/teacher";
import { getSessionNotes, saveNotes, type CachedNote } from "../clients/noteCache";
import { storage } from "../clients/storage";
import {
  blankTrialEntry,
  blankTrials,
  eventsToPatch,
  expandEntryToEvents,
  trialEntryAction,
  trialEntrySentence,
  trialEntryStarted,
  trialError,
  trialFailedAuto,
  TRIAL_SUPPORT_LEVELS,
  TRIAL_SUPPORT_TYPES,
  type TrialData,
  type TrialEntry,
  type TrialEvent,
  type TrialSupportRow,
} from "../domain/trial";

// Symbol + short label per prompting/support type, for compact trial displays.
const PROMPT_TYPE_ICON: Record<string, IconName> = {
  verbal: "message",
  visual: "eye",
  tactile: "hand-finger",
  gestural: "hand-finger-right",
  modeled: "user",
};
const LEVEL_ABBR: Record<string, string> = {
  "no support": "Indep",
  minimal: "Min",
  moderate: "Mod",
  maximum: "Max",
};

// Shared style for a toggle button (prompting types) — active = filled pill.
function toggleBtnStyle(active: boolean, disabled = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    fontSize: 12,
    borderRadius: "var(--border-radius-md)",
    border: `0.5px solid ${active ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
    background: active ? "var(--color-background-pill)" : "transparent",
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    fontWeight: active ? 500 : 400,
    opacity: disabled ? 0.4 : 1,
  };
}

// Human-readable label for each generation pass, shown in the progress status.
const PASS_LABEL: Record<Pass, string> = {
  draft: "Drafting",
  review: "Reviewing",
  streamline: "Streamlining",
};

interface Props {
  onNavigate: (page: NavPage) => void;
  // Prefill date/teacher and pin the included student list (deep-link from
  // Today's per-session "Generate N notes" button). Consumed once on arrival.
  target?: { date: string; teacherId: string; studentIds: string[]; timeSlot?: string } | null;
  onTargetConsumed?: () => void;
  // Open a student's IEP review (soft-block nudge for overdue students).
  onReviewIep?: (studentId: string) => void;
}

interface StudentState {
  included: boolean;
  absent: boolean;
  // Regular: per-activity inputs aligned to `activities` indices.
  regular: ActivityInput[];
  // News:
  roleId: string;
  news: NewsFieldValues;
  newsGoalIds: string[];
  // Per-teacher session-capture form state, keyed first by capture name then
  // by field name. Drives the dynamic capture-form rendering and feeds
  // additionalContext / activity-rewrite in buildContext. Multiselect fields
  // store the chosen subset as a string[].
  captures: Record<string, Record<string, string | boolean | string[]>>;
}

interface ResultRow {
  studentId: string;
  name: string;
  absent: boolean;
  result?: NoteResult;
  error?: string;
  regenerating?: boolean;
  // Which pass is in flight while regenerating, for the inline progress label.
  regenPhase?: Pass;
  showDrafts?: boolean;
}

// Activity inputs start empty; the student's session defaults are applied only
// when she clicks "Use" in the form (opt-in, not auto-populated).
function blankRegularInput(): ActivityInput {
  return {
    goals: [],
    goalDetails: [],
    promptingLevel: [],
    promptingType: [],
    redirection: [],
    response: [],
    additionalNotes: "",
    captures: {},
    options: [],
    trials: blankTrials(),
  };
}

function blankActivity(): ActivityDef {
  return { activityId: "", additionalInfo: "", segmentName: "", domains: [] };
}

// In-progress Generate form, auto-saved to localStorage so it survives a refresh.
// Small + synchronous (restored in useState initializers); the bulkier generated
// note narrative lives in IndexedDB (clients/noteCache.ts) instead.
interface FormDraft {
  date: string;
  teacherId: string;
  timeSlot: string;
  mode: Mode;
  activities: ActivityDef[];
  studentState: Record<string, StudentState>;
  sessionSig: string;
}
// v3: bumped after the filming→news rename (v2) and the per-goal Trials rework
// (v3) so pre-change drafts with an incompatible shape are ignored, not restored.
const FORM_DRAFT_KEY = "generate_form_draft_v4";
function loadFormDraft(): FormDraft | null {
  try {
    const s = storage.get(FORM_DRAFT_KEY);
    return s ? (JSON.parse(s) as FormDraft) : null;
  } catch {
    return null;
  }
}
function saveFormDraft(draft: FormDraft): void {
  storage.set(FORM_DRAFT_KEY, JSON.stringify(draft));
}
function clearFormDraft(): void {
  storage.remove(FORM_DRAFT_KEY);
}

function blankNews(): NewsFieldValues {
  return {
    pragmatic: {
      maintainedAttention: { enabled: false, qualityLevel: "", promptLevel: "" },
      waitedToSpeak: { enabled: false, qualityLevel: "", promptLevel: "" },
      appropriateBehavior: { enabled: false, qualityLevel: "", promptLevel: "" },
    },
  };
}

export function Generate({ onNavigate, target, onTargetConsumed, onReviewIep }: Props) {
  const { state, client } = useTerm();
  const { keys } = useAuth();

  // Restore an auto-saved in-progress form on a plain mount (refresh), but never
  // over a deep-link target — that's a deliberately fresh session from Today.
  const [initialDraft] = useState<FormDraft | null>(() => (target ? null : loadFormDraft()));
  const [date, setDate] = useState(
    () => initialDraft?.date ?? toISODate(toWeekday(startOfDay(new Date()))),
  );
  const [teacherId, setTeacherId] = useState<string>(() => initialDraft?.teacherId ?? "");
  const [mode, setMode] = useState<Mode>(() => initialDraft?.mode ?? "regular");
  const [activities, setActivities] = useState<ActivityDef[]>(
    () => initialDraft?.activities ?? [blankActivity()],
  );
  const [studentState, setStudentState] = useState<Record<string, StudentState>>(
    () => initialDraft?.studentState ?? {},
  );
  // Student ids whose section is collapsed in the form (UI-only, not persisted).
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [phase, setPhase] = useState<"form" | "running" | "results">("form");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Cached notes for the chosen session (offered as a restore on the form).
  const [restorable, setRestorable] = useState<CachedNote[]>([]);
  // While generating: which note (1-based) and which pipeline pass is in flight.
  const [progress, setProgress] = useState<{ current: number; total: number; pass: Pass } | null>(
    null,
  );
  // The schedule slot this session targets. Drives the default roster and the
  // schedule write-back on generate. Set from the deep-link, or chosen manually.
  const [timeSlot, setTimeSlot] = useState<string>(() => initialDraft?.timeSlot ?? "");
  // The selected date's week deviation, if any (else the usual template applies).
  const [weekSchedule, setWeekSchedule] = useState<ScheduleEntry[] | null>(null);

  // Consume a deep-link target on arrival.
  useEffect(() => {
    if (!target) return;
    setDate(target.date);
    setTeacherId(target.teacherId);
    if (target.timeSlot) setTimeSlot(target.timeSlot);
    onTargetConsumed?.();
  }, [target, onTargetConsumed]);

  // All hooks must run unconditionally (no early returns above), so derive
  // teacher/caseload via useMemo and guard inside effects.
  // Generate only operates on active teachers; archived ones don't appear in
  // the picker and the default-teacher seeding skips them.
  const teachers =
    state.status === "ready" ? state.data.teachers.filter((t) => !t.archived) : [];
  const teacher = useMemo(() => teachers.find((t) => t.id === teacherId), [teachers, teacherId]);
  const caseload = useMemo(
    () =>
      state.status === "ready"
        ? state.data.students.filter((s) => !s.archived && s.teacherId === teacherId)
        : [],
    [state, teacherId],
  );

  // Schedule-driven session: the roster defaults to whoever is scheduled for the
  // chosen (teacher, weekday, time slot); the same cell is written back on
  // generate. Uses the week's deviation if one exists, else the usual template.
  const templateSchedule: ScheduleEntry[] = state.status === "ready" ? state.data.schedule : [];
  const effectiveSchedule = weekSchedule ?? templateSchedule;
  const weekKey = useMemo(() => {
    const d = parseDate(date);
    return d ? toISODate(mondayOf(d)) : null;
  }, [date]);
  const weekday = useMemo<Weekday | null>(() => {
    const d = parseDate(date);
    return d ? (weekdayName(d) as Weekday) : null;
  }, [date]);
  const timeSlotOptions = useMemo(
    () =>
      teacher && weekday
        ? sortedTimeSlots(
            effectiveSchedule.filter((e) => e.teacherId === teacher.id && e.dayOfWeek === weekday),
          )
        : [],
    [effectiveSchedule, teacher, weekday],
  );
  const sessionStudentIds = useMemo(() => {
    const d = parseDate(date);
    if (!teacher || !weekday || !timeSlot || !d) return [];
    const byId = new Map(caseload.map((s) => [s.id, s] as const));
    return effectiveSchedule
      .filter(
        (e) => e.teacherId === teacher.id && e.dayOfWeek === weekday && e.timeSlot === timeSlot,
      )
      .map((e) => e.studentId)
      .filter((id) => byId.has(id) && isActiveOn(byId.get(id)!, d));
  }, [effectiveSchedule, teacher, weekday, timeSlot, caseload, date]);

  // Load the selected date's week deviation (falls back to the template).
  useEffect(() => {
    setWeekSchedule(null);
    if (!client || !weekKey) return;
    let cancelled = false;
    loadWeekSchedule(client, weekKey)
      .then((res) => {
        if (!cancelled) setWeekSchedule(res ? res.entries : null);
      })
      .catch(() => {
        if (!cancelled) setWeekSchedule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, weekKey]);

  // Keep the chosen slot valid for the current teacher/day; default to the first.
  useEffect(() => {
    if (timeSlotOptions.length === 0) return;
    if (!timeSlotOptions.includes(timeSlot)) setTimeSlot(timeSlotOptions[0]!);
  }, [timeSlotOptions, timeSlot]);

  // Default teacher to the first one once data is ready — but defer to a
  // pending deep-link target so the two setters don't race in the same commit
  // (last-setter-wins would otherwise clobber the target's teacher).
  useEffect(() => {
    if (state.status !== "ready") return;
    if (target) return;
    if (teacherId) return;
    const firstActive = state.data.teachers.find((t) => !t.archived);
    if (firstActive) setTeacherId(firstActive.id);
  }, [state, teacherId, target]);

  // Persist generated notes to the local cache (repo never stores narrative), so
  // they survive navigation/refresh and feed the recent-notes export. Re-saves
  // after a regenerate settles (skipped while a row is still in flight).
  useEffect(() => {
    if (phase !== "results" || !teacher) return;
    if (results.some((r) => r.regenerating)) return;
    const at = Date.now();
    const notes: CachedNote[] = results
      .filter((r) => r.result && !r.absent)
      .map((r) => ({
        id: `${date}|${teacher.id}|${timeSlot}|${r.studentId}`,
        date,
        teacherId: teacher.id,
        teacherName: teacher.name,
        timeSlot,
        studentId: r.studentId,
        studentName: r.name,
        note: r.result!.final,
        generatedAt: at,
      }));
    void saveNotes(notes);
  }, [phase, results, teacher, date, timeSlot]);

  // Surface previously-generated notes for the chosen session while on the form.
  useEffect(() => {
    if (phase !== "form" || !teacher || !timeSlot) {
      setRestorable([]);
      return;
    }
    let cancelled = false;
    getSessionNotes(date, teacher.id, timeSlot)
      .then((n) => !cancelled && setRestorable(n))
      .catch(() => !cancelled && setRestorable([]));
    return () => {
      cancelled = true;
    };
  }, [phase, date, teacher, timeSlot]);

  const restoreCachedNotes = () => {
    setResults(
      restorable.map((n) => ({
        studentId: n.studentId,
        name: n.studentName,
        absent: false,
        result: { draft: "", reviewed: "", final: n.note, warnings: [] },
      })),
    );
    setPhase("results");
  };

  // Snap mode to one the teacher supports when teacher changes.
  useEffect(() => {
    if (teacher && !teacher.modes.includes(mode)) setMode(teacher.modes[0] ?? "regular");
  }, [teacher, mode]);

  // Ensure every caseload student has a state entry sized to the activity count,
  // and (re)seed `included` from the schedule whenever the session changes
  // (teacher / date / slot / scheduled set). Manual add/remove within a session
  // is preserved, since those don't change the session signature.
  const sessionSig = `${teacherId}|${date}|${timeSlot}|${sessionStudentIds.join(",")}`;
  // Seed from the restored draft's signature so the studentState effect treats a
  // restored session as unchanged and preserves the restored inputs (not reseed).
  const seededSig = useRef<string | null>(initialDraft?.sessionSig ?? null);
  useEffect(() => {
    if (caseload.length === 0) return;
    const sessionChanged = seededSig.current !== sessionSig;
    seededSig.current = sessionSig;
    const inSession = new Set(sessionStudentIds);
    setStudentState((prev) => {
      const next: Record<string, StudentState> = {};
      for (const s of caseload) {
        const old = prev[s.id];
        // Spread over a blank so older restored drafts gain any newer fields
        // (e.g. `trials`) rather than leaving them undefined.
        const regular = activities.map((_, i) =>
          old?.regular[i] ? { ...blankRegularInput(), ...old.regular[i] } : blankRegularInput(),
        );
        if (old && !sessionChanged) {
          // Normalize possibly-stale shapes (e.g. a restored pre-rename draft that
          // still has `filming`/`filmingGoalIds`) so the News card never reads undefined.
          next[s.id] = { ...old, news: old.news ?? blankNews(), newsGoalIds: old.newsGoalIds ?? [], regular };
        } else {
          next[s.id] = {
            roleId: old?.roleId ?? "",
            news: old?.news ?? blankNews(),
            newsGoalIds: old?.newsGoalIds ?? [],
            captures: old?.captures ?? {},
            absent: old?.absent ?? false,
            included: inSession.has(s.id),
            regular,
          };
        }
      }
      return next;
    });
  }, [caseload, activities.length, sessionSig]);

  // Auto-save the in-progress form (debounced) so a refresh — or coming back
  // later in the day — restores it. Cleared on a successful generate. Only while
  // on the form. `savedAt` drives the "Saved" indicator so she can trust it.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== "form") return;
    const id = setTimeout(() => {
      saveFormDraft({ date, teacherId, timeSlot, mode, activities, studentState, sessionSig });
      setSavedAt(Date.now());
    }, 800);
    return () => clearTimeout(id);
  }, [phase, date, teacherId, timeSlot, mode, activities, studentState, sessionSig]);

  if (state.status !== "ready") return null;
  const { students, goals } = state.data;
  const catalog = state.data.activities;
  const roleCatalog = state.data.newsRoles;
  // The activities offered in the dropdown: this teacher's catalog activities
  // plus the reserved ad-hoc "Other".
  const activityOptions = teacher ? activityOptionsForGenerate(teacher, catalog) : [];
  // The teacher's news roles, resolved from the shared catalog.
  const roleOptions = teacher ? resolveRoles(teacher, roleCatalog) : [];

  function setStudent(id: string, patch: Partial<StudentState>) {
    setStudentState((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
  }

  // Reset the form for this session: one blank activity and fresh per-student
  // inputs (roster inclusion still from the schedule). Keeps date/teacher/slot/mode.
  function clearForm() {
    setActivities([blankActivity()]);
    const inSession = new Set(sessionStudentIds);
    const fresh: Record<string, StudentState> = {};
    for (const s of caseload) {
      fresh[s.id] = {
        roleId: "",
        news: blankNews(),
        newsGoalIds: [],
        captures: {},
        absent: false,
        included: inSession.has(s.id),
        regular: [blankRegularInput()],
      };
    }
    setStudentState(fresh);
    seededSig.current = sessionSig; // already seeded — keep the effect from clobbering
    clearFormDraft();
  }

  function setRegularInput(id: string, idx: number, patch: Partial<ActivityInput>) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      const regular = cur.regular.slice();
      regular[idx] = { ...regular[idx]!, ...patch };
      return { ...prev, [id]: { ...cur, regular } };
    });
  }

  function setActivityCapture(
    id: string,
    idx: number,
    capName: string,
    fieldName: string,
    value: string | boolean | string[],
  ) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      const regular = cur.regular.slice();
      const input = regular[idx]!;
      const caps = input.captures ?? {};
      const cap = caps[capName] ?? {};
      regular[idx] = {
        ...input,
        captures: { ...caps, [capName]: { ...cap, [fieldName]: value } },
      };
      return { ...prev, [id]: { ...cur, regular } };
    });
  }

  function setNews(id: string, patch: Partial<NewsFieldValues>) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      return { ...prev, [id]: { ...cur, news: { ...cur.news, ...patch } } };
    });
  }

  function setCaptureField(
    id: string,
    captureName: string,
    fieldName: string,
    value: string | boolean | string[],
  ) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      const allCaps = cur.captures;
      const cap = allCaps[captureName] ?? {};
      return {
        ...prev,
        [id]: {
          ...cur,
          captures: { ...allCaps, [captureName]: { ...cap, [fieldName]: value } },
        },
      };
    });
  }

  function setPragmatic(id: string, key: PragmaticSkillKey, patch: Partial<PragmaticSkillValue>) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      const prag = cur.news.pragmatic ?? {};
      const skill = prag[key] ?? { enabled: false, qualityLevel: "", promptLevel: "" };
      return {
        ...prev,
        [id]: {
          ...cur,
          news: {
            ...cur.news,
            pragmatic: { ...prag, [key]: { ...skill, ...patch } },
          },
        },
      };
    });
  }

  function addActivity() {
    if (activities.length >= 4) return;
    setActivities((a) => [...a, blankActivity()]);
  }
  function removeActivity(idx: number) {
    setActivities((a) => a.filter((_, i) => i !== idx));
    setStudentState((prev) => {
      const next: Record<string, StudentState> = {};
      for (const id of Object.keys(prev)) {
        const cur = prev[id]!;
        next[id] = { ...cur, regular: cur.regular.filter((_, i) => i !== idx) };
      }
      return next;
    });
  }
  function patchActivity(idx: number, patch: Partial<ActivityDef>) {
    setActivities((a) => a.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }

  // Scheduled students first, in the schedule's saved order (so the all-notes
  // paste order matches the Schedule editor), then anyone added via "Add
  // students" (included, not on the schedule for this slot).
  const includedStudents = [
    ...sessionStudentIds
      .map((id) => caseload.find((s) => s.id === id))
      .filter((s): s is Student => s != null && (studentState[s.id]?.included ?? false)),
    ...caseload.filter(
      (s) => !sessionStudentIds.includes(s.id) && (studentState[s.id]?.included ?? false),
    ),
  ];
  // Soft block: surface included students whose IEP review has passed. Generation
  // is NOT prevented — this just nudges her to review (clearing the date there).
  const iepOverdue = includedStudents.filter((s) => {
    const d = parseDate(s.nextIepReview);
    return d != null && d.getTime() < startOfDay(new Date()).getTime();
  });
  const canGenerate =
    teacher !== undefined &&
    includedStudents.length > 0 &&
    keys?.anthropicApiKey != null &&
    client !== null;

  async function handleGenerate() {
    if (!teacher || !client || !keys?.anthropicApiKey) return;
    // Date and at least one activity are required (matching SESIS) — raise a
    // clear error rather than generating a dateless or activity-less note. The
    // activity requirement is regular-mode only; news day uses roles instead.
    if (!date) {
      setError("Pick a session date.");
      return;
    }
    if (mode === "regular" && !activities.some((a) => a.activityId)) {
      setError("Select at least one activity.");
      return;
    }
    setPhase("running");
    setError(null);
    // Initialize result rows so the UI can show per-student progress.
    // The all-notes block uses the disambiguated display name (scoped to the
    // students actually in this session), so two "Aiden"s on the same caseload
    // render as "Aiden M." vs "Aiden R." before the colon.
    const initial: ResultRow[] = includedStudents.map((s) => ({
      studentId: s.id,
      name: displayName(s, includedStudents),
      absent: studentState[s.id]!.absent,
    }));
    setResults(initial);

    let prompts;
    try {
      prompts = await loadPromptSet(client, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load prompts");
      setPhase("form");
      return;
    }
    // Emily's accumulated note corrections, applied to every draft. Non-fatal if
    // the file doesn't exist yet.
    const feedbackRules = await loadFeedbackRules(client).catch(() => "");

    const apiKey = keys.anthropicApiKey;
    const total = includedStudents.length;
    // Run students sequentially to keep the API call cadence gentle; failures
    // per student show on their card without aborting the batch.
    for (let i = 0; i < includedStudents.length; i++) {
      const student = includedStudents[i]!;
      const st = studentState[student.id]!;
      if (st.absent) {
        updateResult(student.id, {
          result: {
            draft: "",
            reviewed: "",
            final: absentNote(displayName(student, includedStudents)),
            warnings: [],
          },
        });
        continue;
      }
      try {
        const ctx = buildContext(mode, teacher, student, st, activities, goals, catalog, roleCatalog);
        const result = await generateNote(apiKey, prompts, ctx, {
          maxTokens: MAX_TOKENS_BY_MODE[mode],
          postProcess: buildPostProcess(teacher, student),
          feedbackRules,
          onPhase: (pass) => setProgress({ current: i + 1, total, pass }),
        });
        updateResult(student.id, { result });
      } catch (e) {
        updateResult(student.id, { error: e instanceof Error ? e.message : "Failed" });
      }
    }
    setProgress(null);

    // Persist session metadata (goalIds per student, mode). Note text is never stored.
    try {
      const meta = buildSessionMetadata(date, teacher.id, mode, includedStudents, studentState);
      const existing = await loadSession(client, date, teacher.id);
      await writeSessionMetadata(client, meta, existing?.sha);
    } catch (e) {
      // Metadata-write failure doesn't invalidate the generated notes — surface
      // as a non-fatal banner on the results page.
      setError(`Notes generated, but saving session metadata failed: ${e instanceof Error ? e.message : ""}`);
    }

    // Write the final roster back to this session's schedule cell, diverging the
    // week from the usual template (or reverting the deviation if it converges
    // back). Skipped when there's no slot (e.g. teacher has none that day).
    const day = parseDate(date);
    if (timeSlot && day) {
      try {
        const wk = toISODate(mondayOf(day));
        const wd = weekdayName(day) as Weekday;
        const rosterIds = includedStudents.map((s) => s.id);
        const existing = await loadWeekSchedule(client, wk);
        const base = existing?.entries ?? templateSchedule;
        const next = setCellRoster(base, teacher.id, wd, timeSlot, rosterIds);
        const nextFp = scheduleFingerprint(next);
        const changed = !existing || nextFp !== scheduleFingerprint(existing.entries);
        if (changed) {
          if (nextFp === scheduleFingerprint(templateSchedule)) {
            if (existing) await deleteWeekSchedule(client, wk, existing.sha);
          } else {
            await writeWeekSchedule(client, wk, next, existing?.sha);
          }
        }
      } catch (e) {
        setError(`Notes generated, but updating the schedule failed: ${e instanceof Error ? e.message : ""}`);
      }
    }

    clearFormDraft(); // the form's work is done — don't restore it next time
    setPhase("results");
  }

  function updateResult(studentId: string, patch: Partial<ResultRow>) {
    setResults((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
  }

  // Regenerate one or more notes with the same feedback. saveAsRule persists the
  // feedback to feedback-rules.md once (not per note). Notes run sequentially to
  // keep the API cadence gentle; each row shows its own phase as it goes.
  async function regenerate(studentIds: string[], feedback = "", saveAsRule = false) {
    if (!teacher || !client || !keys?.anthropicApiKey || studentIds.length === 0) return;
    const apiKey = keys.anthropicApiKey;
    let prompts;
    try {
      prompts = await loadPromptSet(client, mode);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load prompts";
      for (const id of studentIds) updateResult(id, { error: msg });
      return;
    }
    const persisted = await loadFeedbackRules(client).catch(() => "");
    // Persisted rules plus this round's one-off note feed the draft pass.
    const feedbackRules = [persisted, feedback.trim()].filter(Boolean).join("\n");
    for (const studentId of studentIds) {
      const row = results.find((r) => r.studentId === studentId);
      const st = studentState[studentId];
      const student = students.find((s) => s.id === studentId);
      if (!row || !st || !student || row.absent) continue;
      updateResult(studentId, { regenerating: true, regenPhase: "draft", error: undefined });
      try {
        const ctx = buildContext(mode, teacher, student, st, activities, goals, catalog, roleCatalog);
        const result = await generateNote(apiKey, prompts, ctx, {
          maxTokens: MAX_TOKENS_BY_MODE[mode],
          postProcess: buildPostProcess(teacher, student),
          feedbackRules,
          onPhase: (pass) => updateResult(studentId, { regenPhase: pass }),
        });
        updateResult(studentId, { result, regenerating: false, regenPhase: undefined });
      } catch (e) {
        updateResult(studentId, {
          regenerating: false,
          regenPhase: undefined,
          error: e instanceof Error ? e.message : "Failed",
        });
      }
    }
    if (saveAsRule && feedback.trim()) await appendFeedbackRule(client, feedback);
  }

  if (phase === "results") {
    return (
      <ResultsView
        date={date}
        timeSlot={timeSlot}
        results={results}
        error={error}
        onBack={() => setPhase("form")}
        onNavigate={onNavigate}
        onRegenerate={regenerate}
        onToggleDrafts={(id) =>
          updateResult(id, { showDrafts: !results.find((r) => r.studentId === id)?.showDrafts })
        }
      />
    );
  }

  return (
    <div className="shell">
      <Nav current="generate" onNavigate={onNavigate} />

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Generate notes</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
            {teacher && (
              <span
                style={{ width: 10, height: 10, borderRadius: 3, background: teacherColor(teacher.color).bg, flexShrink: 0 }}
                aria-hidden
              />
            )}
            {teacher ? `${teacher.name}'s caseload` : "—"} · {includedStudents.length} student
            {includedStudents.length === 1 ? "" : "s"}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {savedAt && (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-tertiary)" }}
              title="This form auto-saves — you can leave and come back to keep logging trials through the day."
            >
              <Icon name="check" size={13} />
              Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
          <button className="button button--small" onClick={clearForm} title="Reset activities and every student's inputs for this session">
            Clear form
          </button>
        </div>
      </div>

      {restorable.length > 0 && (
        <div
          className="banner banner--info"
          style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="notebook" size={16} />
            <span>
              You generated {restorable.length} note{restorable.length === 1 ? "" : "s"} for this
              session earlier.
            </span>
          </div>
          <button className="button button--small" style={{ flexShrink: 0 }} onClick={restoreCachedNotes}>
            View them →
          </button>
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
              IEP review overdue for {iepOverdue.map((s) => s.firstName).join(", ")} — notes still
              generate; review when you can.
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {iepOverdue.map((s) => (
              <button key={s.id} className="button button--small" onClick={() => onReviewIep(s.id)}>
                Review {s.firstName} →
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top controls — pick the session (date · teacher · time slot) and mode.
          Deep-linking from Today pre-fills date/teacher/slot. A top accent in the
          teacher's color ties the screen to them, mirroring Today's session cards. */}
      <div
        className="card"
        style={{
          marginBottom: "1rem",
          borderTop: `4px solid ${teacherColor(teacher?.color).bg}`,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "14px 20px" }}>
          <div>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Teacher</label>
            <select
              className="select"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
            >
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Time slot</label>
            <select
              className="select"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              disabled={timeSlotOptions.length === 0}
            >
              {timeSlotOptions.length === 0 ? (
                <option value="">No sessions this day</option>
              ) : (
                timeSlotOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="label">Mode</label>
            <select
              className="select"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              {teacher?.modes.map((m) => (
                <option key={m} value={m}>
                  {m === "regular" ? "Regular" : "News day"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Regular activities (session-level) */}
      {mode === "regular" && teacher && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 10,
            }}
          >
            <h3 className="card__title" style={{ margin: 0 }}>
              Activities
            </h3>
            <button
              className="button button--small"
              onClick={addActivity}
              disabled={activities.length >= 4}
            >
              <Icon name="plus" size={13} />
              Add activity
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activities.map((a, i) => (
              <ActivityEditor
                key={i}
                index={i}
                activity={a}
                options={activityOptions}
                onChange={(patch) => patchActivity(i, patch)}
                onRemove={activities.length > 1 ? () => removeActivity(i) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Per-student cards — only the session roster (included students). Others
          are hidden by default and added back via "Add students" below. */}
      {teacher &&
        caseload
          .filter((student) => studentState[student.id]?.included)
          .map((student) => {
          const st = studentState[student.id];
          if (!st) return null;
          const studentGoals = goals.filter((g) => g.studentId === student.id && !g.archived);
          const isCollapsed = collapsed.has(student.id);
          // The body shows (and the arrow points down) only when expanded AND
          // present — marking absent reads as collapsed too.
          const expanded = !isCollapsed && !st.absent;
          return (
            <div
              key={student.id}
              className="card"
              style={{
                marginBottom: 10,
                background: st.absent ? "var(--color-background-secondary)" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: !st.absent && !isCollapsed ? 12 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button
                    className="button button--ghost button--small"
                    onClick={() => toggleCollapsed(student.id)}
                    title={expanded ? "Collapse" : "Expand"}
                    aria-expanded={expanded}
                    disabled={st.absent}
                    style={{ padding: 4, color: "var(--color-text-tertiary)", display: "flex" }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        transform: expanded ? "rotate(90deg)" : "none",
                        transition: "transform 0.15s",
                      }}
                    >
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </button>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>{fullName(student)}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {student.pronouns}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={st.absent}
                      onChange={(e) => setStudent(student.id, { absent: e.target.checked })}
                    />
                    Absent
                  </label>
                  <button
                    className="button button--small button--danger-text"
                    onClick={() => setStudent(student.id, { included: false })}
                    title="Remove from this session"
                    style={{ padding: "2px 8px" }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {st.included && !st.absent && !isCollapsed && (
                <CapturePanel
                  teacher={teacher}
                  student={student}
                  state={st.captures}
                  onChange={(captureName, fieldName, value) =>
                    setCaptureField(student.id, captureName, fieldName, value)
                  }
                />
              )}

              {st.included && !st.absent && !isCollapsed && mode === "regular" && (
                <RegularStudentCard
                  activities={activities}
                  options={activityOptions}
                  teacher={teacher}
                  student={student}
                  inputs={st.regular}
                  studentGoals={studentGoals}
                  onChange={(idx, patch) => setRegularInput(student.id, idx, patch)}
                  onCaptureChange={(idx, capName, fieldName, value) =>
                    setActivityCapture(student.id, idx, capName, fieldName, value)
                  }
                />
              )}

              {st.included && !st.absent && !isCollapsed && mode === "news-day" && (
                <NewsStudentCard
                  roles={roleOptions}
                  state={st}
                  studentGoals={studentGoals}
                  onRoleChange={(roleId) => setStudent(student.id, { roleId })}
                  onNewsChange={(patch) => setNews(student.id, patch)}
                  onPragmaticChange={(key, patch) => setPragmatic(student.id, key, patch)}
                  onGoalsChange={(ids) => setStudent(student.id, { newsGoalIds: ids })}
                />
              )}
            </div>
          );
        })}

      {/* Add a caseload student who isn't in this session's schedule. */}
      {teacher &&
        (() => {
          const addable = caseload.filter((s) => !studentState[s.id]?.included);
          if (addable.length === 0) return null;
          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 10,
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              <Icon name="plus" size={13} />
              <span>Add a student not in this session:</span>
              <select
                className="select"
                style={{ maxWidth: 220 }}
                value=""
                onChange={(e) => {
                  if (e.target.value) setStudent(e.target.value, { included: true, absent: false });
                }}
              >
                <option value="">Choose a student…</option>
                {addable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </div>
          );
        })()}

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          className="button button--primary"
          onClick={handleGenerate}
          disabled={!canGenerate || phase === "running"}
        >
          {phase === "running"
            ? progress
              ? `Note ${progress.current} of ${progress.total} · ${PASS_LABEL[progress.pass]}…`
              : "Generating…"
            : `Generate ${includedStudents.length} note${includedStudents.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActivityEditor({
  index,
  activity,
  options,
  onChange,
  onRemove,
}: {
  index: number;
  activity: ActivityDef;
  options: Activity[];
  onChange: (patch: Partial<ActivityDef>) => void;
  onRemove?: () => void;
}) {
  const def = options.find((a) => a.id === activity.activityId);
  return (
    <div
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          Activity {index + 1}
        </span>
        {onRemove && (
          <button
            className="button button--small button--danger-text"
            onClick={onRemove}
            style={{ padding: "2px 8px" }}
          >
            Remove
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label className="label">Activity</label>
          <select
            className="select"
            value={activity.activityId}
            onChange={(e) => onChange({ activityId: e.target.value })}
          >
            <option value="">— Select —</option>
            {options.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Language domains</label>
          <div style={{ display: "flex", gap: 10, paddingTop: 6, fontSize: 13 }}>
            {DOMAINS.map((d) => (
              <label key={d} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="checkbox"
                  checked={activity.domains.includes(d)}
                  onChange={(e) =>
                    onChange({
                      domains: e.target.checked
                        ? [...activity.domains, d]
                        : activity.domains.filter((x) => x !== d),
                    })
                  }
                />
                {d}
              </label>
            ))}
          </div>
        </div>
      </div>
      {def?.freeText && (
        <div style={{ marginBottom: 8 }}>
          <label className="label">Additional info</label>
          <input
            className="input"
            value={activity.additionalInfo}
            onChange={(e) => onChange({ additionalInfo: e.target.value })}
          />
        </div>
      )}
      {def?.requiresSegmentName && (
        <div>
          <label className="label">Segment name</label>
          <input
            className="input"
            value={activity.segmentName}
            onChange={(e) => onChange({ segmentName: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

function CapturePanel({
  teacher,
  student,
  state,
  onChange,
}: {
  teacher: Teacher;
  student: Student;
  state: Record<string, Record<string, string | boolean | string[]>>;
  onChange: (captureName: string, fieldName: string, value: string | boolean | string[]) => void;
}) {
  // Only show captures whose top-level showIf passes for this student AND that
  // have UI fields. Captures with no fields (Spanish post-process, journal
  // rewrite) drive behavior silently.
  const captures = activeCapturesFor(teacher, student).filter(
    (c) => c.fields && c.fields.length > 0,
  );
  if (captures.length === 0) return null;
  const sCtx = studentContext(student);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      {captures.map((cap) => {
        const fieldState = state[cap.name] ?? {};
        return (
          <div
            key={cap.name}
            style={{
              border: "0.5px dashed var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-md)",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {(cap.fields ?? []).map((field) => {
              if (
                field.showIf &&
                !evalCondition(field.showIf, { student: sCtx, capture: fieldState })
              ) {
                return null;
              }
              const value = fieldState[field.name];
              if (field.type === "multiselect") {
                const selected = Array.isArray(value) ? value : [];
                return (
                  <div key={field.name}>
                    {field.label && (
                      <label
                        className="label"
                        style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
                      >
                        {field.label}
                      </label>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 13 }}>
                      {(field.options ?? []).map((opt) => (
                        <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={selected.includes(opt)}
                            onChange={(e) =>
                              onChange(
                                cap.name,
                                field.name,
                                e.target.checked
                                  ? [...selected, opt]
                                  : selected.filter((x) => x !== opt),
                              )
                            }
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }
              if (field.type === "bool") {
                return (
                  <label
                    key={field.name}
                    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                  >
                    <input
                      type="checkbox"
                      checked={value === true}
                      onChange={(e) => onChange(cap.name, field.name, e.target.checked)}
                    />
                    {field.label ?? field.name}
                  </label>
                );
              }
              return (
                <div key={field.name}>
                  {field.label && (
                    <label
                      className="label"
                      style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
                    >
                      {field.label}
                    </label>
                  )}
                  <input
                    className="input"
                    value={typeof value === "string" ? value : ""}
                    placeholder={field.placeholder ?? ""}
                    onChange={(e) => onChange(cap.name, field.name, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Renders the form fields for any session captures bound to a specific activity
// (e.g. José's pragmatic-skills multiselect), shown on that activity's card.
function ActivityCaptureFields({
  captures,
  state,
  onChange,
}: {
  captures: SessionCapture[];
  state: Record<string, Record<string, string | boolean | string[]>>;
  onChange: (capName: string, fieldName: string, value: string | boolean | string[]) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      {captures.map((cap) => {
        const fieldState = state[cap.name] ?? {};
        return (cap.fields ?? []).map((field) => {
          if (field.showIf && !evalCondition(field.showIf, { capture: fieldState })) return null;
          const value = fieldState[field.name];
          const key = `${cap.name}.${field.name}`;
          if (field.type === "multiselect") {
            return (
              <CheckGroup
                key={key}
                label={field.label ?? field.name}
                options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
                selected={Array.isArray(value) ? value : []}
                onChange={(v) => onChange(cap.name, field.name, v)}
              />
            );
          }
          if (field.type === "bool") {
            return (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, margin: "6px 0" }}
              >
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => onChange(cap.name, field.name, e.target.checked)}
                />
                {field.label ?? field.name}
              </label>
            );
          }
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              {field.label && <label className="label">{field.label}</label>}
              <input
                className="input"
                value={typeof value === "string" ? value : ""}
                placeholder={field.placeholder ?? ""}
                onChange={(e) => onChange(cap.name, field.name, e.target.value)}
              />
            </div>
          );
        });
      })}
    </div>
  );
}

// Trials data-capture panel (per student per activity): a list of per-goal
// measurements. The live preview on each is the contract — what she sees is what
// the note says.
function TrialsPanel({
  studentName,
  pronoun,
  goals,
  value,
  onChange,
}: {
  studentName: string;
  pronoun: string;
  goals: { id: string; shortName: string; measuredVerb: string; measuredNoun: string }[];
  value: TrialData;
  onChange: (t: TrialData) => void;
}) {
  const entries = value.entries ?? [];
  const method = value.method ?? "summary";
  const setEntry = (ei: number, patch: Partial<TrialEntry>) =>
    onChange({ ...value, entries: entries.map((e, j) => (j === ei ? { ...e, ...patch } : e)) });
  const seg = (active: boolean) => ({
    border: "none",
    borderRadius: 0,
    padding: "2px 10px",
    height: "auto",
    fontSize: 12,
    lineHeight: 1.4,
    background: active ? "var(--color-background-primary)" : "transparent",
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    fontWeight: active ? 500 : 400,
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Entry</span>
        <div
          role="group"
          aria-label="Trial entry method"
          style={{
            display: "inline-flex",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)",
            overflow: "hidden",
          }}
        >
          <button
            className="button button--small"
            style={seg(method === "summary")}
            onClick={() => onChange({ ...value, method: "summary" })}
          >
            Summary
          </button>
          <button
            className="button button--small"
            style={{ ...seg(method === "live"), borderLeft: "0.5px solid var(--color-border-secondary)" }}
            onClick={() => onChange({ ...value, method: "live" })}
          >
            Trial-by-trial
          </button>
        </div>
      </div>
      {entries.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
          No measurements yet — add one per goal you're counting.
        </p>
      )}
      {entries.map((entry, ei) => (
        <TrialEntryEditor
          key={ei}
          studentName={studentName}
          pronoun={pronoun}
          goals={goals}
          method={method}
          entry={entry}
          onChange={(patch) => setEntry(ei, patch)}
          onRemove={() => onChange({ ...value, entries: entries.filter((_, j) => j !== ei) })}
        />
      ))}
      <button
        className="button button--small"
        style={{ alignSelf: "flex-start" }}
        onClick={() => onChange({ ...value, entries: [...entries, blankTrialEntry()] })}
      >
        <Icon name="plus" size={13} /> Add measurement
      </button>
    </div>
  );
}

// One per-goal measurement within the Trials panel.
function TrialEntryEditor({
  studentName,
  pronoun,
  goals,
  method,
  entry,
  onChange,
  onRemove,
}: {
  studentName: string;
  pronoun: string;
  goals: { id: string; shortName: string; measuredVerb: string; measuredNoun: string }[];
  method: "summary" | "live";
  entry: TrialEntry;
  onChange: (patch: Partial<TrialEntry>) => void;
  onRemove: () => void;
}) {
  const rows = entry.rows ?? [];
  const setRow = (ri: number, patch: Partial<TrialSupportRow>) =>
    onChange({ rows: rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) });
  const preview = trialEntrySentence(studentName, pronoun, entry);
  const err = trialError(entry);
  // Compact, scannable summary of the aggregate — one chip per support level
  // used (count + level + type icons), plus a failed chip.
  const successRows = rows.filter((r) => (Number(r.count) || 0) > 0);
  const failedCount = entry.failed.trim() !== "" ? Number(entry.failed) || 0 : trialFailedAuto(entry);
  const chip = (ok: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    fontSize: 12,
    borderRadius: "var(--border-radius-md)",
    background: `color-mix(in srgb, var(${ok ? "--color-background-success" : "--color-background-danger"}) 60%, transparent)`,
    color: ok ? "var(--color-text-success)" : "var(--color-text-danger)",
  });
  return (
    <div
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        padding: 10,
        background: "var(--color-background-primary)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <label className="label">Goal</label>
          <select
            className="select"
            style={{ width: "100%" }}
            value={entry.goalId}
            onChange={(e) => {
              const g = goals.find((x) => x.id === e.target.value);
              // Seed the verb/noun from the goal's measured action only when the
              // entry's are still blank, so a manual edit is never overwritten.
              const seed = g && trialEntryAction(entry) === "";
              onChange({
                goalId: e.target.value,
                ...(seed ? { verb: g!.measuredVerb, noun: g!.measuredNoun } : {}),
              });
            }}
          >
            <option value="">— no goal —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.shortName}
              </option>
            ))}
          </select>
        </div>
        <button
          className="button button--ghost button--small"
          style={{ padding: 6, color: "var(--color-text-tertiary)" }}
          title="Remove measurement"
          onClick={onRemove}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {method === "summary" && (
          <div>
            <label className="label">Trials</label>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              style={{ width: 42 }}
              value={entry.total}
              onChange={(e) => onChange({ total: e.target.value.replace(/\D/g, "") })}
            />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <label className="label">What is being measured? E.g. [ answered ] [ WH questions ]</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ width: 190 }}
              placeholder="past-tense verb"
              value={entry.verb}
              onChange={(e) => onChange({ verb: e.target.value })}
            />
            <input
              className="input"
              style={{ flex: 1, minWidth: 120 }}
              placeholder="plural noun"
              value={entry.noun}
              onChange={(e) => onChange({ noun: e.target.value })}
            />
          </div>
        </div>
      </div>
      {method === "live" ? (
        <LiveTrialFields entry={entry} onChange={onChange} />
      ) : (
      <>
      <div>
        <label className="label">Successful attempts</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                className="input"
                type="text"
                inputMode="numeric"
                style={{ width: 42, background: "color-mix(in srgb, var(--color-background-success) 55%, transparent)" }}
                placeholder="0"
                value={row.count}
                onChange={(e) => setRow(ri, { count: e.target.value.replace(/\D/g, "") })}
              />
              <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--color-text-secondary)" }}>of</span>
              <span
                title="Total trials"
                style={{
                  minWidth: 26,
                  textAlign: "center",
                  padding: "4px 8px",
                  borderRadius: "var(--border-radius-md)",
                  background: "var(--color-background-secondary)",
                  color: "var(--color-text-secondary)",
                  fontSize: 13,
                }}
              >
                {entry.total.trim() || "—"}
              </span>
              <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--color-text-secondary)" }}>with</span>
              <select
                className="select"
                style={{ width: "auto" }}
                value={row.level}
                onChange={(e) => setRow(ri, { level: e.target.value })}
              >
                {TRIAL_SUPPORT_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                {TRIAL_SUPPORT_TYPES.map((t) => {
                  const active = row.types.includes(t);
                  const disabled = row.level === "no support";
                  return (
                    <button
                      key={t}
                      type="button"
                      className="button"
                      disabled={disabled}
                      style={toggleBtnStyle(active, disabled)}
                      onClick={() =>
                        setRow(ri, { types: active ? row.types.filter((x) => x !== t) : [...row.types, t] })
                      }
                    >
                      {PROMPT_TYPE_ICON[t] && <Icon name={PROMPT_TYPE_ICON[t]} size={13} />}
                      {t}
                    </button>
                  );
                })}
              </span>
              <span
                style={{
                  fontSize: 13,
                  marginLeft: 4,
                  fontStyle: "italic",
                  color: "var(--color-text-secondary)",
                  opacity: row.level === "no support" ? 0.4 : 1,
                }}
              >
                prompting
              </span>
              {rows.length > 1 && (
                <button
                  className="button button--ghost button--small"
                  style={{ padding: 6, color: "var(--color-text-tertiary)" }}
                  title="Remove row"
                  onClick={() => onChange({ rows: rows.filter((_, j) => j !== ri) })}
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="button button--small"
          style={{ marginTop: 6 }}
          onClick={() => onChange({ rows: [...rows, { level: "minimal", types: [], count: "" }] })}
        >
          <Icon name="plus" size={13} /> Add row
        </button>
      </div>
      <div>
        <label className="label">Failed attempts</label>
        <input
          className="input"
          type="text"
          inputMode="numeric"
          placeholder={`${trialFailedAuto(entry)}`}
          title="Auto-calculated (Trials − successful) unless you type a value"
          style={{ width: 42, background: "color-mix(in srgb, var(--color-background-danger) 55%, transparent)" }}
          value={entry.failed}
          onChange={(e) => onChange({ failed: e.target.value.replace(/\D/g, "") })}
        />
      </div>
      </>
      )}
      {(successRows.length > 0 || failedCount > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {successRows.map((r, i) => (
            <span key={i} style={chip(true)}>
              <Icon name="check" size={12} />
              <strong>{Number(r.count)}</strong>
              {LEVEL_ABBR[r.level] ?? r.level}
              {r.types.map((t) =>
                PROMPT_TYPE_ICON[t] ? <Icon key={t} name={PROMPT_TYPE_ICON[t]} size={13} /> : null,
              )}
            </span>
          ))}
          {failedCount > 0 && (
            <span style={chip(false)}>
              <Icon name="x" size={12} />
              <strong>{failedCount}</strong>
            </span>
          )}
        </div>
      )}
      {err ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-warning)" }}>{err}</p>
      ) : preview ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
          <span style={{ color: "var(--color-text-tertiary)" }}>Preview: </span>
          {preview}
        </p>
      ) : null}
    </div>
  );
}

// Live ("trial-by-trial") entry: set the current prompt, then tap ✓/✗ per trial.
// Order is not stored — every change is collapsed into the aggregate TrialEntry
// (via eventsToPatch), so the note output is identical to Summary mode.
function LiveTrialFields({
  entry,
  onChange,
}: {
  entry: TrialEntry;
  onChange: (patch: Partial<TrialEntry>) => void;
}) {
  // Seed the tap list from the existing aggregate so switching into live mode
  // never loses prior counts. Held locally; only the aggregate is persisted.
  const [events, setEvents] = useState<TrialEvent[]>(() => expandEntryToEvents(entry));
  const [level, setLevel] = useState("no support");
  const [types, setTypes] = useState<string[]>([]);
  const noSupport = level === "no support";

  const commit = (next: TrialEvent[]) => {
    setEvents(next);
    onChange(eventsToPatch(next));
  };
  const tap = (ok: boolean) =>
    commit([...events, ok ? { level, types: [...types], ok: true } : { level: "", types: [], ok: false }]);
  const toggleType = (t: string) =>
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : TRIAL_SUPPORT_TYPES.filter((x) => prev.includes(x) || x === t),
    );

  const okCount = events.filter((e) => e.ok).length;
  const tapBtn = (bg: string) => ({
    flex: 1,
    padding: "10px 24px",
    fontSize: 14,
    background: `color-mix(in srgb, var(${bg}) 70%, transparent)`,
    border: "0.5px solid var(--color-border-tertiary)",
  });
  const lvlBtn = (active: boolean) => ({
    padding: "3px 9px",
    fontSize: 12,
    borderRadius: "var(--border-radius-md)",
    border: active ? "0.5px solid var(--color-border-secondary)" : "0.5px solid transparent",
    background: active ? "var(--color-background-pill)" : "transparent",
    color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
    fontWeight: active ? 500 : 400,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="label" style={{ marginBottom: -8 }}>
        Current prompting
      </label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TRIAL_SUPPORT_LEVELS.map((l) => (
          <button key={l} className="button" style={lvlBtn(level === l)} onClick={() => setLevel(l)}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 4 }}>
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          {TRIAL_SUPPORT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="button"
              disabled={noSupport}
              style={toggleBtnStyle(types.includes(t), noSupport)}
              onClick={() => toggleType(t)}
            >
              {PROMPT_TYPE_ICON[t] && <Icon name={PROMPT_TYPE_ICON[t]} size={13} />}
              {t}
            </button>
          ))}
        </span>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="button" style={tapBtn("--color-background-success")} onClick={() => tap(true)}>
          ✓ Correct
        </button>
        <button className="button" style={tapBtn("--color-background-danger")} onClick={() => tap(false)}>
          ✗ Incorrect
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: "var(--color-text-secondary)" }}>
        <span>
          <strong style={{ color: "var(--color-text-primary)" }}>{okCount}</strong> / {events.length} correct
        </span>
        {events.length > 0 && (
          <>
            <button className="button button--ghost button--small" onClick={() => commit(events.slice(0, -1))}>
              Undo
            </button>
            <button className="button button--ghost button--small" onClick={() => commit([])}>
              Clear
            </button>
          </>
        )}
      </div>
      {events.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {events.map((ev, i) => (
            <span
              key={i}
              title={ev.ok ? [ev.level, ev.types.join(" + ")].filter(Boolean).join(" ") || "no support" : "incorrect"}
              style={{
                width: 22,
                height: 22,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--border-radius-md)",
                fontSize: 12,
                background: `color-mix(in srgb, var(${ev.ok ? "--color-background-success" : "--color-background-danger"}) 70%, transparent)`,
                color: ev.ok ? "var(--color-text-success)" : "var(--color-text-danger)",
              }}
            >
              {ev.ok ? "✓" : "✗"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RegularStudentCard({
  activities,
  options,
  teacher,
  student,
  inputs,
  studentGoals,
  onChange,
  onCaptureChange,
}: {
  activities: ActivityDef[];
  options: Activity[];
  teacher: Teacher;
  student: Student;
  inputs: ActivityInput[];
  studentGoals: Goal[];
  onChange: (idx: number, patch: Partial<ActivityInput>) => void;
  onCaptureChange: (
    idx: number,
    capName: string,
    fieldName: string,
    value: string | boolean | string[],
  ) => void;
}) {
  // The student's saved session defaults — offered as one-click "use" / "clear"
  // across every activity row (the prompting fields are per-activity).
  const defaults = {
    promptingLevel: student.defaultPromptingLevel,
    promptingType: student.defaultPromptingType,
    redirection: student.defaultRedirection,
    response: student.defaultResponse,
  };
  const hasDefaults = Object.values(defaults).some((v) => v.length > 0);
  const applyToAll = (patch: Partial<ActivityInput>) =>
    activities.forEach((_, i) => onChange(i, patch));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {hasDefaults && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: "var(--color-text-tertiary)" }}>Session defaults:</span>
          <button
            className="button button--small"
            style={{ padding: "2px 8px" }}
            onClick={() =>
              applyToAll({
                promptingLevel: [...defaults.promptingLevel],
                promptingType: [...defaults.promptingType],
                redirection: [...defaults.redirection],
                response: [...defaults.response],
              })
            }
          >
            Use
          </button>
          <button
            className="button button--small button--danger-text"
            style={{ padding: "2px 8px" }}
            onClick={() =>
              applyToAll({ promptingLevel: [], promptingType: [], redirection: [], response: [] })
            }
          >
            Clear
          </button>
        </div>
      )}
      {activities.map((a, i) => {
        const def = options.find((o) => o.id === a.activityId);
        const caps = def ? activityCapturesFor(teacher, { id: def.id, name: def.name }) : [];
        return (
        <div key={i} style={{ borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : undefined, paddingTop: i > 0 ? 10 : 0 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: def ? 400 : 600,
              color: def ? "var(--color-text-primary)" : "var(--color-text-danger)",
              marginBottom: 6,
            }}
          >
            {def?.name || "Select an activity"}
          </div>
          {caps.length > 0 && (
            <ActivityCaptureFields
              captures={caps}
              state={inputs[i]?.captures ?? {}}
              onChange={(capName, fieldName, value) => onCaptureChange(i, capName, fieldName, value)}
            />
          )}
          {def?.perStudentOptions && (def.perStudentOptions.options.length > 0) && (
            <CheckGroup
              label={def.perStudentOptions.label || "Options"}
              options={def.perStudentOptions.options.map((o) => ({ value: o, label: o }))}
              selected={inputs[i]?.options ?? []}
              onChange={(opts) => onChange(i, { options: opts })}
            />
          )}
          <CheckGroup
            label="Goals"
            options={studentGoals.map((g) => ({
              value: g.id,
              label: g.shortName,
              title: g.shortTermGoal.trim() || undefined,
            }))}
            selected={inputs[i]?.goals ?? []}
            onChange={(goals) => onChange(i, { goals })}
          />
          <div
            style={{
              margin: "12px 0",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              padding: "8px 10px 10px",
              background: "color-mix(in srgb, var(--color-background-secondary) 55%, transparent)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
          {(() => {
            const trialsOn = !!inputs[i]?.trials?.enabled;
            // The goals this activity targets — the measurement options in the panel.
            const activityGoals = studentGoals.filter((g) => (inputs[i]?.goals ?? []).includes(g.id));
            const setTrials = (on: boolean) => {
              const cur = inputs[i]?.trials ?? blankTrials();
              // On first turn-on, seed one measurement per selected goal (or one
              // blank if none selected yet) so the per-goal layout is obvious.
              const entries =
                on && (cur.entries ?? []).length === 0
                  ? activityGoals.length > 0
                    ? activityGoals.map((g) => blankTrialEntry(g.id, g.measuredVerb, g.measuredNoun))
                    : [blankTrialEntry()]
                  : cur.entries;
              onChange(i, { trials: { ...cur, enabled: on, entries } });
            };
            const seg = (active: boolean) => ({
              border: "none",
              borderRadius: 0,
              padding: "2px 10px",
              height: "auto",
              fontSize: 12,
              lineHeight: 1.4,
              background: active ? "var(--color-background-primary)" : "transparent",
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: active ? 500 : 400,
            });
            return (
              <div
                role="group"
                aria-label="Data capture mode"
                style={{
                  display: "inline-flex",
                  alignSelf: "flex-start",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  overflow: "hidden",
                  margin: 0,
                }}
              >
                <button className="button button--small" style={seg(!trialsOn)} onClick={() => setTrials(false)}>
                  Checklist
                </button>
                <button
                  className="button button--small"
                  style={{ ...seg(trialsOn), borderLeft: "0.5px solid var(--color-border-secondary)" }}
                  onClick={() => setTrials(true)}
                >
                  Trials
                </button>
              </div>
            );
          })()}
          {inputs[i]?.trials?.enabled ? (
            <TrialsPanel
              studentName={fullName(student)}
              pronoun={student.pronouns.split("/")[0]?.trim() || student.pronouns}
              goals={studentGoals
                .filter((g) => (inputs[i]?.goals ?? []).includes(g.id))
                .map((g) => ({
                  id: g.id,
                  shortName: g.shortName,
                  measuredVerb: g.measuredVerb,
                  measuredNoun: g.measuredNoun,
                }))}
              value={inputs[i]!.trials}
              onChange={(trials) => onChange(i, { trials })}
            />
          ) : (
            <>
              <CheckGroup
                label="Prompting level"
                options={PROMPTING_LEVELS.map((v) => ({ value: v, label: v }))}
                selected={inputs[i]?.promptingLevel ?? []}
                onChange={(promptingLevel) => onChange(i, { promptingLevel })}
              />
              <CheckGroup
                label="Prompting type"
                options={PROMPTING_TYPES.map((v) => ({ value: v, label: v }))}
                selected={inputs[i]?.promptingType ?? []}
                onChange={(promptingType) => onChange(i, { promptingType })}
              />
            </>
          )}
          </div>
          <CheckGroup
            label="Redirection"
            options={REDIRECTION_LEVELS.map((v) => ({ value: v, label: v }))}
            selected={inputs[i]?.redirection ?? []}
            onChange={(redirection) => onChange(i, { redirection })}
          />
          <CheckGroup
            label="Response"
            options={RESPONSE_TYPES.map((v) => ({ value: v, label: v }))}
            selected={inputs[i]?.response ?? []}
            onChange={(response) => onChange(i, { response })}
          />
          <div style={{ marginTop: 6 }}>
            <label className="label">Additional notes</label>
            <input
              className="input"
              value={inputs[i]?.additionalNotes ?? ""}
              onChange={(e) => onChange(i, { additionalNotes: e.target.value })}
            />
          </div>
        </div>
        );
      })}
    </div>
  );
}

function NewsStudentCard({
  roles,
  state: st,
  studentGoals,
  onRoleChange,
  onNewsChange,
  onPragmaticChange,
  onGoalsChange,
}: {
  roles: Role[];
  state: StudentState;
  studentGoals: Goal[];
  onRoleChange: (roleId: string) => void;
  onNewsChange: (patch: Partial<NewsFieldValues>) => void;
  onPragmaticChange: (key: PragmaticSkillKey, patch: Partial<PragmaticSkillValue>) => void;
  onGoalsChange: (ids: string[]) => void;
}) {
  const role = roles.find((r) => r.id === st.roleId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="label">Role</label>
          <select
            className="select"
            value={st.roleId}
            onChange={(e) => onRoleChange(e.target.value)}
          >
            <option value="">— Select —</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {role?.name === "Other" && (
          <div>
            <label className="label">Role description</label>
            <input
              className="input"
              value={st.news.otherRoleDescription ?? ""}
              onChange={(e) => onNewsChange({ otherRoleDescription: e.target.value })}
            />
          </div>
        )}
      </div>

      {role?.fields.includes("visualCues") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Visual cues — %</label>
            <input
              className="input"
              type="number"
              value={st.news.cuesPercentage ?? ""}
              onChange={(e) => onNewsChange({ cuesPercentage: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Cue target</label>
            <input
              className="input"
              value={st.news.cuesTarget ?? ""}
              placeholder="e.g. pacing, or 'other'"
              onChange={(e) => onNewsChange({ cuesTarget: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Prompting</label>
            <select
              className="select"
              value={st.news.cuesPrompting ?? ""}
              onChange={(e) => onNewsChange({ cuesPrompting: e.target.value })}
            >
              <option value="">—</option>
              {NEWS_PROMPT_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {role?.fields.includes("facialExpressions") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Facial expressions — %</label>
            <input
              className="input"
              type="number"
              value={st.news.facialPercentage ?? ""}
              onChange={(e) => onNewsChange({ facialPercentage: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Prompting</label>
            <select
              className="select"
              value={st.news.facialPrompting ?? ""}
              onChange={(e) => onNewsChange({ facialPrompting: e.target.value })}
            >
              <option value="">—</option>
              {NEWS_PROMPT_LEVELS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {role?.fields.includes("decodingCarryover") && (
        <div>
          <label className="label">Decoding carryover — %</label>
          <input
            className="input"
            type="number"
            value={st.news.decodingPercentage ?? ""}
            onChange={(e) => onNewsChange({ decodingPercentage: e.target.value })}
          />
        </div>
      )}

      {role?.fields.includes("pragmatic") && (
        <div>
          <label className="label">Pragmatic skills (Studio Audience)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.keys(STUDIO_AUDIENCE_SKILLS) as PragmaticSkillKey[]).map((key) => {
              const skill = st.news.pragmatic?.[key] ?? {
                enabled: false,
                qualityLevel: "",
                promptLevel: "",
              };
              return (
                <div
                  key={key}
                  style={{ display: "grid", gridTemplateColumns: "auto 2fr 1fr 1fr", gap: 8, alignItems: "center" }}
                >
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    onChange={(e) => onPragmaticChange(key, { enabled: e.target.checked })}
                  />
                  <span style={{ fontSize: 13 }}>{STUDIO_AUDIENCE_SKILLS[key]}</span>
                  <select
                    className="select"
                    value={skill.qualityLevel}
                    disabled={!skill.enabled}
                    onChange={(e) => onPragmaticChange(key, { qualityLevel: e.target.value })}
                  >
                    <option value="">— Quality —</option>
                    {PRAGMATIC_QUALITY_LEVELS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <select
                    className="select"
                    value={skill.promptLevel}
                    disabled={!skill.enabled}
                    onChange={(e) => onPragmaticChange(key, { promptLevel: e.target.value })}
                  >
                    <option value="">— Prompting —</option>
                    {NEWS_PROMPT_LEVELS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {role?.fields.includes("compliments") && (
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={!!st.news.gaveCompliments}
              onChange={(e) => onNewsChange({ gaveCompliments: e.target.checked })}
            />
            Gave compliments
          </label>
          <select
            className="select"
            value={st.news.complimentsPrompting ?? ""}
            disabled={!st.news.gaveCompliments}
            onChange={(e) => onNewsChange({ complimentsPrompting: e.target.value })}
          >
            <option value="">— Prompting —</option>
            {NEWS_PROMPT_LEVELS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="label">Rehearsal → broadcast</label>
        <input
          className="input"
          value={st.news.rehearsalToBroadcast ?? ""}
          onChange={(e) => onNewsChange({ rehearsalToBroadcast: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Additional notes</label>
        <input
          className="input"
          value={st.news.additionalNotes ?? ""}
          onChange={(e) => onNewsChange({ additionalNotes: e.target.value })}
        />
      </div>

      <CheckGroup
        label="Goals"
        options={studentGoals.map((g) => ({
          value: g.id,
          label: g.shortName,
          title: g.shortTermGoal.trim() || undefined,
        }))}
        selected={st.newsGoalIds}
        onChange={onGoalsChange}
      />
    </div>
  );
}

function CheckGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  // `title`, when set, shows on hover (native tooltip) and gives the label a
  // subtle dotted underline so it's discoverable — used for goals' full text.
  options: { value: string; label: string; title?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (v: string, on: boolean) =>
    onChange(on ? [...selected, v] : selected.filter((x) => x !== v));
  return (
    <div style={{ marginBottom: 8 }}>
      <label className="label">{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 13 }}>
        {options.length === 0 ? (
          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>None available</span>
        ) : (
          options.map((o) => (
            <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={(e) => toggle(o.value, e.target.checked)}
              />
              {o.title ? (
                <span title={o.title} style={{ cursor: "help" }}>
                  {o.label}
                </span>
              ) : (
                o.label
              )}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results view
// ---------------------------------------------------------------------------

function ResultsView({
  date,
  timeSlot,
  results,
  error,
  onBack,
  onNavigate,
  onRegenerate,
  onToggleDrafts,
}: {
  date: string;
  timeSlot: string;
  results: ResultRow[];
  error: string | null;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
  onRegenerate: (ids: string[], feedback?: string, saveAsRule?: boolean) => void;
  onToggleDrafts: (id: string) => void;
}) {
  const parsed = parseDate(date);
  const allNotes = useMemo(
    () => buildAllNotes(parsed ? formatLong(parsed) : date, timeSlot, results),
    [parsed, date, timeSlot, results],
  );
  // The student ids being regenerated-with-feedback (modal open when non-null);
  // a single id for a per-note Regenerate, many for a bulk selection.
  const [regenTargets, setRegenTargets] = useState<string[] | null>(null);
  // Notes checked for a bulk regenerate. Absent notes aren't selectable.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectable = results.filter((r) => !r.absent && r.result);
  const toggleSelected = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const regenRows = regenTargets
    ? regenTargets.map((id) => results.find((r) => r.studentId === id)).filter((r): r is ResultRow => r != null)
    : [];
  return (
    <div className="shell">
      <Nav current="generate" onNavigate={onNavigate} />
      <div style={{ marginBottom: "1rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← Back to form
        </button>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 14px 0" }}>Generated notes</h1>

      {error && (
        <p style={{ fontSize: 13, color: "var(--color-text-warning)", marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}
        >
          <h3 className="card__title" style={{ margin: 0 }}>
            All notes
          </h3>
          <button
            className="button button--small"
            onClick={() => navigator.clipboard.writeText(allNotes)}
          >
            <Icon name="check" size={13} /> Copy all
          </button>
        </div>
        <textarea
          className="input"
          readOnly
          value={allNotes}
          style={{ width: "100%", minHeight: 240, fontFamily: "ui-monospace, monospace", fontSize: 13 }}
        />
      </div>

      {/* Bulk selection bar — regenerate several notes with one shared correction. */}
      {selectable.length > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "8px 14px",
            marginBottom: 10,
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            background: "var(--color-background-secondary)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={selected.size === selectable.length && selectable.length > 0}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && selected.size < selectable.length;
              }}
              onChange={(e) =>
                setSelected(e.target.checked ? new Set(selectable.map((r) => r.studentId)) : new Set())
              }
            />
            {selected.size > 0 ? `${selected.size} selected` : "Select notes"}
          </label>
          <button
            className="button button--small"
            disabled={selected.size === 0}
            onClick={() => setRegenTargets([...selected])}
          >
            <Icon name="refresh" size={13} /> Regenerate selected
          </button>
        </div>
      )}

      {results.map((r) => (
        <div key={r.studentId} className="card" style={{ marginBottom: 10 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 500 }}>
              {!r.absent && r.result && (
                <input
                  type="checkbox"
                  checked={selected.has(r.studentId)}
                  onChange={(e) => toggleSelected(r.studentId, e.target.checked)}
                />
              )}
              {r.name}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="button button--small"
                onClick={() => navigator.clipboard.writeText(r.result?.final ?? "")}
                disabled={!r.result}
              >
                Copy
              </button>
              {!r.absent && (
                <>
                  <button
                    className="button button--small"
                    onClick={() => onToggleDrafts(r.studentId)}
                  >
                    {r.showDrafts ? "Hide drafts" : "Show drafts"}
                  </button>
                  <button
                    className="button button--small"
                    onClick={() => setRegenTargets([r.studentId])}
                    disabled={r.regenerating}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {r.regenerating ? `${PASS_LABEL[r.regenPhase ?? "draft"]}…` : "Regenerate"}
                  </button>
                </>
              )}
            </div>
          </div>
          {r.error ? (
            <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{r.error}</p>
          ) : !r.result ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
              {r.regenerating ? "Generating…" : "Waiting…"}
            </p>
          ) : (
            <>
              {r.regenerating && (
                <p style={{ fontSize: 12, color: "var(--color-text-info)", margin: "0 0 6px 0" }}>
                  Regenerating · {PASS_LABEL[r.regenPhase ?? "draft"]}…
                </p>
              )}
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  whiteSpace: "pre-wrap",
                  opacity: r.regenerating ? 0.5 : 1,
                }}
              >
                {r.result.final}
              </p>
              {!r.regenerating && r.result.warnings.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    background: "var(--color-background-warning)",
                    border: "0.5px solid var(--color-border-warning)",
                    borderRadius: "var(--border-radius-md)",
                    fontSize: 12,
                    color: "var(--color-text-warning)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, marginBottom: 4 }}>
                    <Icon name="alert-circle" size={13} /> Needs your review
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {r.result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.showDrafts && (
                <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <details>
                    <summary>Draft pass</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                      {r.result.draft}
                    </pre>
                  </details>
                  <details>
                    <summary>Review pass</summary>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
                      {r.result.reviewed}
                    </pre>
                  </details>
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {regenRows.length > 0 && (
        <RegenerateModal
          targets={regenRows.map((r) => ({ name: r.name, currentNote: r.result?.final ?? "" }))}
          onClose={() => setRegenTargets(null)}
          onSubmit={(feedback, saveAsRule) => {
            onRegenerate(
              regenRows.map((r) => r.studentId),
              feedback,
              saveAsRule,
            );
            setRegenTargets(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

// Canonical feedback phrases for the one-click "Quick fixes" chips.
const QUICK_FIXES: { label: string; phrase: string }[] = [
  { label: "Too long", phrase: "This note is too long — make it more concise." },
  { label: "Sounds robotic", phrase: "This sounds robotic — make it read more naturally." },
  { label: "Made up details", phrase: "This includes details I didn't provide — only use what I wrote." },
  { label: "Wrong tone", phrase: "The tone is off — match a clinical SLP session note." },
];

// Regenerate one or more notes with optional feedback. Mirrors the
// SESIS_mocks.html "Regenerate note with feedback" design: current-note preview
// (or the list of notes, for a bulk selection), free-text + quick-fix chips, and
// an optional "save as a rule for future notes".
function RegenerateModal({
  targets,
  onSubmit,
  onClose,
}: {
  targets: { name: string; currentNote: string }[];
  onSubmit: (feedback: string, saveAsRule: boolean) => void;
  onClose: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  const [saveAsRule, setSaveAsRule] = useState(false);
  const hasFeedback = feedback.trim() !== "";
  const single = targets.length === 1;
  // Bulk mode pages through one full note at a time so she can read each one.
  const [page, setPage] = useState(0);
  const current = targets[Math.min(page, targets.length - 1)]!;
  // Append a quick-fix phrase (once), on its own line.
  const addQuickFix = (phrase: string) =>
    setFeedback((prev) => {
      if (prev.includes(phrase)) return prev;
      return prev.trim() === "" ? phrase : `${prev.trim()}\n${phrase}`;
    });
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        zIndex: 10,
      }}
    >
      <div
        style={{
          background: "var(--color-background-primary)",
          borderRadius: "var(--border-radius-lg)",
          border: "0.5px solid var(--color-border-tertiary)",
          padding: "1.5rem",
          width: 660,
          maxWidth: "100%",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>
            {single ? `Regenerate ${targets[0]!.name}'s note` : `Regenerate ${targets.length} notes`}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", padding: "4px 8px", lineHeight: 0 }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
          {single
            ? "Tell the AI what to fix and we'll regenerate with that guidance in mind."
            : "Apply one correction to all selected notes — e.g. a phrase the AI mistranslated."}
        </p>

        <div
          style={{
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {single ? "Current note" : `${current.name} · note ${page + 1} of ${targets.length}`}
            </p>
            {!single && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  className="button button--small"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={{ padding: "2px 6px" }}
                >
                  <Icon name="chevron-left" size={14} />
                </button>
                <button
                  className="button button--small"
                  disabled={page >= targets.length - 1}
                  onClick={() => setPage((p) => Math.min(targets.length - 1, p + 1))}
                  style={{ padding: "2px 6px" }}
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>
            )}
          </div>
          <div
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--color-text-secondary)",
              whiteSpace: "pre-wrap",
              height: "calc(1.6em * 4)",
              minHeight: "calc(1.6em * 2)",
              overflowY: "auto",
              resize: "vertical",
            }}
          >
            {current.currentNote}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
            {single ? "What's wrong with this note?" : "What's wrong with these notes?"}
          </label>
          <textarea
            className="input"
            autoFocus
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="e.g., 'don't say he said specific phrases — I didn't write that' or 'too long, make it more concise'"
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, minHeight: "calc(1.5em * 3 + 16px)", resize: "vertical" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: "0 0 8px 0", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Quick fixes
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {QUICK_FIXES.map((q) => (
              <button
                key={q.label}
                className="button button--small"
                style={{ fontSize: 12, padding: "5px 10px" }}
                onClick={() => addQuickFix(q.phrase)}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "var(--color-background-info)",
            border: "0.5px solid var(--color-border-info)",
            borderRadius: "var(--border-radius-md)",
            padding: "10px 12px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ color: "var(--color-text-info)", marginTop: 2, lineHeight: 0 }}>
              <Icon name="bulb" size={16} />
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-info)", fontWeight: 500 }}>
                Save as a rule for future notes?
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--color-text-info)" }}>
                If this is something you correct often, we can add it to the prompt rules so it
                doesn't happen again.
              </p>
              <label
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-info)", marginTop: 8, cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={saveAsRule}
                  onChange={(e) => setSaveAsRule(e.target.checked)}
                />
                Apply this guidance to all future notes
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => onSubmit("", false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "6px 12px", color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}
          >
            Just regenerate without feedback
          </button>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="button button--small" onClick={onClose} style={{ fontSize: 14 }}>
              Cancel
            </button>
            <button
              className="button button--small"
              disabled={!hasFeedback}
              onClick={() => onSubmit(feedback, saveAsRule && hasFeedback)}
              style={{
                fontSize: 14,
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "var(--color-background-info)",
                color: "var(--color-text-info)",
                borderColor: "var(--color-border-info)",
              }}
            >
              <Icon name="sparkles" size={14} /> Regenerate with feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllNotes(dateLabel: string, timeSlot: string, results: ResultRow[]): string {
  const body = results
    .filter((r) => r.result)
    .map((r) => `${r.name}:\n${r.result!.final}`)
    .join("\n\n");
  const header = timeSlot ? `${dateLabel}\n\n${timeSlot}` : dateLabel;
  return `${header}\n\n${body}`;
}

function buildContext(
  mode: Mode,
  teacher: Teacher,
  student: Student,
  st: StudentState,
  activities: ActivityDef[],
  goals: Goal[],
  catalog: Activity[],
  roleCatalog: Role[],
) {
  const pronoun = student.pronouns.split("/")[0]?.trim() || student.pronouns;
  if (mode === "news-day") {
    const role = resolveRoles(teacher, roleCatalog).find((r) => r.id === st.roleId);
    if (!role) throw new Error(`Pick a role for ${fullName(student)}`);
    const phrase = resolveRolePhrase(role, st.news);
    const roleData = buildRoleData(role, st.news);
    const selectedNews = goals.filter((g) => st.newsGoalIds.includes(g.id));
    return newsContext({
      // Narrative uses first name only for natural clinical prose; the all-notes
      // block separately uses displayName for the colon-label disambiguation.
      studentName: student.firstName,
      pronouns: student.pronouns,
      teacher,
      role: { ...role, name: role.name },
      rolePhrase: phrase,
      // Note names the concise shortname; the full sentence is passed as context.
      selectedGoals: selectedNews.map((g) => g.shortName || g.shortTermGoal),
      selectedGoalDetails: selectedNews.map((g) => g.shortTermGoal.trim() || g.shortName),
      roleData,
      additionalContext: buildAdditionalContext(teacher, student, st.captures),
    });
  }
  // Resolve regular goal IDs for the prompt: the note's "targeting" clause names
  // the concise shortname, while the full short-term sentence is supplied as
  // context so the model understands the clinical target (legacy goals with no
  // full text fall back to the shortname, and vice versa). The form stores IDs.
  const goalById = new Map(goals.map((g) => [g.id, g] as const));
  const resolvedInputs = st.regular.map((input) => {
    const picked = input.goals.map((id) => goalById.get(id)).filter((g): g is Goal => !!g);
    return {
      ...input,
      goals: picked.map((g) => g.shortName || g.shortTermGoal).filter(Boolean),
      goalDetails: picked.map((g) => g.shortTermGoal.trim() || g.shortName).filter(Boolean),
    };
  });
  // Resolve each selected activityId → its catalog entry, then build the
  // description: catalog descriptionTemplate (e.g. journal) or a session-capture
  // rewrite (e.g. José's pragmatic skills), falling back to the default. A
  // dangling id (catalog entry deleted) yields "" and is dropped downstream.
  const byId = catalogById(activityOptionsForGenerate(teacher, catalog));
  const activityArr = buildRegularActivities(activities, resolvedInputs, (def, i) => {
    const activity = byId.get(def.activityId);
    if (!activity) return "";
    const fallback = defaultDescription(activity, def.additionalInfo);
    // Student-level captures (e.g. Bengali) plus this activity's own captures
    // (e.g. pragmatic skills) feed the rewrite.
    const caps = { ...st.captures, ...(st.regular[i]?.captures ?? {}) };
    const selectedOptions = st.regular[i]?.options ?? [];
    return applyActivityRewrite(teacher, student, activity, def.additionalInfo, caps, fallback, selectedOptions);
  }, student.firstName, pronoun);
  return regularContext({
    studentName: student.firstName,
    pronouns: student.pronouns,
    pronoun,
    individualSession: false,
    teacher,
    activities: activityArr,
    additionalContext: buildAdditionalContext(teacher, student, st.captures),
  });
}

function buildSessionMetadata(
  date: string,
  teacherId: string,
  mode: Mode,
  includedStudents: Student[],
  studentState: Record<string, StudentState>,
): SessionMetadata {
  return {
    date,
    teacherId,
    students: includedStudents.map((s) => {
      const st = studentState[s.id]!;
      const goalIds =
        mode === "news-day"
          ? st.newsGoalIds.slice()
          : Array.from(new Set(st.regular.flatMap((r) => r.goals)));
      // Persist absence so Today/Schedule can mark it; omit the key when present
      // to keep files tidy. Absent students carry no goalIds.
      if (st.absent) return { studentId: s.id, goalIds: [], mode, absent: true };
      // Per-goal trial measurements (auditable count data) across the activities.
      const trials =
        mode === "news-day"
          ? []
          : st.regular.flatMap((r) =>
              r.trials?.enabled ? (r.trials.entries ?? []).filter(trialEntryStarted) : [],
            );
      return trials.length > 0
        ? { studentId: s.id, goalIds, mode, trials }
        : { studentId: s.id, goalIds, mode };
    }),
  };
}
