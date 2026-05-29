import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { loadIepHistory } from "../domain/data";
import { formatShort, parseDate } from "../domain/dates";
import type { Goal } from "../domain/goal";
import type { IepReview } from "../domain/iep";
import { ageFlag, type Student } from "../domain/student";
import { StudentGoals } from "./Goals";

interface Props {
  onNavigate: (page: NavPage) => void;
  // A student to open directly (deep-link from Today) and which view to land on.
  // Consumed once on arrival.
  target: { id: string; view: "detail" | "goals" } | null;
  onTargetConsumed: () => void;
}

type View =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "goals"; id: string }
  | { kind: "create"; student: Student };

export function Students({ onNavigate, target, onTargetConsumed }: Props) {
  const { state } = useTerm();
  const [view, setView] = useState<View>({ kind: "list" });
  useEffect(() => {
    if (target) {
      setView(
        target.view === "goals"
          ? { kind: "goals", id: target.id }
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
        onBack={() => setView({ kind: "list" })}
        onViewGoals={() => {}}
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
          onBack={() => setView({ kind: "list" })}
          onViewGoals={() => setView({ kind: "goals", id: student.id })}
          onNavigate={onNavigate}
        />
      );
    }
    // Student was removed — fall through to the list.
  }
  if (view.kind === "goals") {
    return (
      <StudentGoals
        studentId={view.id}
        onBack={() => setView({ kind: "detail", id: view.id })}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <StudentsList
      onNavigate={onNavigate}
      onOpen={(id) => setView({ kind: "detail", id })}
      onAdd={() => setView({ kind: "create", student: blankStudent() })}
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
  const { state, teacherById } = useTerm();
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");

  const data = state.status === "ready" ? state.data : null;
  const goalCount = useMemo(
    () => (data ? countActiveGoals(data.goals) : new Map<string, number>()),
    [data],
  );
  if (!data) return null;

  const q = query.trim().toLowerCase();
  const filtered = data.students
    .filter((s) => (teacherFilter === "all" ? true : s.teacherId === teacherFilter))
    .filter((s) => (q === "" ? true : s.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

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
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Students</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {data.students.length} student{data.students.length === 1 ? "" : "s"} across{" "}
            {data.teachers.length} teacher{data.teachers.length === 1 ? "" : "s"}
          </p>
        </div>
        <button className="button button--small" onClick={onAdd}>
          <Icon name="plus" size={14} />
          Add student
        </button>
      </div>

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
          {data.teachers.map((t) => (
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
        }}
      >
        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              <th style={th(24)}>Name</th>
              <th style={th(14)}>Teacher</th>
              <th style={th(12)}>Pronouns</th>
              <th style={th(24)}>AAC device</th>
              <th style={th(9)}>Goals</th>
              <th style={th(12)}>Next IEP</th>
              <th style={{ width: "5%" }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const iep = parseDate(s.nextIepReview);
              const count = goalCount.get(s.id) ?? 0;
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  style={{ borderTop: "0.5px solid var(--color-border-tertiary)", cursor: "pointer" }}
                >
                  <td style={td()}>{s.name}</td>
                  <td style={td("var(--color-text-secondary)")}>
                    {teacherById.get(s.teacherId)?.name ?? "—"}
                  </td>
                  <td style={td("var(--color-text-secondary)")}>{s.pronouns || "—"}</td>
                  <td style={{ ...td("var(--color-text-secondary)"), fontSize: 13 }}>
                    {s.aacDevice ?? "—"}
                  </td>
                  <td
                    style={{
                      ...td(count === 0 ? "var(--color-text-warning)" : "var(--color-text-secondary)"),
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
            ? "No students match"
            : `Showing ${filtered.length} of ${data.students.length}`}
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
  onNavigate,
}: {
  student: Student;
  isNew: boolean;
  onBack: () => void;
  onViewGoals: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, client, saveStudents } = useTerm();
  const [draft, setDraft] = useState<Student>(() => cloneStudent(student));
  const [baseline, setBaseline] = useState<Student>(() => cloneStudent(student));
  const [history, setHistory] = useState<IepReview[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

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
  const flag = ageFlag(draft.age);
  const ageColor =
    flag === "alert"
      ? "var(--color-text-danger)"
      : flag === "warn"
        ? "var(--color-text-warning)"
        : undefined;
  const goalCount = data.goals.filter((g) => g.studentId === draft.id && !g.archived).length;

  const trimmedName = draft.name.trim().toLowerCase();
  const sameTeacherDupe =
    trimmedName !== "" &&
    data.students.some(
      (s) =>
        s.id !== draft.id &&
        s.teacherId === draft.teacherId &&
        s.name.trim().toLowerCase() === trimmedName,
    );
  const crossTeacherDupe = data.students.find(
    (s) =>
      s.id !== draft.id &&
      s.teacherId !== draft.teacherId &&
      s.name.trim() !== "" &&
      s.name.trim().toLowerCase() === trimmedName,
  );

  const set = (patch: Partial<Student>) => setDraft((d) => ({ ...d, ...patch }));
  const setBoolField = (key: string, on: boolean) =>
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: on ? "true" : "false" } }));

  async function handleSave() {
    const problem = validateStudentName(data!.students, draft);
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

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      await saveStudents(data!.students.filter((s) => s.id !== draft.id));
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setSaving(false);
    }
  }

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
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--color-background-info)",
              color: "var(--color-text-info)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 500,
              fontSize: 15,
            }}
          >
            {draft.name.trim().charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>
              {draft.name.trim() || "New student"}
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
              View goals
              <Icon name="chevron-right" size={14} />
            </button>
            {confirmingRemove ? (
              <>
                <button
                  className="button button--small"
                  onClick={() => setConfirmingRemove(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button className="button button--small button--danger-text" onClick={handleRemove} disabled={saving}>
                  Confirm remove
                </button>
              </>
            ) : (
              <button
                className="button button--small button--danger-text"
                onClick={() => setConfirmingRemove(true)}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Profile</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
          <EditField label="Name">
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </EditField>
          <EditField label="Pronouns">
            <input
              className="input"
              value={draft.pronouns}
              placeholder="he/him"
              onChange={(e) => set({ pronouns: e.target.value })}
            />
          </EditField>
          <EditField label="Age">
            <input
              className="input"
              type="number"
              value={draft.age ?? ""}
              style={ageColor ? { color: ageColor } : undefined}
              onChange={(e) => set({ age: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </EditField>
          <EditField label="Teacher">
            <select
              className="select"
              value={draft.teacherId}
              onChange={(e) => set({ teacherId: e.target.value })}
            >
              <option value="">— Unassigned —</option>
              {data.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </EditField>
          <div style={{ gridColumn: "span 2" }}>
            <EditField label="AAC device">
              <input
                className="input"
                value={draft.aacDevice ?? ""}
                onChange={(e) => set({ aacDevice: e.target.value === "" ? null : e.target.value })}
              />
            </EditField>
          </div>
        </div>

        <Divider />
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px 0" }}>IEP dates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
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
          <EditField label="Mandate">
            <input
              className="input"
              value={draft.mandate ?? ""}
              placeholder="1:30:1"
              onChange={(e) => set({ mandate: e.target.value === "" ? null : e.target.value })}
            />
          </EditField>
        </div>

        {teacher && teacher.perStudentFields.length > 0 && (
          <>
            <Divider />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Teacher-specific fields</h3>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                (from {teacher.name}'s setup)
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {teacher.perStudentFields.map((field) => (
                <label
                  key={field.key}
                  style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}
                >
                  <input
                    type="checkbox"
                    checked={isTruthy(draft.fields[field.key])}
                    onChange={(e) => setBoolField(field.key, e.target.checked)}
                  />
                  {field.label}
                </label>
              ))}
            </div>
          </>
        )}
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

      {sameTeacherDupe ? (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          Another student named "{draft.name.trim()}" is already on this teacher's caseload. Add a
          distinguisher (e.g. "{draft.name.trim()} R.") so notes don't get mixed up.
        </p>
      ) : crossTeacherDupe ? (
        <p style={{ marginTop: 14, fontSize: 12, color: "var(--color-text-warning)" }}>
          Another student named "{draft.name.trim()}" is on{" "}
          {teacherById.get(crossTeacherDupe.teacherId)?.name ?? "another"}'s caseload. They never share a
          session, but you may want to distinguish them.
        </p>
      ) : null}

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {(dirty || isNew) && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "12px 16px",
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
            {isNew ? "New student — not saved yet" : "Unsaved changes"}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="button button--small"
              onClick={isNew ? onBack : () => setDraft(cloneStudent(baseline))}
              disabled={saving}
            >
              {isNew ? "Cancel" : "Discard"}
            </button>
            <button
              className="button button--small button--primary"
              onClick={handleSave}
              disabled={saving || sameTeacherDupe}
            >
              {saving ? "Saving…" : isNew ? "Create student" : "Save"}
            </button>
          </div>
        </div>
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
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{review.note}</p>
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

function isTruthy(value: string | undefined): boolean {
  const t = (value ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

function countActiveGoals(goals: Goal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const goal of goals) {
    if (goal.archived) continue;
    counts.set(goal.studentId, (counts.get(goal.studentId) ?? 0) + 1);
  }
  return counts;
}

function cloneStudent(s: Student): Student {
  return { ...s, fields: { ...s.fields } };
}

function blankStudent(): Student {
  return {
    id: `s_${crypto.randomUUID()}`,
    name: "",
    pronouns: "",
    teacherId: "",
    age: null,
    aacDevice: null,
    nextIepReview: null,
    nextTriennial: null,
    mandate: null,
    fields: {},
  };
}

// Same-teacher duplicate names produce two identical blocks in the all-notes
// paste target, risking a wrong note in a legally-binding record — so block
// and require a distinguisher. Cross-teacher dupes are only soft-warned (above).
function validateStudentName(students: Student[], candidate: Student): string | null {
  const name = candidate.name.trim();
  if (name === "") return "Name can't be empty.";
  const dupeSameTeacher = students.some(
    (s) =>
      s.id !== candidate.id &&
      s.teacherId === candidate.teacherId &&
      s.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (dupeSameTeacher) {
    return `Another student named "${name}" is on this teacher's caseload. Add a distinguisher (e.g. "${name} R.") so notes don't get mixed up.`;
  }
  return null;
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
