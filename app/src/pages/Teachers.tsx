import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import {
  COLOR_KEYS,
  TEACHER_COLORS,
  teacherColor,
  type Activity,
  type ColorKey,
  type Mode,
  type PerStudentField,
  type Role,
  type Teacher,
} from "../domain/teacher";
import { fullName } from "../domain/student";

interface Props {
  onNavigate: (page: NavPage) => void;
  // A teacher to open directly (deep-link from Today). Consumed once on arrival.
  openTeacherId: string | null;
  onOpenConsumed: () => void;
  // Jump to a student's page (from the caseload section).
  onOpenStudent: (studentId: string) => void;
}

const MODE_LABELS: Record<Mode, string> = { regular: "Regular", "filming-day": "Filming day" };

// Display labels for the developer-defined filming-day field components.
const FIELD_LABELS: Record<string, string> = {
  visualCues: "Visual cues",
  facialExpressions: "Facial expressions",
  decodingCarryover: "Decoding carryover",
  pragmatic: "Pragmatic skills",
  compliments: "Gave compliments",
  freeText: "Free-text description",
};
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;
const FIELD_KEYS = Object.keys(FIELD_LABELS);

type View = { kind: "list" } | { kind: "detail"; id: string } | { kind: "create"; teacher: Teacher };

export function Teachers({ onNavigate, openTeacherId, onOpenConsumed, onOpenStudent }: Props) {
  const { state } = useTerm();
  const [view, setView] = useState<View>({ kind: "list" });
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
  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const studentCount = new Map<string, number>();
  for (const s of data.students) {
    studentCount.set(s.teacherId, (studentCount.get(s.teacherId) ?? 0) + 1);
  }

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
            {data.teachers.length} teacher{data.teachers.length === 1 ? "" : "s"}
          </p>
        </div>
        <button className="button button--small" onClick={onAdd}>
          <Icon name="plus" size={14} />
          Add teacher
        </button>
      </div>

      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          overflow: "hidden",
        }}
      >
        {data.teachers.map((teacher, i) => {
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
                      background: "var(--color-background-secondary)",
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
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const color = teacherColor(draft.color);
  const caseload = data.students.filter((s) => s.teacherId === draft.id);
  const showFilming = draft.modes.includes("filming-day") || draft.roles.length > 0;
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(baseline);

  const set = (patch: Partial<Teacher>) => setDraft((d) => ({ ...d, ...patch }));
  const toggleMode = (mode: Mode, on: boolean) =>
    setDraft((d) => ({
      ...d,
      modes: on ? [...new Set([...d.modes, mode])] : d.modes.filter((m) => m !== mode),
    }));

  const addActivity = () =>
    setDraft((d) => ({ ...d, activities: [...d.activities, { id: crypto.randomUUID(), name: "" }] }));
  const updateActivity = (id: string, patch: Partial<Activity>) =>
    setDraft((d) => ({
      ...d,
      activities: d.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  const removeActivity = (id: string) =>
    setDraft((d) => ({ ...d, activities: d.activities.filter((a) => a.id !== id) }));

  const addRole = () =>
    setDraft((d) => ({
      ...d,
      roles: [...d.roles, { id: crypto.randomUUID(), name: "", phrase: "", fields: [] }],
    }));
  const updateRole = (id: string, patch: Partial<Role>) =>
    setDraft((d) => ({ ...d, roles: d.roles.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const removeRole = (id: string) =>
    setDraft((d) => ({ ...d, roles: d.roles.filter((r) => r.id !== id) }));
  const toggleRoleField = (id: string, fieldKey: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      roles: d.roles.map((r) =>
        r.id === id
          ? {
              ...r,
              fields: on
                ? [...new Set([...r.fields, fieldKey])]
                : r.fields.filter((f) => f !== fieldKey),
            }
          : r,
      ),
    }));

  const addField = () =>
    setDraft((d) => ({
      ...d,
      perStudentFields: [...d.perStudentFields, { key: "", label: "", type: "bool" }],
    }));
  const updateFieldLabel = (index: number, label: string) =>
    setDraft((d) => ({
      ...d,
      perStudentFields: d.perStudentFields.map((f, i) => (i === index ? { ...f, label } : f)),
    }));
  const removeField = (index: number) =>
    setDraft((d) => ({ ...d, perStudentFields: d.perStudentFields.filter((_, i) => i !== index) }));

  // Copy another teacher's activities/roles in (appended with fresh ids).
  const copyActivitiesFrom = (sourceId: string) => {
    const source = data!.teachers.find((t) => t.id === sourceId);
    if (!source) return;
    setDraft((d) => ({
      ...d,
      activities: [...d.activities, ...source.activities.map((a) => ({ ...a, id: crypto.randomUUID() }))],
    }));
  };
  const copyRolesFrom = (sourceId: string) => {
    const source = data!.teachers.find((t) => t.id === sourceId);
    if (!source) return;
    setDraft((d) => ({
      ...d,
      roles: [
        ...d.roles,
        ...source.roles.map((r) => ({ ...r, id: crypto.randomUUID(), fields: [...r.fields] })),
      ],
    }));
  };
  const teachersWithActivities = data.teachers.filter(
    (t) => t.id !== draft.id && t.activities.length > 0,
  );
  const teachersWithRoles = data.teachers.filter((t) => t.id !== draft.id && t.roles.length > 0);

  const dupActivityNames = duplicateNames(draft.activities.map((a) => a.name));
  const dupRoleNames = duplicateNames(draft.roles.map((r) => r.name));

  async function handleSave() {
    const problem = validateTeacherName(data!.teachers, draft);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    // Drop blank rows; derive keys for new per-student fields.
    const cleaned: Teacher = {
      ...draft,
      activities: draft.activities
        .map((a) => ({ ...a, name: a.name.trim() }))
        .filter((a) => a.name !== ""),
      roles: draft.roles
        .map((r) => ({ ...r, name: r.name.trim(), phrase: r.phrase.trim() }))
        .filter((r) => r.name !== ""),
      perStudentFields: finalizeFields(draft.perStudentFields),
    };
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

  async function handleRemove() {
    setSaving(true);
    setError(null);
    try {
      await saveTeachers(data!.teachers.filter((t) => t.id !== draft.id));
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
      setSaving(false);
    }
  }

  function onRemoveClick() {
    if (caseload.length > 0) {
      setError(
        `Reassign ${caseload.length} student${caseload.length === 1 ? "" : "s"} off ${
          draft.name || "this teacher"
        }'s caseload before removing.`,
      );
      return;
    }
    setConfirmingRemove(true);
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
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{draft.name.trim() || "New teacher"}</h1>
        {!isNew &&
          (confirmingRemove ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="button button--small"
                onClick={() => setConfirmingRemove(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="button button--small button--danger-text"
                onClick={handleRemove}
                disabled={saving}
              >
                Confirm remove
              </button>
            </div>
          ) : (
            <button className="button button--small button--danger-text" onClick={onRemoveClick}>
              Remove teacher
            </button>
          ))}
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
              checked={draft.modes.includes("filming-day")}
              onChange={(e) => toggleMode("filming-day", e.target.checked)}
            />
            Filming day
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <SectionHeader
          title="Regular mode · activities"
          onAdd={addActivity}
          addLabel="Add activity"
          extra={<CopyFromSelect teachers={teachersWithActivities} onCopy={copyActivitiesFrom} />}
        />
        {draft.activities.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No activities yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {draft.activities.map((activity) => (
              <div key={activity.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1, height: 32 }}
                    placeholder="Activity name"
                    value={activity.name}
                    onChange={(e) => updateActivity(activity.id, { name: e.target.value })}
                  />
                  <RemoveButton title="Remove activity" onClick={() => removeActivity(activity.id)} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!activity.hasSegmentName}
                      onChange={(e) => updateActivity(activity.id, { hasSegmentName: e.target.checked })}
                    />
                    Segment name
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!activity.freeText}
                      onChange={(e) => updateActivity(activity.id, { freeText: e.target.checked })}
                    />
                    Free text
                  </label>
                  {dupActivityNames.has(activity.name.trim().toLowerCase()) && <AlreadyUsed />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showFilming && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <SectionHeader
            title="Filming day · roles"
            onAdd={addRole}
            addLabel="Add role"
            extra={<CopyFromSelect teachers={teachersWithRoles} onCopy={copyRolesFrom} />}
          />
          {draft.roles.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No roles yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {draft.roles.map((role) => (
                <div
                  key={role.id}
                  style={{
                    border: "0.5px solid var(--color-border-tertiary)",
                    borderRadius: "var(--border-radius-md)",
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      className="input"
                      style={{ width: 160, height: 32 }}
                      placeholder="Role"
                      value={role.name}
                      onChange={(e) => updateRole(role.id, { name: e.target.value })}
                    />
                    <input
                      className="input"
                      style={{ flex: 1, height: 32 }}
                      placeholder={'Phrase (e.g. "the anchor")'}
                      value={role.phrase}
                      onChange={(e) => updateRole(role.id, { phrase: e.target.value })}
                    />
                    <RemoveButton title="Remove role" onClick={() => removeRole(role.id)} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12 }}>
                    {FIELD_KEYS.map((fk) => (
                      <label key={fk} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={role.fields.includes(fk)}
                          onChange={(e) => toggleRoleField(role.id, fk, e.target.checked)}
                        />
                        {fieldLabel(fk)}
                      </label>
                    ))}
                  </div>
                  {dupRoleNames.has(role.name.trim().toLowerCase()) && <AlreadyUsed />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <SectionHeader title="Per-student fields" onAdd={addField} addLabel="Add field" />
        {draft.perStudentFields.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            No per-student fields. Students under {draft.name || "this teacher"} only have the standard
            fields.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.perStudentFields.map((field, i) => (
              <div key={field.key || `new-${i}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 1, height: 32 }}
                  placeholder="Field label (e.g. Needs Bengali support)"
                  value={field.label}
                  onChange={(e) => updateFieldLabel(i, e.target.value)}
                />
                <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                  yes / no
                </span>
                <RemoveButton title="Remove field" onClick={() => removeField(i)} />
              </div>
            ))}
          </div>
        )}
      </div>

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
            {isNew ? "New teacher — not saved yet" : "Unsaved changes"}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="button button--small"
              onClick={isNew ? onBack : () => setDraft(cloneTeacher(baseline))}
              disabled={saving}
            >
              {isNew ? "Cancel" : "Discard"}
            </button>
            <button className="button button--small button--primary" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create teacher" : "Save"}
            </button>
          </div>
        </div>
      )}

      {colorOpen && (
        <ColorPicker
          current={draft.color}
          name={draft.name}
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

function ColorPicker({
  current,
  name,
  onPick,
  onClose,
}: {
  current: ColorKey;
  name: string;
  onPick: (color: ColorKey) => void;
  onClose: () => void;
}) {
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {COLOR_KEYS.map((key) => {
            const c = TEACHER_COLORS[key];
            const selected = key === current;
            return (
              <button
                key={key}
                title={c.label}
                onClick={() => onPick(key)}
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

function SectionHeader({
  title,
  onAdd,
  addLabel,
  extra,
}: {
  title: string;
  onAdd: () => void;
  addLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 12,
      }}
    >
      <h3 className="card__title" style={{ margin: 0 }}>
        {title}
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {extra}
        <button className="button button--ghost button--small" onClick={onAdd}>
          <Icon name="plus" size={14} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function RemoveButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      className="button button--ghost button--small"
      style={{ flexShrink: 0, padding: 6, color: "var(--color-text-tertiary)" }}
      title={title}
      onClick={onClick}
    >
      <Icon name="x" size={14} />
    </button>
  );
}

function AlreadyUsed() {
  return <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>already used</span>;
}

function CopyFromSelect({ teachers, onCopy }: { teachers: Teacher[]; onCopy: (id: string) => void }) {
  if (teachers.length === 0) return null;
  return (
    <select
      className="select"
      style={{ width: "auto", height: 30, fontSize: 13 }}
      value=""
      onChange={(e) => {
        if (e.target.value) onCopy(e.target.value);
      }}
    >
      <option value="">Copy from…</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

function cloneTeacher(t: Teacher): Teacher {
  return {
    ...t,
    modes: [...t.modes],
    activities: t.activities.map((a) => ({ ...a })),
    roles: t.roles.map((r) => ({ ...r, fields: [...r.fields] })),
    perStudentFields: t.perStudentFields.map((f) => ({ ...f })),
  };
}

function blankTeacher(): Teacher {
  return {
    id: `t_${crypto.randomUUID()}`,
    name: "",
    color: "purple",
    modes: ["regular"],
    activities: [],
    roles: [],
    perStudentFields: [],
  };
}

function validateTeacherName(teachers: Teacher[], candidate: Teacher): string | null {
  const name = candidate.name.trim();
  if (name === "") return "Name can't be empty.";
  const dupe = teachers.some(
    (t) => t.id !== candidate.id && t.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (dupe) return `Another teacher is named "${name}". Teacher names must be unique.`;
  return null;
}

// Lowercased names that appear more than once (for the "already used" hint).
function duplicateNames(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const n of names) {
    const key = n.trim().toLowerCase();
    if (key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, c]) => c > 1).map(([k]) => k));
}

// Drop label-less fields; derive a stable camelCase key for new ones (empty
// key) while preserving existing keys so student values stay mapped. Keys are
// de-duplicated.
function finalizeFields(fields: PerStudentField[]): PerStudentField[] {
  const used = new Set<string>();
  const result: PerStudentField[] = [];
  for (const field of fields) {
    const label = field.label.trim();
    if (label === "") continue;
    const base = field.key.trim() || camelKey(label);
    let key = base;
    let n = 2;
    while (used.has(key)) key = `${base}${n++}`;
    used.add(key);
    result.push({ key, label, type: "bool" });
  }
  return result;
}

function camelKey(label: string): string {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "field";
  return words[0] + words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}
