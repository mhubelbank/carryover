import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { SaveBar } from "../components/SaveBar";
import { useTerm } from "../context/TermContext";
import {
  COLOR_KEYS,
  TEACHER_COLORS,
  teacherColor,
  type ColorKey,
  type Mode,
  type Teacher,
} from "../domain/teacher";
import { RESERVED_OTHER_ID } from "../domain/activity";
import { fullName } from "../domain/student";

interface Props {
  onNavigate: (page: NavPage) => void;
  // A teacher to open directly (deep-link from Today). Consumed once on arrival.
  openTeacherId: string | null;
  onOpenConsumed: () => void;
  // Jump to a student's page (from the caseload section).
  onOpenStudent: (studentId: string) => void;
}

const MODE_LABELS: Record<Mode, string> = { regular: "Regular", "news-day": "News day" };

type View = { kind: "list" } | { kind: "detail"; id: string } | { kind: "create"; teacher: Teacher };

export function Teachers({ onNavigate, openTeacherId, onOpenConsumed, onOpenStudent }: Props) {
  const { state } = useTerm();
  const [view, setView] = useState<View>({ kind: "list" });
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view.kind, "id" in view ? view.id : ""]);
  useEffect(() => {
    if (openTeacherId) {
      setView({ kind: "detail", id: openTeacherId });
      onOpenConsumed();
    }
  }, [openTeacherId, onOpenConsumed]);
  if (state.status !== "ready") return null;
  const teachers = state.data.teachers;

  if (view.kind === "create") {
    return (
      <TeacherDetail
        key="new"
        teacher={view.teacher}
        isNew
        onBack={() => setView({ kind: "list" })}
        onNavigate={onNavigate}
        onOpenStudent={onOpenStudent}
      />
    );
  }
  if (view.kind === "detail") {
    const teacher = teachers.find((t) => t.id === view.id);
    if (teacher) {
      return (
        <TeacherDetail
          key={teacher.id}
          teacher={teacher}
          isNew={false}
          onBack={() => setView({ kind: "list" })}
          onNavigate={onNavigate}
          onOpenStudent={onOpenStudent}
        />
      );
    }
    // Teacher was removed — fall through to the list.
  }
  return (
    <TeacherList
      onNavigate={onNavigate}
      onOpen={(id) => setView({ kind: "detail", id })}
      onAdd={() => setView({ kind: "create", teacher: blankTeacher() })}
    />
  );
}

function TeacherList({
  onNavigate,
  onOpen,
  onAdd,
}: {
  onNavigate: (page: NavPage) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { state } = useTerm();
  const [archivedView, setArchivedView] = useState(false);
  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const studentCount = new Map<string, number>();
  for (const s of data.students) {
    studentCount.set(s.teacherId, (studentCount.get(s.teacherId) ?? 0) + 1);
  }
  const pool = data.teachers.filter((t) => t.archived === archivedView);

  return (
    <div className="shell">
      <Nav current="teachers" onNavigate={onNavigate} />
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
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Teachers</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {pool.length} {archivedView ? "archived" : "active"} teacher{pool.length === 1 ? "" : "s"}
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
              Add teacher
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          overflow: "hidden",
          background: "var(--color-background-secondary)",
        }}
      >
        {pool.map((teacher, i) => {
          const color = teacherColor(teacher.color);
          const count = studentCount.get(teacher.id) ?? 0;
          return (
            <button
              key={teacher.id}
              onClick={() => onOpen(teacher.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                background: "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : "0.5px solid var(--color-border-tertiary)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: color.bg }} />
                <span style={{ fontSize: 14 }}>{teacher.name}</span>
                {teacher.modes.map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: 11,
                      padding: "1px 7px",
                      borderRadius: "var(--border-radius-md)",
                      background: "var(--color-background-pill)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {MODE_LABELS[m]}
                  </span>
                ))}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {count} student{count === 1 ? "" : "s"}
                </span>
                <span style={{ color: "var(--color-text-tertiary)", lineHeight: 0 }}>
                  <Icon name="chevron-right" size={14} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeacherDetail({
  teacher,
  isNew,
  onBack,
  onNavigate,
  onOpenStudent,
}: {
  teacher: Teacher;
  isNew: boolean;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
  onOpenStudent: (studentId: string) => void;
}) {
  const { state, saveTeachers } = useTerm();
  const [draft, setDraft] = useState<Teacher>(() => cloneTeacher(teacher));
  const [baseline, setBaseline] = useState<Teacher>(() => cloneTeacher(teacher));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);

  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const color = teacherColor(draft.color);
  const caseload = data.students.filter((s) => s.teacherId === draft.id);
  const showNews = draft.modes.includes("news-day") || draft.newsRoleIds.length > 0;
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(baseline);

  const set = (patch: Partial<Teacher>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleMode = (mode: Mode, on: boolean) =>
    setDraft((d) => ({
      ...d,
      modes: on ? [...new Set([...d.modes, mode])] : d.modes.filter((m) => m !== mode),
    }));

  // Activities are a shared catalog (managed in the Activities tab); a teacher
  // just selects which ones it uses.
  const toggleActivity = (id: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      activityIds: on
        ? [...new Set([...d.activityIds, id])]
        : d.activityIds.filter((x) => x !== id),
    }));

  // News roles are a shared catalog (managed in the Activities tab); a teacher
  // just selects which ones it uses.
  const toggleRole = (id: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      newsRoleIds: on
        ? [...new Set([...d.newsRoleIds, id])]
        : d.newsRoleIds.filter((x) => x !== id),
    }));
  // Catalog activities offered for selection (the reserved ad-hoc "Other" is
  // always available in Generate, so it isn't listed per-teacher).
  const selectableActivities = data.activities.filter((a) => a.id !== RESERVED_OTHER_ID);
  const selectableRoles = data.newsRoles;

  async function handleSave() {
    const problem = validateTeacherName(data!.teachers, draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const cleaned: Teacher = { ...draft };
    const next = isNew
      ? [...data!.teachers, cleaned]
      : data!.teachers.map((t) => (t.id === cleaned.id ? cleaned : t));
    try {
      await saveTeachers(next);
      setDraft(cloneTeacher(cleaned));
      setBaseline(cloneTeacher(cleaned));
      if (isNew) onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    setSaving(true);
    setError(null);
    try {
      const next = data!.teachers.map((t) =>
        t.id === draft.id ? { ...t, archived: !t.archived } : t,
      );
      await saveTeachers(next);
      setDraft((d) => ({ ...d, archived: !d.archived }));
      setBaseline((b) => ({ ...b, archived: !b.archived }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <Nav current="teachers" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← Teachers
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          {draft.name.trim() || "New teacher"}
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
        </h1>
        {!isNew && (
          <button
            className="button button--small"
            onClick={handleArchiveToggle}
            disabled={saving}
          >
            {draft.archived ? "Unarchive" : "Archive"}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Basics</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 16 }}>
          <EditField label="Name">
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </EditField>
          <EditField label="Color in schedule">
            <button
              type="button"
              onClick={() => setColorOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px",
                border: "0.5px solid var(--color-border-secondary)",
                borderRadius: "var(--border-radius-md)",
                background: "var(--color-background-primary)",
                cursor: "pointer",
                font: "inherit",
                fontSize: 14,
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, background: color.bg }} />
              {color.label}
            </button>
          </EditField>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>Session modes</p>
        <div style={{ display: "flex", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.modes.includes("regular")}
              onChange={(e) => toggleMode("regular", e.target.checked)}
            />
            Regular
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={draft.modes.includes("news-day")}
              onChange={(e) => toggleMode("news-day", e.target.checked)}
            />
            News day
          </label>
        </div>
      </div>

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
            Regular mode · activities
          </h3>
          <button className="button button--small" onClick={() => onNavigate("activities")}>
            Manage catalog
          </button>
        </div>
        {selectableActivities.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            No activities in the catalog yet. Add some in the Activities tab.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
            {selectableActivities.map((a) => (
              <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={draft.activityIds.includes(a.id)}
                  onChange={(e) => toggleActivity(a.id, e.target.checked)}
                />
                {a.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {showNews && (
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
              News day · roles
            </h3>
            <button className="button button--small" onClick={() => onNavigate("activities")}>
              Manage catalog
            </button>
          </div>
          {selectableRoles.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
              No news roles in the catalog yet. Add some in the Activities tab.
            </p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13 }}>
              {selectableRoles.map((r) => (
                <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.newsRoleIds.includes(r.id)}
                    onChange={(e) => toggleRole(r.id, e.target.checked)}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
            Caseload
          </h3>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {caseload.length} student{caseload.length === 1 ? "" : "s"}
          </span>
        </div>
        {caseload.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No students assigned.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {caseload.map((s) => (
              <button
                key={s.id}
                onClick={() => onOpenStudent(s.id)}
                title={`Open ${fullName(s)}`}
                style={{
                  fontSize: 13,
                  fontFamily: "inherit",
                  padding: "4px 10px",
                  background: color.bg,
                  color: color.text,
                  border: "none",
                  cursor: "pointer",
                  borderRadius: "var(--border-radius-md)",
                }}
              >
                {fullName(s)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {(dirty || isNew) && (
        <SaveBar
          message={isNew ? "New teacher — not saved yet" : "Unsaved changes"}
          discardLabel={isNew ? "Cancel" : "Discard"}
          saveLabel={isNew ? "Create teacher" : "Save"}
          saving={saving}
          onDiscard={isNew ? onBack : () => setDraft(cloneTeacher(baseline))}
          onSave={handleSave}
        />
      )}

      {colorOpen && (
        <ColorPicker
          current={draft.color}
          name={draft.name}
          others={data.teachers
            .filter((t) => !t.archived && t.id !== draft.id)
            .map((t) => ({ name: t.name, color: t.color }))}
          onPick={(c) => {
            set({ color: c });
            setColorOpen(false);
          }}
          onClose={() => setColorOpen(false)}
        />
      )}
    </div>
  );
}

function TeacherPill({ name, color, highlight }: { name: string; color: ColorKey; highlight?: boolean }) {
  const c = TEACHER_COLORS[color];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: "nowrap",
        outline: highlight ? "2px solid var(--color-border-info)" : undefined,
        outlineOffset: 1,
      }}
    >
      {name}
    </span>
  );
}

export function ColorPicker({
  current,
  name,
  others,
  onPick,
  onClose,
}: {
  current: ColorKey;
  name: string;
  others: { name: string; color: ColorKey }[];
  onPick: (color: ColorKey) => void;
  onClose: () => void;
}) {
  // Hovering a swatch previews this teacher's pill in that color, live, next to
  // the others — so she can pick something that reads as distinct.
  const [preview, setPreview] = useState<ColorKey | null>(null);
  const liveColor = preview ?? current;
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
      <div className="card" style={{ width: 420, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 className="card__title" style={{ margin: 0 }}>
            Color for {name.trim() || "teacher"}
          </h3>
          <button
            className="button button--ghost button--small"
            onClick={onClose}
            style={{ padding: 4, color: "var(--color-text-tertiary)" }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {others.map((t, i) => (
              <TeacherPill key={i} name={t.name.trim() || "Teacher"} color={t.color} />
            ))}
            <TeacherPill name={name.trim() || "This teacher"} color={liveColor} highlight />
          </div>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}
          onMouseLeave={() => setPreview(null)}
        >
          {COLOR_KEYS.map((key) => {
            const c = TEACHER_COLORS[key];
            const selected = key === current;
            return (
              <button
                key={key}
                title={c.label}
                onClick={() => onPick(key)}
                onMouseEnter={() => setPreview(key)}
                style={{
                  width: "100%",
                  aspectRatio: "1",
                  borderRadius: "var(--border-radius-md)",
                  background: c.bg,
                  border: selected
                    ? "2px solid var(--color-border-info)"
                    : "0.5px solid var(--color-border-tertiary)",
                  cursor: "pointer",
                  position: "relative",
                  padding: 0,
                }}
              >
                {selected && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: c.text,
                    }}
                  >
                    <Icon name="check" size={16} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
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

function cloneTeacher(t: Teacher): Teacher {
  return {
    ...t,
    modes: [...t.modes],
    activityIds: [...t.activityIds],
    newsRoleIds: [...t.newsRoleIds],
    sessionCaptures: (t.sessionCaptures ?? []).map((c) => ({ ...c })),
  };
}

function blankTeacher(): Teacher {
  return {
    id: `t_${crypto.randomUUID()}`,
    name: "",
    color: "purple",
    modes: ["regular"],
    activityIds: [],
    newsRoleIds: [],
    sessionCaptures: [],
    archived: false,
  };
}

function validateTeacherName(teachers: Teacher[], candidate: Teacher): string | null {
  const name = candidate.name.trim();
  if (name === "") return "Name can't be empty.";
  if (candidate.modes.length === 0) {
    return "Pick at least one session mode (regular or news-day).";
  }
  // Archived teachers stay in the file with their original name; the uniqueness
  // check only enforces against active teachers so she can reuse a retired
  // teacher's name without a fight.
  const dupe = teachers.some(
    (t) =>
      !t.archived &&
      t.id !== candidate.id &&
      t.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (dupe) return `Another teacher is named "${name}". Teacher names must be unique.`;
  return null;
}

