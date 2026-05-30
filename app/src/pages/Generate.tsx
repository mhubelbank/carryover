import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadSession, writeSessionMetadata } from "../domain/data";
import { formatLong, parseDate, startOfDay, toISODate, toWeekday } from "../domain/dates";
import {
  DOMAINS,
  FILMING_PROMPT_LEVELS,
  PRAGMATIC_QUALITY_LEVELS,
  PROMPTING_LEVELS,
  PROMPTING_TYPES,
  REDIRECTION_LEVELS,
  RESPONSE_TYPES,
  STUDIO_AUDIENCE_SKILLS,
  absentNote,
  buildRegularActivities,
  buildRoleData,
  filmingContext,
  regularContext,
  resolveRolePhrase,
  type ActivityDef,
  type ActivityInput,
  type FilmingFieldValues,
  type PragmaticSkillKey,
  type PragmaticSkillValue,
} from "../domain/generate";
import {
  MAX_TOKENS_BY_MODE,
  generateNote,
  loadPromptSet,
  type NoteResult,
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
import { displayName, fullName, studentContext, type Student } from "../domain/student";
import type { Activity, Mode, Role, SessionCapture, Teacher } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
  // Prefill date/teacher and pin the included student list (deep-link from
  // Today's per-session "Generate N notes" button). Consumed once on arrival.
  target?: { date: string; teacherId: string; studentIds: string[] } | null;
  onTargetConsumed?: () => void;
}

interface StudentState {
  included: boolean;
  absent: boolean;
  // Regular: per-activity inputs aligned to `activities` indices.
  regular: ActivityInput[];
  // Filming:
  roleId: string;
  filming: FilmingFieldValues;
  filmingGoalIds: string[];
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
  showDrafts?: boolean;
}

function blankRegularInput(): ActivityInput {
  return {
    goals: [],
    promptingLevel: [],
    promptingType: [],
    redirection: [],
    response: [],
    additionalNotes: "",
    captures: {},
    options: [],
  };
}

function blankActivity(): ActivityDef {
  return { activityId: "", additionalInfo: "", segmentName: "", domains: [] };
}

function blankFilming(): FilmingFieldValues {
  return {
    pragmatic: {
      maintainedAttention: { enabled: false, qualityLevel: "", promptLevel: "" },
      waitedToSpeak: { enabled: false, qualityLevel: "", promptLevel: "" },
      appropriateBehavior: { enabled: false, qualityLevel: "", promptLevel: "" },
    },
  };
}

export function Generate({ onNavigate, target, onTargetConsumed }: Props) {
  const { state, client } = useTerm();
  const { keys } = useAuth();

  const [date, setDate] = useState(() => toISODate(toWeekday(startOfDay(new Date()))));
  const [teacherId, setTeacherId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("regular");
  const [activities, setActivities] = useState<ActivityDef[]>([blankActivity()]);
  const [studentState, setStudentState] = useState<Record<string, StudentState>>({});
  const [phase, setPhase] = useState<"form" | "running" | "results">("form");
  const [results, setResults] = useState<ResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  // When set, fresh student-state entries default `included` to membership in
  // this list (deep-link from Today). Sticks across re-seeds, but existing
  // entries' `included` is preserved if she toggles them after arrival.
  const [pinnedStudentIds, setPinnedStudentIds] = useState<string[] | null>(null);

  // Consume a deep-link target on arrival.
  useEffect(() => {
    if (!target) return;
    setDate(target.date);
    setTeacherId(target.teacherId);
    setPinnedStudentIds(target.studentIds);
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

  // Snap mode to one the teacher supports when teacher changes.
  useEffect(() => {
    if (teacher && !teacher.modes.includes(mode)) setMode(teacher.modes[0] ?? "regular");
  }, [teacher, mode]);

  // Ensure every caseload student has a state entry, sized to current activity count.
  useEffect(() => {
    if (caseload.length === 0) return;
    setStudentState((prev) => {
      const next: Record<string, StudentState> = {};
      for (const s of caseload) {
        const old = prev[s.id];
        const regular = activities.map((_, i) => old?.regular[i] ?? blankRegularInput());
        next[s.id] = old
          ? { ...old, regular }
          : {
              included: pinnedStudentIds ? pinnedStudentIds.includes(s.id) : true,
              absent: false,
              regular,
              roleId: "",
              filming: blankFilming(),
              filmingGoalIds: [],
              captures: {},
            };
      }
      return next;
    });
  }, [caseload, activities.length, pinnedStudentIds]);

  if (state.status !== "ready") return null;
  const { students, goals } = state.data;
  const catalog = state.data.activities;
  const roleCatalog = state.data.filmingRoles;
  // The activities offered in the dropdown: this teacher's catalog activities
  // plus the reserved ad-hoc "Other".
  const activityOptions = teacher ? activityOptionsForGenerate(teacher, catalog) : [];
  // The teacher's filming roles, resolved from the shared catalog.
  const roleOptions = teacher ? resolveRoles(teacher, roleCatalog) : [];

  function setStudent(id: string, patch: Partial<StudentState>) {
    setStudentState((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
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

  function setFilming(id: string, patch: Partial<FilmingFieldValues>) {
    setStudentState((prev) => {
      const cur = prev[id]!;
      return { ...prev, [id]: { ...cur, filming: { ...cur.filming, ...patch } } };
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
      const prag = cur.filming.pragmatic ?? {};
      const skill = prag[key] ?? { enabled: false, qualityLevel: "", promptLevel: "" };
      return {
        ...prev,
        [id]: {
          ...cur,
          filming: {
            ...cur.filming,
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

  // When Today deep-linked us in, `pinnedStudentIds` carries the schedule's
  // saved order for that slot — preserve it so the all-notes paste order
  // matches what she set in the Schedule editor. Outside that path, fall back
  // to caseload order.
  const includedStudents = pinnedStudentIds
    ? pinnedStudentIds
        .map((id) => caseload.find((s) => s.id === id))
        .filter((s): s is Student => s != null && (studentState[s.id]?.included ?? false))
    : caseload.filter((s) => studentState[s.id]?.included);
  const canGenerate =
    teacher !== undefined &&
    includedStudents.length > 0 &&
    keys?.anthropicApiKey != null &&
    client !== null;

  async function handleGenerate() {
    if (!teacher || !client || !keys?.anthropicApiKey) return;
    // Date and at least one activity are required (matching SESIS) — raise a
    // clear error rather than generating a dateless or activity-less note. The
    // activity requirement is regular-mode only; filming day uses roles instead.
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
    // students actually in this session), so two "Kai"s on the same caseload
    // render as "Kai M." vs "Kai R." before the colon.
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

    const apiKey = keys.anthropicApiKey;
    // Run students sequentially to keep the API call cadence gentle; failures
    // per student show on their card without aborting the batch.
    for (const student of includedStudents) {
      const st = studentState[student.id]!;
      if (st.absent) {
        updateResult(student.id, {
          result: {
            draft: "",
            reviewed: "",
            final: absentNote(displayName(student, includedStudents)),
          },
        });
        continue;
      }
      try {
        const ctx = buildContext(mode, teacher, student, st, activities, goals, catalog, roleCatalog);
        const result = await generateNote(apiKey, prompts, ctx, {
          maxTokens: MAX_TOKENS_BY_MODE[mode],
          postProcess: buildPostProcess(teacher, student),
        });
        updateResult(student.id, { result });
      } catch (e) {
        updateResult(student.id, { error: e instanceof Error ? e.message : "Failed" });
      }
    }

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

    setPhase("results");
  }

  function updateResult(studentId: string, patch: Partial<ResultRow>) {
    setResults((prev) => prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
  }

  async function regenerate(studentId: string) {
    if (!teacher || !client || !keys?.anthropicApiKey) return;
    const row = results.find((r) => r.studentId === studentId);
    const st = studentState[studentId];
    const student = students.find((s) => s.id === studentId);
    if (!row || !st || !student || row.absent) return;
    updateResult(studentId, { regenerating: true, error: undefined });
    try {
      const prompts = await loadPromptSet(client, mode);
      const ctx = buildContext(mode, teacher, student, st, activities, goals, catalog, roleCatalog);
      const result = await generateNote(keys.anthropicApiKey, prompts, ctx, {
        maxTokens: MAX_TOKENS_BY_MODE[mode],
        postProcess: buildPostProcess(teacher, student),
      });
      updateResult(studentId, { result, regenerating: false });
    } catch (e) {
      updateResult(studentId, {
        regenerating: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }

  if (phase === "results") {
    return (
      <ResultsView
        date={date}
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

      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Generate notes</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {teacher ? `${teacher.name}'s caseload` : "—"} · {includedStudents.length} student
          {includedStudents.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Top controls */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
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
            <label className="label">Mode</label>
            <select
              className="select"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              {teacher?.modes.map((m) => (
                <option key={m} value={m}>
                  {m === "regular" ? "Regular" : "Filming day"}
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

      {/* Per-student cards */}
      {teacher &&
        caseload.map((student) => {
          const st = studentState[student.id];
          if (!st) return null;
          const studentGoals = goals.filter((g) => g.studentId === student.id && !g.archived);
          return (
            <div
              key={student.id}
              className="card"
              style={{
                marginBottom: 10,
                opacity: st.included ? 1 : 0.5,
                background: st.absent ? "var(--color-background-secondary)" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: st.included && !st.absent ? 12 : 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <input
                    type="checkbox"
                    checked={st.included}
                    onChange={(e) => setStudent(student.id, { included: e.target.checked })}
                  />
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{fullName(student)}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {student.pronouns}
                  </span>
                </div>
                {st.included && (
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                  >
                    <input
                      type="checkbox"
                      checked={st.absent}
                      onChange={(e) => setStudent(student.id, { absent: e.target.checked })}
                    />
                    Absent
                  </label>
                )}
              </div>

              {st.included && !st.absent && (
                <CapturePanel
                  teacher={teacher}
                  student={student}
                  state={st.captures}
                  onChange={(captureName, fieldName, value) =>
                    setCaptureField(student.id, captureName, fieldName, value)
                  }
                />
              )}

              {st.included && !st.absent && mode === "regular" && (
                <RegularStudentCard
                  activities={activities}
                  options={activityOptions}
                  teacher={teacher}
                  inputs={st.regular}
                  studentGoals={studentGoals}
                  onChange={(idx, patch) => setRegularInput(student.id, idx, patch)}
                  onCaptureChange={(idx, capName, fieldName, value) =>
                    setActivityCapture(student.id, idx, capName, fieldName, value)
                  }
                />
              )}

              {st.included && !st.absent && mode === "filming-day" && (
                <FilmingStudentCard
                  roles={roleOptions}
                  state={st}
                  studentGoals={studentGoals}
                  onRoleChange={(roleId) => setStudent(student.id, { roleId })}
                  onFilmingChange={(patch) => setFilming(student.id, patch)}
                  onPragmaticChange={(key, patch) => setPragmatic(student.id, key, patch)}
                  onGoalsChange={(ids) => setStudent(student.id, { filmingGoalIds: ids })}
                />
              )}
            </div>
          );
        })}

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <button
          className="button button--primary"
          onClick={handleGenerate}
          disabled={!canGenerate || phase === "running"}
        >
          {phase === "running"
            ? "Generating…"
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

function RegularStudentCard({
  activities,
  options,
  teacher,
  inputs,
  studentGoals,
  onChange,
  onCaptureChange,
}: {
  activities: ActivityDef[];
  options: Activity[];
  teacher: Teacher;
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
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {activities.map((a, i) => {
        const def = options.find((o) => o.id === a.activityId);
        const caps = def ? activityCapturesFor(teacher, { id: def.id, name: def.name }) : [];
        return (
        <div key={i} style={{ borderTop: i > 0 ? "0.5px solid var(--color-border-tertiary)" : undefined, paddingTop: i > 0 ? 10 : 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>
            {def?.name || `Activity ${i + 1}`}
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
            options={studentGoals.map((g) => ({ value: g.id, label: g.shortName }))}
            selected={inputs[i]?.goals ?? []}
            onChange={(goals) => onChange(i, { goals })}
          />
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

function FilmingStudentCard({
  roles,
  state: st,
  studentGoals,
  onRoleChange,
  onFilmingChange,
  onPragmaticChange,
  onGoalsChange,
}: {
  roles: Role[];
  state: StudentState;
  studentGoals: Goal[];
  onRoleChange: (roleId: string) => void;
  onFilmingChange: (patch: Partial<FilmingFieldValues>) => void;
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
              value={st.filming.otherRoleDescription ?? ""}
              onChange={(e) => onFilmingChange({ otherRoleDescription: e.target.value })}
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
              value={st.filming.cuesPercentage ?? ""}
              onChange={(e) => onFilmingChange({ cuesPercentage: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Cue target</label>
            <input
              className="input"
              value={st.filming.cuesTarget ?? ""}
              placeholder="e.g. pacing, or 'other'"
              onChange={(e) => onFilmingChange({ cuesTarget: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Prompting</label>
            <select
              className="select"
              value={st.filming.cuesPrompting ?? ""}
              onChange={(e) => onFilmingChange({ cuesPrompting: e.target.value })}
            >
              <option value="">—</option>
              {FILMING_PROMPT_LEVELS.map((v) => (
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
              value={st.filming.facialPercentage ?? ""}
              onChange={(e) => onFilmingChange({ facialPercentage: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Prompting</label>
            <select
              className="select"
              value={st.filming.facialPrompting ?? ""}
              onChange={(e) => onFilmingChange({ facialPrompting: e.target.value })}
            >
              <option value="">—</option>
              {FILMING_PROMPT_LEVELS.map((v) => (
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
            value={st.filming.decodingPercentage ?? ""}
            onChange={(e) => onFilmingChange({ decodingPercentage: e.target.value })}
          />
        </div>
      )}

      {role?.fields.includes("pragmatic") && (
        <div>
          <label className="label">Pragmatic skills (Studio Audience)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(Object.keys(STUDIO_AUDIENCE_SKILLS) as PragmaticSkillKey[]).map((key) => {
              const skill = st.filming.pragmatic?.[key] ?? {
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
                    {FILMING_PROMPT_LEVELS.map((v) => (
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
              checked={!!st.filming.gaveCompliments}
              onChange={(e) => onFilmingChange({ gaveCompliments: e.target.checked })}
            />
            Gave compliments
          </label>
          <select
            className="select"
            value={st.filming.complimentsPrompting ?? ""}
            disabled={!st.filming.gaveCompliments}
            onChange={(e) => onFilmingChange({ complimentsPrompting: e.target.value })}
          >
            <option value="">— Prompting —</option>
            {FILMING_PROMPT_LEVELS.map((v) => (
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
          value={st.filming.rehearsalToBroadcast ?? ""}
          onChange={(e) => onFilmingChange({ rehearsalToBroadcast: e.target.value })}
        />
      </div>

      <div>
        <label className="label">Additional notes</label>
        <input
          className="input"
          value={st.filming.additionalNotes ?? ""}
          onChange={(e) => onFilmingChange({ additionalNotes: e.target.value })}
        />
      </div>

      <CheckGroup
        label="Goals"
        options={studentGoals.map((g) => ({ value: g.id, label: g.shortName }))}
        selected={st.filmingGoalIds}
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
  options: { value: string; label: string }[];
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
              {o.label}
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
  results,
  error,
  onBack,
  onNavigate,
  onRegenerate,
  onToggleDrafts,
}: {
  date: string;
  results: ResultRow[];
  error: string | null;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
  onRegenerate: (id: string) => void;
  onToggleDrafts: (id: string) => void;
}) {
  const parsed = parseDate(date);
  const allNotes = useMemo(() => buildAllNotes(parsed ? formatLong(parsed) : date, results), [
    parsed,
    date,
    results,
  ]);
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

      {results.map((r) => (
        <div key={r.studentId} className="card" style={{ marginBottom: 10 }}>
          <div
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
          >
            <span style={{ fontSize: 15, fontWeight: 500 }}>{r.name}</span>
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
                    onClick={() => onRegenerate(r.studentId)}
                    disabled={r.regenerating}
                  >
                    {r.regenerating ? "…" : "Regenerate"}
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
              <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{r.result.final}</p>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllNotes(dateLabel: string, results: ResultRow[]): string {
  const body = results
    .filter((r) => r.result)
    .map((r) => `${r.name}:\n${r.result!.final}`)
    .join("\n\n");
  return `${dateLabel}\n\n${body}`;
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
  if (mode === "filming-day") {
    const role = resolveRoles(teacher, roleCatalog).find((r) => r.id === st.roleId);
    if (!role) throw new Error(`Pick a role for ${fullName(student)}`);
    const phrase = resolveRolePhrase(role, st.filming);
    const roleData = buildRoleData(role, st.filming);
    const selectedShortNames = goals
      .filter((g) => st.filmingGoalIds.includes(g.id))
      .map((g) => g.shortName);
    return filmingContext({
      // Narrative uses first name only for natural clinical prose; the all-notes
      // block separately uses displayName for the colon-label disambiguation.
      studentName: student.firstName,
      pronouns: student.pronouns,
      teacher,
      role: { ...role, name: role.name },
      rolePhrase: phrase,
      selectedGoals: selectedShortNames,
      roleData,
      additionalContext: buildAdditionalContext(teacher, student, st.captures),
    });
  }
  // Resolve regular goal IDs → shortname strings for the prompt template; the
  // form stores IDs so session metadata can persist them and shortname renames
  // don't break selections.
  const goalById = new Map(goals.map((g) => [g.id, g] as const));
  const resolvedInputs = st.regular.map((input) => ({
    ...input,
    goals: input.goals.map((id) => goalById.get(id)?.shortName ?? "").filter(Boolean),
  }));
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
  });
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
        mode === "filming-day"
          ? st.filmingGoalIds.slice()
          : Array.from(new Set(st.regular.flatMap((r) => r.goals)));
      return { studentId: s.id, goalIds, mode };
    }),
  };
}
