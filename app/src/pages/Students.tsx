import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { PeopleToggle } from "../components/PeopleToggle";
import { SaveBar } from "../components/SaveBar";
import { confirmNavAway } from "../hooks/useUnsavedGuard";
import { useTerm } from "../context/TermContext";
import { loadIepHistory } from "../domain/data";
import { formatShort, parseDate, startOfDay, toISODate } from "../domain/dates";
import type { Goal } from "../domain/goal";
import type { IepReview } from "../domain/iep";
import {
  ageFlag,
  computedAge,
  displayName,
  fullName,
  isDeparted,
  nextStudentId,
  type Student,
} from "../domain/student";
import type { StudentField } from "../domain/studentField";
import {
  PROMPTING_LEVELS,
  PROMPTING_TYPES,
  REDIRECTION_LEVELS,
  RESPONSE_TYPES,
} from "../domain/generate";
import { StudentGoals } from "./Goals";
import { IepReview as IepReviewScreen } from "./IepReview";
import { StudentAvatar, firstGrapheme } from "../components/StudentAvatar";

interface Props {
  onNavigate: (page: NavPage) => void;
  // A student to open directly (deep-link from Today) and which view to land on.
  // Consumed once on arrival.
  target: { id: string; view: "detail" | "goals" | "iep-review" } | null;
  onTargetConsumed: () => void;
}

type View =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "goals"; id: string; expand?: string }
  | { kind: "iep-review"; id: string }
  | { kind: "create"; student: Student };

export function Students({ onNavigate, target, onTargetConsumed }: Props) {
  const { state } = useTerm();
  const [view, setView] = useState<View>({ kind: "list" });
  // Switch sub-views, but prompt first if an editor has unsaved changes (the
  // back arrow / detail↔goals↔review jumps don't go through App's nav guard).
  const go = (v: View) => {
    if (confirmNavAway()) setView(v);
  };
  // Reset scroll when switching sub-views (detail ↔ goals ↔ review all stay on
  // the "students" page, so App's page-level reset doesn't fire).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.kind, "id" in view ? view.id : ""]);
  useEffect(() => {
    if (target) {
      setView(
        target.view === "goals"
          ? { kind: "goals", id: target.id }
          : target.view === "iep-review"
            ? { kind: "iep-review", id: target.id }
            : { kind: "detail", id: target.id },
      );
      onTargetConsumed();
    }
  }, [target, onTargetConsumed]);
  if (state.status !== "ready") return null;
  const students = state.data.students;

  if (view.kind === "create") {
    return (
      <StudentDetail
        key="new"
        student={view.student}
        isNew
        onBack={() => go({ kind: "list" })}
        onViewGoals={() => {}}
        onReviewIep={() => {}}
        onNavigate={onNavigate}
      />
    );
  }
  if (view.kind === "detail") {
    const student = students.find((s) => s.id === view.id);
    if (student) {
      return (
        <StudentDetail
          key={student.id}
          student={student}
          isNew={false}
          onBack={() => go({ kind: "list" })}
          onViewGoals={() => go({ kind: "goals", id: student.id })}
          onReviewIep={() => go({ kind: "iep-review", id: student.id })}
          onNavigate={onNavigate}
        />
      );
    }
  }
  if (view.kind === "goals") {
    return (
      <StudentGoals
        studentId={view.id}
        expandGoalId={view.expand}
        onBack={() => go({ kind: "detail", id: view.id })}
        onNavigate={onNavigate}
      />
    );
  }
  if (view.kind === "iep-review") {
    return (
      <IepReviewScreen
        studentId={view.id}
        onBack={() => go({ kind: "detail", id: view.id })}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <StudentsList
      onNavigate={onNavigate}
      onOpen={(id) => go({ kind: "detail", id })}
      onAdd={() => go({ kind: "create", student: blankStudent(students) })}
    />
  );
}

function StudentsList({
  onNavigate,
  onOpen,
  onAdd,
}: {
  onNavigate: (page: NavPage) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { state, teacherById, saveStudents } = useTerm();
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [archivedView, setArchivedView] = useState(false);
  const [busy, setBusy] = useState(false);

  const data = state.status === "ready" ? state.data : null;
  const goalCount = useMemo(
    () => (data ? countActiveGoals(data.goals) : new Map<string, number>()),
    [data],
  );
  if (!data) return null;

  const pool = data.students.filter((s) => s.archived === archivedView);
  const departed = !archivedView ? pool.filter((s) => isDeparted(s)) : [];
  const q = query.trim().toLowerCase();
  const filtered = pool
    .filter((s) => (teacherFilter === "all" ? true : s.teacherId === teacherFilter))
    .filter((s) => (q === "" ? true : fullName(s).toLowerCase().includes(q)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  async function archiveDeparted() {
    if (departed.length === 0) return;
    const ids = new Set(departed.map((s) => s.id));
    setBusy(true);
    try {
      await saveStudents(data!.students.map((s) => (ids.has(s.id) ? { ...s, archived: true } : s)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <PeopleToggle current="students" onNavigate={onNavigate} />
          <p style={{ margin: "8px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {pool.length} {archivedView ? "archived" : "active"} student
            {pool.length === 1 ? "" : "s"} across {data.teachers.length} teacher
            {data.teachers.length === 1 ? "" : "s"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              display: "inline-flex",
              border: "0.5px solid var(--color-border-secondary)",
              borderRadius: "var(--border-radius-md)",
              overflow: "hidden",
            }}
          >
            <button
              className="button button--small"
              onClick={() => setArchivedView(false)}
              style={{
                border: "none",
                borderRadius: 0,
                background: !archivedView ? "var(--color-background-secondary)" : "transparent",
              }}
            >
              Active
            </button>
            <button
              className="button button--small"
              onClick={() => setArchivedView(true)}
              style={{
                border: "none",
                borderRadius: 0,
                background: archivedView ? "var(--color-background-secondary)" : "transparent",
              }}
            >
              Archived
            </button>
          </div>
          {!archivedView && (
            <button className="button button--small" onClick={onAdd}>
              <Icon name="plus" size={14} />
              Add student
            </button>
          )}
        </div>
      </div>

      {departed.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            marginBottom: "1rem",
            border: "0.5px solid var(--color-border-warning)",
            background: "var(--color-background-warning)",
            color: "var(--color-text-warning)",
            borderRadius: "var(--border-radius-md)",
            fontSize: 13,
          }}
        >
          <span>
            {departed.length} student{departed.length === 1 ? " is" : "s are"} past their last day
            — ready to archive.
          </span>
          <button className="button button--small" onClick={archiveDeparted} disabled={busy}>
            {busy ? "Archiving…" : `Archive ${departed.length}`}
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-tertiary)",
              lineHeight: 0,
            }}
          >
            <Icon name="search" size={14} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 32 }}
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 160 }}
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
        >
          <option value="all">All teachers</option>
          {data.teachers.filter((t) => !t.archived).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          overflow: "hidden",
          background: "var(--color-background-secondary)",
        }}
      >
        <table
          style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              <th style={th(22)}>Name</th>
              <th style={th(14)}>Teacher</th>
              <th style={th(8)}>Age</th>
              <th style={th(12)}>Mandate</th>
              <th style={th(7)}>Goals</th>
              <th style={th(12)}>Next IEP</th>
              <th style={{ width: "5%" }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const iep = parseDate(s.nextIepReview);
              const count = goalCount.get(s.id) ?? 0;
              const departedRow = isDeparted(s);
              const age = computedAge(s);
              const display = displayName(s, pool);
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  style={{
                    borderTop: "0.5px solid var(--color-border-tertiary)",
                    cursor: "pointer",
                    color: departedRow ? "var(--color-text-tertiary)" : undefined,
                  }}
                >
                  <td style={td()}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                      <StudentAvatar student={s} size={26} />
                      {departedRow && (
                        <span
                          title={`Past last day (${s.lastDay ?? ""})`}
                          style={{ color: "var(--color-text-warning)", lineHeight: 0 }}
                        >
                          <Icon name="alert-circle" size={13} />
                        </span>
                      )}
                      <span>{display}</span>
                    </span>
                  </td>
                  <td style={td("var(--color-text-secondary)")}>
                    {teacherById.get(s.teacherId)?.name ?? "—"}
                  </td>
                  <td style={td(ageColorOf(age))}>{age ?? "—"}</td>
                  <td style={td("var(--color-text-secondary)")}>{s.mandate || "—"}</td>
                  <td
                    style={{
                      ...td(
                        count === 0
                          ? "var(--color-text-warning)"
                          : "var(--color-text-secondary)",
                      ),
                      fontWeight: count === 0 ? 500 : 400,
                    }}
                  >
                    {count}
                  </td>
                  <td style={{ ...td("var(--color-text-secondary)"), fontSize: 13 }}>
                    {iep ? formatShort(iep) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <span style={{ color: "var(--color-text-tertiary)", lineHeight: 0 }}>
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          style={{
            padding: "12px 14px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--color-text-tertiary)",
            borderTop: "0.5px solid var(--color-border-tertiary)",
          }}
        >
          {filtered.length === 0
            ? `No ${archivedView ? "archived" : "active"} students match`
            : `Showing ${filtered.length} of ${pool.length}`}
        </div>
      </div>
    </div>
  );
}

function StudentDetail({
  student,
  isNew,
  onBack,
  onViewGoals,
  onReviewIep,
  onNavigate,
}: {
  student: Student;
  isNew: boolean;
  onBack: () => void;
  onViewGoals: () => void;
  onReviewIep: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, client, saveStudents } = useTerm();
  const [draft, setDraft] = useState<Student>(() => cloneStudent(student));
  const [baseline, setBaseline] = useState<Student>(() => cloneStudent(student));
  const [history, setHistory] = useState<IepReview[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Archive prompt: collects the student's last day (defaults to today) before
  // archiving. null = closed.
  const [archiveDate, setArchiveDate] = useState<string | null>(null);
  // Emoji avatar picker open state (click the avatar → focus an input → ⌘⌃Space).
  const [emojiEditing, setEmojiEditing] = useState(false);

  useEffect(() => {
    if (isNew || !client) {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistory(null);
    loadIepHistory(client, student.id)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, student.id, isNew]);

  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const teacher = teacherById.get(draft.teacherId);
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(baseline);
  const liveAge = computedAge(draft);
  const flag = ageFlag(liveAge);
  const ageColor = ageColorOf(liveAge, flag);
  const goalCount = data.goals.filter((g) => g.studentId === draft.id && !g.archived).length;
  const iepDate = parseDate(draft.nextIepReview);
  const iepReviewOverdue = iepDate != null && iepDate.getTime() < startOfDay(new Date()).getTime();

  // New collision rule: same first + middle + last AND same teacher, comparing
  // against active (non-archived) students only. Archived students are out of
  // the collision pool by design.
  // Same-teacher name collisions are blocked at save time via validateStudent
  // (-> setError), consistent with the other editors. The cross-teacher case is
  // only an informational nudge (they never share a session), shown inline below.
  const draftKey = nameKey(draft);
  const samePool = data.students.filter((s) => !s.archived || s.id === draft.id);
  const crossTeacherDupe = samePool.find(
    (s) =>
      s.id !== draft.id &&
      s.teacherId !== draft.teacherId &&
      draftKey !== "" &&
      nameKey(s) === draftKey,
  );

  const set = (patch: Partial<Student>) => setDraft((d) => ({ ...d, ...patch }));
  const setField = (key: string, value: string | boolean | string[]) =>
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));

  async function handleSave() {
    const problem = validateStudent(data!.students, draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const next = isNew
      ? [...data!.students, draft]
      : data!.students.map((s) => (s.id === draft.id ? draft : s));
    try {
      await saveStudents(next);
      setBaseline(cloneStudent(draft));
      if (isNew) onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Apply archive/unarchive directly (independent of unsaved profile edits).
  // Archiving stamps the student's last day; unarchiving clears it so they're
  // cleanly active again.
  async function applyArchive(archived: boolean, lastDay: string | null) {
    setSaving(true);
    setError(null);
    try {
      const patch = { archived, lastDay };
      await saveStudents(
        data!.students.map((s) => (s.id === draft.id ? { ...s, ...patch } : s)),
      );
      setDraft((d) => ({ ...d, ...patch }));
      setBaseline((b) => ({ ...b, ...patch }));
      setArchiveDate(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setSaving(false);
    }
  }

  const headerName = fullName(draft).trim() || "New student";
  const departedNow = isDeparted(draft);

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← All students
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setEmojiEditing((v) => !v)}
              title="Click to set an emoji (⌘⌃Space), or clear for the initial"
              style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", borderRadius: "50%", display: "block" }}
            >
              <StudentAvatar student={draft} size={44} />
            </button>
            {emojiEditing && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 6,
                  zIndex: 30,
                  width: 260,
                  background: "var(--color-background-primary)",
                  border: "0.5px solid var(--color-border-secondary)",
                  borderRadius: "var(--border-radius-md)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
                  padding: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <input
                  autoFocus
                  className="input"
                  style={{ width: "100%", textAlign: "center", fontSize: 20 }}
                  value={draft.emoji}
                  onChange={(e) => set({ emoji: firstGrapheme(e.target.value) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "Escape") setEmojiEditing(false);
                  }}
                  onBlur={() => setEmojiEditing(false)}
                />
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", lineHeight: 1.4 }}>
                  Press ⌘⌃Space for the emoji picker. Delete to use the initial.
                </span>
              </div>
            )}
          </div>
          <div>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {headerName}
              {draft.archived && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    background: "var(--color-background-secondary)",
                    color: "var(--color-text-tertiary)",
                    borderRadius: "var(--border-radius-md)",
                  }}
                >
                  Archived
                </span>
              )}
              {departedNow && !draft.archived && (
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    background: "var(--color-background-warning)",
                    color: "var(--color-text-warning)",
                    borderRadius: "var(--border-radius-md)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  title={`Last day was ${draft.lastDay ?? ""}`}
                >
                  <Icon name="alert-circle" size={11} />
                  Past last day - archive when ready
                </span>
              )}
            </h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
              {teacher ? `${teacher.name}'s caseload` : "No teacher"} · {goalCount} goal
              {goalCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {!isNew && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button button--small" onClick={onViewGoals}>
              Goals & progress
              <Icon name="chevron-right" size={14} />
            </button>
            <button
              className="button button--small"
              onClick={() =>
                draft.archived
                  ? void applyArchive(false, null)
                  : setArchiveDate(draft.lastDay || toISODate(startOfDay(new Date())))
              }
              disabled={saving}
            >
              {draft.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        )}
      </div>

      {archiveDate !== null && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 14 }}>
            Archive <strong>{headerName}</strong> — last day:
          </span>
          <input
            className="input"
            type="date"
            style={{ width: 170 }}
            value={archiveDate}
            onChange={(e) => setArchiveDate(e.target.value)}
          />
          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            <button className="button button--small" onClick={() => setArchiveDate(null)} disabled={saving}>
              Cancel
            </button>
            <button
              className="button button--small button--primary"
              onClick={() => void applyArchive(true, archiveDate || null)}
              disabled={saving}
            >
              {saving ? "Archiving…" : "Archive"}
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Profile</h3>
        <div
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", gap: "14px 20px" }}
        >
          <EditField label="First name">
            <input
              className="input"
              value={draft.firstName}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </EditField>
          <EditField label="Middle / suffix">
            <input
              className="input"
              value={draft.middle}
              placeholder="R."
              onChange={(e) => set({ middle: e.target.value })}
            />
          </EditField>
          <EditField label="Last name">
            <input
              className="input"
              value={draft.lastName}
              onChange={(e) => set({ lastName: e.target.value })}
            />
          </EditField>
          <EditField label="Pronouns">
            <input
              className="input"
              value={draft.pronouns}
              placeholder="he/him"
              onChange={(e) => set({ pronouns: e.target.value })}
            />
          </EditField>
          <EditField label="Birthday">
            <input
              className="input"
              type="date"
              value={draft.birthday ?? ""}
              onChange={(e) => set({ birthday: e.target.value || null })}
            />
          </EditField>
          <EditField label="Age">
            <input
              className="input"
              value={liveAge ?? ""}
              readOnly
              style={{
                ...(ageColor ? { color: ageColor } : {}),
                background: "var(--color-background-secondary)",
                cursor: "not-allowed",
              }}
              placeholder={draft.birthday ? "" : "Set birthday"}
              title="Computed from birthday"
            />
          </EditField>
          <EditField label="Teacher">
            <select
              className="select"
              value={draft.teacherId}
              onChange={(e) => set({ teacherId: e.target.value })}
            >
              <option value="">— Unassigned —</option>
              {data.teachers
                .filter((t) => !t.archived || t.id === draft.teacherId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </EditField>
        </div>

        <Divider />
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px 0" }}>Enrollment</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
          <EditField label="First day">
            <input
              className="input"
              type="date"
              value={draft.firstDay ?? ""}
              onChange={(e) => set({ firstDay: e.target.value || null })}
            />
          </EditField>
          <EditField label="Last day">
            <input
              className="input"
              type="date"
              value={draft.lastDay ?? ""}
              onChange={(e) => set({ lastDay: e.target.value || null })}
            />
          </EditField>
          <EditField label="Mandate">
            <input
              className="input"
              value={draft.mandate ?? ""}
              placeholder="1:30:1"
              onChange={(e) =>
                set({ mandate: e.target.value === "" ? null : e.target.value })
              }
            />
          </EditField>
        </div>

        <Divider />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 12px 0" }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>IEP dates</h3>
          {!isNew && iepReviewOverdue && (
            <button className="button button--small" onClick={onReviewIep}>
              <Icon name="clipboard-check" size={14} /> Review now →
            </button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
          <EditField label="Next IEP review">
            <input
              className="input"
              type="date"
              value={draft.nextIepReview ?? ""}
              onChange={(e) => set({ nextIepReview: e.target.value || null })}
            />
          </EditField>
          <EditField label="Next triennial">
            <input
              className="input"
              type="date"
              value={draft.nextTriennial ?? ""}
              onChange={(e) => set({ nextTriennial: e.target.value || null })}
            />
          </EditField>
        </div>

        <Divider />
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px 0" }}>Supports</h3>
        {data.studentFields.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            No student fields defined. Add some in the Activities tab.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.studentFields.map((f) => (
              <StudentFieldInput
                key={f.key}
                field={f}
                value={draft.fields[f.key]}
                onChange={(v) => setField(f.key, v)}
              />
            ))}
          </div>
        )}

        <Divider />
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Session defaults</h3>
          {(draft.defaultPromptingLevel.length > 0 ||
            draft.defaultPromptingType.length > 0 ||
            draft.defaultRedirection.length > 0 ||
            draft.defaultResponse.length > 0) && (
            <button
              className="button button--small button--danger-text"
              onClick={() =>
                set({
                  defaultPromptingLevel: [],
                  defaultPromptingType: [],
                  defaultRedirection: [],
                  defaultResponse: [],
                })
              }
            >
              Clear all
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 12px 0" }}>
          Pre-fills each activity's prompting / redirection / response in Generate. Editable per
          session.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <DefaultMultiSelect
            label="Prompting level"
            options={PROMPTING_LEVELS}
            selected={draft.defaultPromptingLevel}
            onChange={(v) => set({ defaultPromptingLevel: v })}
          />
          <DefaultMultiSelect
            label="Prompting type"
            options={PROMPTING_TYPES}
            selected={draft.defaultPromptingType}
            onChange={(v) => set({ defaultPromptingType: v })}
          />
          <DefaultMultiSelect
            label="Redirection"
            options={REDIRECTION_LEVELS}
            selected={draft.defaultRedirection}
            onChange={(v) => set({ defaultRedirection: v })}
          />
          <DefaultMultiSelect
            label="Response"
            options={RESPONSE_TYPES}
            selected={draft.defaultResponse}
            onChange={(v) => set({ defaultResponse: v })}
          />
        </div>
      </div>

      {!isNew && (
        <div className="card">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <h3 className="card__title" style={{ margin: 0 }}>
              IEP history
            </h3>
            {history && history.length > 0 && (
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                {history.length} review{history.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {history === null ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Loading…</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              No IEP reviews recorded yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {history.map((review, i) => (
                <ReviewRow key={`${review.date}-${i}`} review={review} />
              ))}
            </div>
          )}
        </div>
      )}

      {crossTeacherDupe ? (
        <p style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-warning)" }}>
          Another student with the same name is on{" "}
          {teacherById.get(crossTeacherDupe.teacherId)?.name ?? "another"}'s caseload. They never
          share a session, but you may want to distinguish them.
        </p>
      ) : null}

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {(dirty || isNew) && (
        <SaveBar
          message={isNew ? "New student — not saved yet" : "Unsaved changes"}
          discardLabel={isNew ? "Cancel" : "Discard"}
          saveLabel={isNew ? "Create student" : "Save"}
          saving={saving}
          onDiscard={isNew ? onBack : () => setDraft(cloneStudent(baseline))}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

function ReviewRow({ review }: { review: IepReview }) {
  const date = parseDate(review.date);
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "12px 0",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}
    >
      <div style={{ flexShrink: 0, width: 96 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
          {date ? formatShort(date) : review.date}
        </p>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: review.note ? 6 : 0 }}>
          {review.nothingChanged ? (
            <Badge bg="var(--color-background-info)" color="var(--color-text-info)">
              <Icon name="check" size={11} /> Nothing changed
            </Badge>
          ) : (
            <>
              {review.added ? (
                <Badge bg="var(--color-background-success)" color="var(--color-text-success)">
                  + {review.added} goal{review.added === 1 ? "" : "s"}
                </Badge>
              ) : null}
              {review.retired ? (
                <Badge bg="var(--color-background-secondary)" color="var(--color-text-secondary)">
                  {review.retired} retired
                </Badge>
              ) : null}
              {review.kept ? (
                <Badge bg="var(--color-background-secondary)" color="var(--color-text-secondary)">
                  {review.kept} kept
                </Badge>
              ) : null}
            </>
          )}
        </div>
        {review.note && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
            {review.note}
          </p>
        )}
      </div>
    </div>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 7px",
        background: bg,
        color,
        borderRadius: "var(--border-radius-md)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {children}
    </span>
  );
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{ margin: "1.25rem 0", borderTop: "0.5px solid var(--color-border-tertiary)" }} />
  );
}

function countActiveGoals(goals: Goal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const goal of goals) {
    if (goal.archived) continue;
    counts.set(goal.studentId, (counts.get(goal.studentId) ?? 0) + 1);
  }
  return counts;
}

// A multi-select checkbox row for a session-default field (prompting, etc.).
function DefaultMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string, on: boolean) =>
    onChange(on ? [...selected, opt] : selected.filter((x) => x !== opt));
  return (
    <div>
      <label className="label">{label}</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13 }}>
        {options.map((opt) => (
          <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={(e) => toggle(opt, e.target.checked)}
            />
            {opt}
          </label>
        ))}
      </div>
    </div>
  );
}

// Renders one configurable student field: a toggle as a checkbox, a select as a
// multi-select checkbox group. A stored value not in the current options is
// still shown (marked) so it isn't silently dropped on the next save.
function StudentFieldInput({
  field,
  value,
  onChange,
}: {
  field: StudentField;
  value: string | boolean | string[] | undefined;
  onChange: (value: boolean | string[]) => void;
}) {
  if (field.type === "toggle") {
    return (
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  const selected = Array.isArray(value) ? value : [];
  const options = field.options ?? [];
  const all = [...options, ...selected.filter((v) => !options.includes(v))];
  const toggle = (opt: string, on: boolean) =>
    onChange(on ? [...selected, opt] : selected.filter((x) => x !== opt));
  return (
    <div>
      <label className="label">{field.label}</label>
      {all.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "4px 0 0 0" }}>
          No options defined.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 13 }}>
          {all.map((opt) => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => toggle(opt, e.target.checked)}
              />
              {opt}
              {options.includes(opt) ? "" : " (not in list)"}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function cloneStudent(s: Student): Student {
  // Deep-clone `fields` (incl. multi-select arrays) so draft edits don't mutate
  // the baseline, which would break the JSON.stringify dirty check.
  const fields: Record<string, string | boolean | string[]> = {};
  for (const [k, v] of Object.entries(s.fields)) fields[k] = Array.isArray(v) ? [...v] : v;
  return {
    ...s,
    fields,
    defaultPromptingLevel: [...s.defaultPromptingLevel],
    defaultPromptingType: [...s.defaultPromptingType],
    defaultRedirection: [...s.defaultRedirection],
    defaultResponse: [...s.defaultResponse],
  };
}

function blankStudent(existing: Student[]): Student {
  return {
    id: nextStudentId(existing),
    firstName: "",
    middle: "",
    lastName: "",
    pronouns: "",
    emoji: "",
    teacherId: "",
    birthday: null,
    age: null,
    nextIepReview: null,
    nextTriennial: null,
    mandate: null,
    firstDay: null,
    lastDay: null,
    archived: false,
    fields: {},
    defaultPromptingLevel: [],
    defaultPromptingType: [],
    defaultRedirection: [],
    defaultResponse: [],
  };
}

// Lower-cased "first|middle|last" key used to compare two students' identity.
function nameKey(s: Pick<Student, "firstName" | "middle" | "lastName">): string {
  const f = s.firstName.trim().toLowerCase();
  const m = s.middle.trim().toLowerCase();
  const l = s.lastName.trim().toLowerCase();
  if (f === "" && m === "" && l === "") return "";
  return `${f}|${m}|${l}`;
}

// Same-teacher first+middle+last collisions produce two identical labels in the
// all-notes paste target — block save until the middle/suffix differentiates
// them. Archived students are excluded from the pool by design.
function validateStudent(students: Student[], candidate: Student): string | null {
  if (candidate.firstName.trim() === "") return "First name can't be empty.";
  // No teacher check: a student may legitimately be unassigned (e.g. not yet
  // placed for the year). They simply won't appear under a teacher until set.
  // ISO date strings sort lexicographically, so a string compare is the order.
  if (candidate.firstDay && candidate.lastDay && candidate.firstDay > candidate.lastDay) {
    return "Last day can't be before first day.";
  }
  const key = nameKey(candidate);
  const dupe = students.some(
    (s) =>
      !s.archived &&
      s.id !== candidate.id &&
      s.teacherId === candidate.teacherId &&
      nameKey(s) === key,
  );
  if (dupe) {
    return "Another active student with the same first + last name is on this teacher's caseload. Add a middle initial or suffix to distinguish them.";
  }
  return null;
}

function ageColorOf(age: number | null, flag = ageFlag(age)): string | undefined {
  if (age == null) return undefined;
  if (flag === "alert") return "var(--color-text-danger)";
  if (flag === "warn") return "var(--color-text-warning)";
  return undefined;
}

function th(widthPct: number) {
  return {
    textAlign: "left" as const,
    padding: "10px 14px",
    fontWeight: 500,
    fontSize: 12,
    color: "var(--color-text-secondary)",
    width: `${widthPct}%`,
  };
}

function td(color?: string) {
  return { padding: "10px 14px", color };
}
