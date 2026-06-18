import { useEffect, useState, type ReactNode } from "react";
import { Nav, type NavPage } from "../components/Nav";
import { SaveBar } from "../components/SaveBar";
import { useTerm } from "../context/TermContext";
import {
  RESERVED_OTHER_ID,
  activityRefCounts,
  buildDescriptionTemplate,
  parseDescriptionTemplate,
} from "../domain/activity";
import { roleRefCounts } from "../domain/role";
import { isValidFieldKey, studentFieldRefCounts, type StudentField } from "../domain/studentField";
import { teacherColor, type Activity, type Role, type Teacher } from "../domain/teacher";
import { fullName, type Student } from "../domain/student";
import { StudentLink } from "../components/StudentLink";

interface Pill {
  label: string;
  bg: string;
  text: string;
}
interface UsedBy {
  pills: Pill[];
  emptyText: string;
}

interface Props {
  onNavigate: (page: NavPage) => void;
  // Opens a student's detail editor — used to set a multi-select field's value,
  // which can't be assigned inline from here.
  onOpenStudent: (id: string) => void;
}

// News field-component keys, with display labels, that a role can enable.
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

// Panel wrapping each catalog table so the three groups read as distinct blocks.
const SECTION_BOX = {
  border: "0.5px solid var(--color-border-tertiary)",
  borderRadius: "var(--border-radius-md)",
  background: "var(--color-background-secondary)",
  padding: 16,
  marginBottom: 18,
};

type View =
  | { kind: "list" }
  | { kind: "detail"; cat: "activity"; id: string }
  | { kind: "detail"; cat: "role"; id: string }
  | { kind: "detail"; cat: "field"; idx: number };

// The shared catalogs (activities, news roles, student fields). Teachers/
// students reference these; here Emily edits the catalogs. Each catalog is a
// compact table (name + who uses it); clicking a row opens its detail editor.
export function Activities({ onNavigate, onOpenStudent }: Props) {
  const { state, saveActivities, saveNewsRoles, saveStudentFields, saveTeachers, saveStudents } =
    useTerm();
  const [acts, setActs] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [actsBase, setActsBase] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [roles, setRoles] = useState<Role[]>(() =>
    state.status === "ready" ? state.data.newsRoles.map(cloneRole) : [],
  );
  const [rolesBase, setRolesBase] = useState<Role[]>(() =>
    state.status === "ready" ? state.data.newsRoles.map(cloneRole) : [],
  );
  const [sf, setSf] = useState<StudentField[]>(() =>
    state.status === "ready" ? state.data.studentFields.map(cloneField) : [],
  );
  const [sfBase, setSfBase] = useState<StudentField[]>(() =>
    state.status === "ready" ? state.data.studentFields.map(cloneField) : [],
  );
  // Teachers/students are edited here too — assigning who uses each catalog item
  // means flipping ids on their records. Saved alongside the catalogs.
  const [teachers, setTeachers] = useState<Teacher[]>(() =>
    state.status === "ready" ? state.data.teachers.map(cloneTeacher) : [],
  );
  const [teachersBase, setTeachersBase] = useState<Teacher[]>(() =>
    state.status === "ready" ? state.data.teachers.map(cloneTeacher) : [],
  );
  const [students, setStudents] = useState<Student[]>(() =>
    state.status === "ready" ? state.data.students.map(cloneStudent) : [],
  );
  const [studentsBase, setStudentsBase] = useState<Student[]>(() =>
    state.status === "ready" ? state.data.students.map(cloneStudent) : [],
  );
  const [view, setView] = useState<View>({ kind: "list" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on discard so a detail's MadlibEditor (which holds its own
  // before/after state) remounts and re-reads the reverted template.
  const [editNonce, setEditNonce] = useState(0);
  // Save validation is page-level (one save covers all three catalogs), so a
  // stale error would otherwise follow you onto unrelated detail views. Clear it
  // whenever you navigate; the next save attempt re-reports anything still wrong.
  useEffect(() => setError(null), [view]);

  if (state.status !== "ready") return null;
  const actRefs = activityRefCounts(teachers);
  const roleRefs = roleRefCounts(teachers);
  const sfRefs = studentFieldRefCounts(
    sf.map((f) => f.key),
    teachers,
    state.data.activities,
  );
  const sfBaseKeys = new Set(sfBase.map((f) => f.key));
  const actsDirty = JSON.stringify(acts) !== JSON.stringify(actsBase);
  const rolesDirty = JSON.stringify(roles) !== JSON.stringify(rolesBase);
  const sfDirty = JSON.stringify(sf) !== JSON.stringify(sfBase);
  const teachersDirty = JSON.stringify(teachers) !== JSON.stringify(teachersBase);
  const studentsDirty = JSON.stringify(students) !== JSON.stringify(studentsBase);
  const dirty = actsDirty || rolesDirty || sfDirty || teachersDirty || studentsDirty;
  const dupActNames = duplicateNames(acts.map((a) => a.name));
  const dupRoleNames = duplicateNames(roles.map((r) => r.name));
  // Active people, name-sorted — the assignable candidates in each detail's
  // "used by" editor.
  const activeTeachersByName = teachers
    .filter((t) => !t.archived)
    .sort((x, y) => x.name.localeCompare(y.name));
  const activeStudentsByName = students
    .filter((s) => !s.archived)
    .sort((x, y) => fullName(x).localeCompare(fullName(y)));

  const updateAct = (id: string, patch: Partial<Activity>) =>
    setActs((d) => d.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addAct = () => {
    const id = `act_${crypto.randomUUID()}`;
    setActs((d) => {
      const i = d.findIndex((a) => a.id === RESERVED_OTHER_ID);
      const act = { id, name: "" };
      return i === -1 ? [...d, act] : [...d.slice(0, i), act, ...d.slice(i)];
    });
    setView({ kind: "detail", cat: "activity", id });
  };
  // Reorder activities (catalog order drives the Generate dropdown). "Other"
  // stays pinned at the bottom and isn't movable.
  const moveActivity = (id: string, dir: -1 | 1) =>
    setActs((d) => {
      const i = d.findIndex((a) => a.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.length || d[j]!.id === RESERVED_OTHER_ID) return d;
      const next = d.slice();
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const removeAct = (id: string): boolean => {
    const a = acts.find((x) => x.id === id);
    if (!confirmDelete("activity", a?.name ?? "", actRefs.get(id) ?? 0, "teacher")) return false;
    setActs((d) => d.filter((x) => x.id !== id));
    return true;
  };

  const updateRole = (id: string, patch: Partial<Role>) =>
    setRoles((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRole = () => {
    const id = `role_${crypto.randomUUID()}`;
    setRoles((d) => [...d, { id, name: "", phrase: "", fields: [] }]);
    setView({ kind: "detail", cat: "role", id });
  };
  const removeRole = (id: string): boolean => {
    const r = roles.find((x) => x.id === id);
    if (!confirmDelete("news role", r?.name ?? "", roleRefs.get(id) ?? 0, "teacher")) return false;
    setRoles((d) => d.filter((x) => x.id !== id));
    return true;
  };
  const toggleRoleField = (id: string, fk: string, on: boolean) =>
    setRoles((d) =>
      d.map((r) =>
        r.id === id
          ? { ...r, fields: on ? [...new Set([...r.fields, fk])] : r.fields.filter((f) => f !== fk) }
          : r,
      ),
    );

  const updateField = (i: number, patch: Partial<StudentField>) =>
    setSf((d) => d.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const addField = () => {
    setSf((d) => [...d, { key: "", label: "", type: "toggle" }]);
    setView({ kind: "detail", cat: "field", idx: sf.length });
  };
  const removeField = (i: number, key: string): boolean => {
    const label = sf[i]?.label || key;
    if (!confirmDelete("student field", label, sfRefs.get(key) ?? 0, "reference")) return false;
    setSf((d) => d.filter((_, j) => j !== i));
    return true;
  };

  // Membership: assigning who uses a catalog item edits the *people's* records.
  const toggleActivityTeacher = (activityId: string, teacherId: string, on: boolean) =>
    setTeachers((ts) =>
      ts.map((t) =>
        t.id === teacherId
          ? {
              ...t,
              activityIds: on
                ? [...new Set([...t.activityIds, activityId])]
                : t.activityIds.filter((id) => id !== activityId),
            }
          : t,
      ),
    );
  const toggleRoleTeacher = (roleId: string, teacherId: string, on: boolean) =>
    setTeachers((ts) =>
      ts.map((t) =>
        t.id === teacherId
          ? {
              ...t,
              newsRoleIds: on
                ? [...new Set([...t.newsRoleIds, roleId])]
                : t.newsRoleIds.filter((id) => id !== roleId),
            }
          : t,
      ),
    );
  // For toggle fields, set the boolean directly; for select fields, only removal
  // (value → []) happens here — adding a value opens the student (no inline UI).
  const setStudentFieldValue = (
    key: string,
    studentId: string,
    value: boolean | string[],
  ) =>
    setStudents((ss) =>
      ss.map((s) => (s.id === studentId ? { ...s, fields: { ...s.fields, [key]: value } } : s)),
    );

  async function handleSave() {
    setError(null);
    const cleanedActs = acts.map((a) => {
      const name = a.name.trim();
      if (!a.perStudentOptions) return { ...a, name };
      const pso = a.perStudentOptions;
      return {
        ...a,
        name,
        perStudentOptions: {
          label: pso.label.trim(),
          options: pso.options.map((o) => o.trim()).filter(Boolean),
          template: pso.template.trim(),
        },
      };
    });
    const cleanedRoles = roles.map((r) => ({ ...r, name: r.name.trim(), phrase: r.phrase.trim() }));
    const cleanedFields: StudentField[] = sf.map((f) => {
      const label = f.label.trim();
      // Derive the key from the label when left blank, so typing only a label
      // is enough to save a new field.
      const key = f.key.trim() || slugKey(label);
      return {
        key,
        label,
        type: f.type,
        ...(f.type === "select"
          ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) }
          : {}),
      };
    });
    // Block the save on any unnamed item rather than silently dropping it.
    if (cleanedActs.some((a) => a.name === "")) {
      setError("Every activity needs a name.");
      return;
    }
    // Per-student options, when enabled, need a label and at least one option;
    // a non-empty wording template must reference both tokens (bare or filtered,
    // e.g. `{options | join: "; "}`) or the chosen options / additional info
    // silently won't appear in the note.
    for (const a of cleanedActs) {
      const pso = a.perStudentOptions;
      if (!pso) continue;
      if (pso.label === "") {
        setError(`"${a.name}" per-student options: a label is required.`);
        return;
      }
      if (pso.options.length === 0) {
        setError(`"${a.name}" per-student options: add at least one option.`);
        return;
      }
      // The template is what folds the selection into the note; without it the
      // checklist renders but never affects the wording (a silent no-op).
      if (pso.template === "") {
        setError(`"${a.name}" per-student options: add the note wording.`);
        return;
      }
      if (!/\{\s*options\b/.test(pso.template) || !/\{\s*info\b/.test(pso.template)) {
        setError(
          `"${a.name}" per-student options: the note wording must include both {options} and {info}.`,
        );
        return;
      }
    }
    if (cleanedRoles.some((r) => r.name === "")) {
      setError("Every news role needs a name.");
      return;
    }
    if (cleanedFields.some((f) => f.label === "")) {
      setError("Every student field needs a name.");
      return;
    }
    // A dropdown field with no options renders no choices on the Students page —
    // a dead field. Mirrors the per-student-options rule above.
    const emptySelect = cleanedFields.find((f) => f.type === "select" && (f.options ?? []).length === 0);
    if (emptySelect) {
      setError(`Dropdown field "${emptySelect.label}" needs at least one option.`);
      return;
    }
    for (const f of cleanedFields) {
      if (!isValidFieldKey(f.key)) {
        setError(
          `Rename "${f.label}" — its auto-generated key "${f.key}" matches a built-in field name.`,
        );
        return;
      }
    }
    const keys = cleanedFields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      setError("Two student fields generate the same key — give them more distinct names.");
      return;
    }
    setSaving(true);
    try {
      if (actsDirty) await saveActivities(cleanedActs);
      if (rolesDirty) await saveNewsRoles(cleanedRoles);
      if (sfDirty) await saveStudentFields(cleanedFields);
      if (teachersDirty) await saveTeachers(teachers);
      if (studentsDirty) await saveStudents(students);
      setActs(cleanedActs.map(cloneActivity));
      setActsBase(cleanedActs.map(cloneActivity));
      setRoles(cleanedRoles.map(cloneRole));
      setRolesBase(cleanedRoles.map(cloneRole));
      setSf(cleanedFields.map(cloneField));
      setSfBase(cleanedFields.map(cloneField));
      setTeachersBase(teachers.map(cloneTeacher));
      setStudentsBase(students.map(cloneStudent));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setActs(actsBase.map(cloneActivity));
    setRoles(rolesBase.map(cloneRole));
    setSf(sfBase.map(cloneField));
    setTeachers(teachersBase.map(cloneTeacher));
    setStudents(studentsBase.map(cloneStudent));
    setEditNonce((n) => n + 1);
  }

  // "Used by" pills per catalog item: teachers color-coded, students neutral.
  const teacherPills = (ts: Teacher[]): Pill[] =>
    ts.map((t) => {
      const c = teacherColor(t.color);
      return { label: t.name, bg: c.bg, text: c.text };
    });
  const activityUsers = (a: Activity): UsedBy => {
    if (a.id === RESERVED_OTHER_ID) return { pills: [], emptyText: "Always available" };
    return {
      pills: teacherPills(teachers.filter((t) => t.activityIds.includes(a.id))),
      emptyText: "Unused",
    };
  };
  const roleUsers = (r: Role): UsedBy => ({
    pills: teacherPills(teachers.filter((t) => t.newsRoleIds.includes(r.id))),
    emptyText: "Unused",
  });
  const fieldUsers = (f: StudentField): UsedBy => {
    if (!f.key) return { pills: [], emptyText: "Unused" };
    const pills = students
      .filter((s) => !s.archived && hasFieldValue(s.fields[f.key]))
      .map((s) => ({
        label: s.firstName || s.id,
        bg: "var(--color-background-pill)",
        text: "var(--color-text-secondary)",
      }));
    return { pills, emptyText: "Unused" };
  };

  const backBar = (
    <button
      className="button button--ghost button--small"
      onClick={() => setView({ kind: "list" })}
      style={{ padding: 0, color: "var(--color-text-secondary)", marginBottom: 14 }}
    >
      ← Activity catalog
    </button>
  );

  let body: ReactNode;
  if (view.kind === "list") {
    body = (
      <>
        <div style={{ marginBottom: "1rem" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Catalogs</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <CountJump targetId="catalog-activities" label={countLabel(acts.length, "activity", "activities")} />
            <CountJump targetId="catalog-roles" label={countLabel(roles.length, "news role", "news roles")} />
            <CountJump targetId="catalog-fields" label={countLabel(sf.length, "student field", "student fields")} />
          </div>
        </div>
        <CatalogTable
          id="catalog-activities"
          title="Activities"
          addLabel="Add activity"
          onAdd={addAct}
          usedHeader="Used by teachers"
          onMove={moveActivity}
          rows={[
            ...acts
              .filter((a) => a.id !== RESERVED_OTHER_ID)
              .map((a) => ({
                id: a.id,
                name: a.name,
                ...activityUsers(a),
                onClick: () => setView({ kind: "detail", cat: "activity", id: a.id }),
              })),
            ...acts
              .filter((a) => a.id === RESERVED_OTHER_ID)
              .map((a) => ({
                id: a.id,
                name: a.name,
                ...activityUsers(a),
                pinned: true,
                bg: "var(--color-background-tertiary)",
                onClick: () => setView({ kind: "detail", cat: "activity", id: a.id }),
              })),
          ]}
        />
        <CatalogTable
          id="catalog-roles"
          title="News roles"
          addLabel="Add role"
          onAdd={addRole}
          usedHeader="Used by teachers"
          rows={[
            ...roles
              .filter((r) => r.name !== "Other")
              .map((r) => ({
                id: r.id,
                name: r.name,
                ...roleUsers(r),
                onClick: () => setView({ kind: "detail", cat: "role", id: r.id }),
              }))
              .sort((x, y) => x.name.localeCompare(y.name)),
            ...roles
              .filter((r) => r.name === "Other")
              .map((r) => ({
                id: r.id,
                name: r.name,
                ...roleUsers(r),
                pinned: true,
                bg: "var(--color-background-tertiary)",
                onClick: () => setView({ kind: "detail", cat: "role", id: r.id }),
              })),
          ]}
        />
        <CatalogTable
          id="catalog-fields"
          title="Student fields"
          addLabel="Add field"
          onAdd={addField}
          usedHeader="Set for students"
          rows={sf
            .map((f, i) => ({
              id: `field-${i}`,
              name: f.label || f.key,
              ...fieldUsers(f),
              onClick: () => setView({ kind: "detail", cat: "field", idx: i }),
            }))
            .sort((x, y) => x.name.localeCompare(y.name))}
        />
      </>
    );
  } else if (view.cat === "activity") {
    const a = acts.find((x) => x.id === view.id);
    body = (
      <>
        {backBar}
        {a ? (
          <ActivityDetail
            activity={a}
            fields={sf}
            editNonce={editNonce}
            dup={a.name.trim() !== "" && dupActNames.has(a.name.trim().toLowerCase())}
            members={
              a.id === RESERVED_OTHER_ID ? null : (
                <MembersPicker
                  title="Teachers using this activity"
                  addLabel="+ Add a teacher…"
                  candidates={activeTeachersByName.map((t) => {
                    const c = teacherColor(t.color);
                    return {
                      id: t.id,
                      name: t.name,
                      member: t.activityIds.includes(a.id),
                      bg: c.bg,
                      text: c.text,
                    };
                  })}
                  onAdd={(tid) => toggleActivityTeacher(a.id, tid, true)}
                  onRemove={(tid) => toggleActivityTeacher(a.id, tid, false)}
                />
              )
            }
            onChange={(patch) => updateAct(a.id, patch)}
            onDelete={() => {
              if (removeAct(a.id)) setView({ kind: "list" });
            }}
          />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Not found.</p>
        )}
      </>
    );
  } else if (view.cat === "role") {
    const r = roles.find((x) => x.id === view.id);
    body = (
      <>
        {backBar}
        {r ? (
          <RoleDetail
            role={r}
            dup={r.name.trim() !== "" && dupRoleNames.has(r.name.trim().toLowerCase())}
            members={
              <MembersPicker
                title="Teachers using this role"
                addLabel="+ Add a teacher…"
                candidates={activeTeachersByName.map((t) => {
                  const c = teacherColor(t.color);
                  return {
                    id: t.id,
                    name: t.name,
                    member: t.newsRoleIds.includes(r.id),
                    bg: c.bg,
                    text: c.text,
                  };
                })}
                onAdd={(tid) => toggleRoleTeacher(r.id, tid, true)}
                onRemove={(tid) => toggleRoleTeacher(r.id, tid, false)}
              />
            }
            onChange={(patch) => updateRole(r.id, patch)}
            onToggleField={(fk, on) => toggleRoleField(r.id, fk, on)}
            onDelete={() => {
              if (removeRole(r.id)) setView({ kind: "list" });
            }}
          />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Not found.</p>
        )}
      </>
    );
  } else {
    const f = sf[view.idx];
    const idx = view.idx;
    body = (
      <>
        {backBar}
        {f ? (
          <StudentFieldDetail
            field={f}
            keyEditable={!sfBaseKeys.has(f.key)}
            members={
              !f.key ? (
                <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                  Name this field and save it to assign students.
                </p>
              ) : f.type === "toggle" ? (
                <MembersPicker
                  title="Students with this on"
                  addLabel="+ Add a student…"
                  candidates={activeStudentsByName.map((s) => ({
                    id: s.id,
                    name: fullName(s),
                    member: s.fields[f.key] === true,
                  }))}
                  onAdd={(sid) => setStudentFieldValue(f.key, sid, true)}
                  onRemove={(sid) => setStudentFieldValue(f.key, sid, false)}
                  onOpen={onOpenStudent}
                />
              ) : (
                <MembersPicker
                  title="Students with this field set"
                  addLabel="+ Add a student…"
                  candidates={activeStudentsByName.map((s) => ({
                    id: s.id,
                    name: fullName(s),
                    member: hasFieldValue(s.fields[f.key]),
                  }))}
                  onAdd={(sid) => onOpenStudent(sid)}
                  onRemove={(sid) => setStudentFieldValue(f.key, sid, [])}
                  onOpen={onOpenStudent}
                />
              )
            }
            onChange={(patch) => updateField(idx, patch)}
            onDelete={() => {
              if (removeField(idx, f.key)) setView({ kind: "list" });
            }}
          />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Not found.</p>
        )}
      </>
    );
  }

  return (
    <div className="shell">
      <Nav current="activities" onNavigate={onNavigate} />
      {body}

      {/* Validation/save errors show in the SaveBar while editing; this covers the
          rare not-dirty case where the bar isn't mounted. */}
      {error && !dirty && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 12 }}>
          {error}
        </p>
      )}

      {dirty && (
        <SaveBar
          message="Unsaved changes"
          problem={error}
          saving={saving}
          onDiscard={discard}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List table
// ---------------------------------------------------------------------------

interface CatalogRow {
  id: string;
  name: string;
  pills: Pill[];
  emptyText: string;
  pinned?: boolean;
  bg?: string;
  onClick: () => void;
}

function ReorderBtn({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        border: "none",
        background: "transparent",
        cursor: disabled ? "default" : "pointer",
        color: "var(--color-text-secondary)",
        opacity: disabled ? 0.25 : 1,
        padding: "0 3px",
        fontSize: 13,
      }}
    >
      {label}
    </button>
  );
}

// A count in the page subheader ("11 activities") rendered as a pill button that
// scrolls to its catalog section when clicked.
function CountJump({ targetId, label }: { targetId: string; label: string }) {
  return (
    <button
      type="button"
      className="button button--small"
      onClick={() =>
        document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      style={{ borderRadius: 999 }}
    >
      {label}
    </button>
  );
}

function CatalogTable({
  title,
  addLabel,
  onAdd,
  usedHeader,
  rows,
  onMove,
  id,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  usedHeader: string;
  rows: CatalogRow[];
  onMove?: (id: string, dir: -1 | 1) => void;
  id?: string;
}) {
  // Movable rows come first; pinned rows (e.g. "Other") sit at the bottom.
  const movableCount = rows.filter((r) => !r.pinned).length;
  return (
    <section id={id} style={SECTION_BOX}>
      <SectionHeader title={title} onAdd={onAdd} addLabel={addLabel} />
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>None yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              {onMove && <th style={{ width: 1 }} />}
              <th style={{ padding: "2px 8px", width: "100%", fontWeight: 400 }}>Name</th>
              <th style={{ padding: "2px 8px", fontWeight: 400, whiteSpace: "nowrap" }}>
                {usedHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                onClick={r.onClick}
                style={{
                  cursor: "pointer",
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  background: r.bg,
                }}
              >
                {onMove && (
                  <td
                    style={{ padding: "0 2px 0 6px", whiteSpace: "nowrap" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!r.pinned && (
                      <span style={{ display: "inline-flex" }}>
                        <ReorderBtn label="↑" disabled={i === 0} onClick={() => onMove(r.id, -1)} />
                        <ReorderBtn
                          label="↓"
                          disabled={i === movableCount - 1}
                          onClick={() => onMove(r.id, 1)}
                        />
                      </span>
                    )}
                  </td>
                )}
                <td style={{ padding: "8px", fontWeight: 500 }}>
                  {r.name || <span style={{ color: "var(--color-text-tertiary)" }}>(unnamed)</span>}
                </td>
                <td style={{ padding: "8px", verticalAlign: "top" }}>
                  {r.pills.length === 0 ? (
                    <span style={{ color: "var(--color-text-tertiary)" }}>{r.emptyText}</span>
                  ) : (
                    // Fixed width so the pills form a horizontal row that wraps within
                    // the column, rather than being starved to one-per-line by the
                    // greedy 100%-width Name column beside them.
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 4, width: 300 }}>
                      {r.pills.map((p, i) => (
                        <span
                          key={i}
                          style={{
                            background: p.bg,
                            color: p.text,
                            borderRadius: 10,
                            padding: "1px 9px",
                            fontSize: 12,
                          }}
                        >
                          {p.label}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detail editors
// ---------------------------------------------------------------------------

function ActivityDetail({
  activity,
  fields,
  editNonce,
  dup,
  members,
  onChange,
  onDelete,
}: {
  activity: Activity;
  fields: StudentField[];
  editNonce: number;
  dup: boolean;
  members?: ReactNode;
  onChange: (patch: Partial<Activity>) => void;
  onDelete: () => void;
}) {
  const reserved = activity.id === RESERVED_OTHER_ID;
  // Custom description is temporarily hidden; keep its inputs wired (see the
  // commented MadlibEditor block below) so re-enabling is a one-line revert.
  void fields;
  void editNonce;
  void MadlibEditor;
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label className="label">Activity name</label>
        <input
          className="input"
          value={activity.name}
          disabled={reserved}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {dup && (
          <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>duplicate name</span>
        )}
      </div>
      {reserved ? (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
          Built-in ad-hoc activity. When picked in Generate, whatever is typed becomes the note
          wording for that session.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <Check
              label="Segment-name field (per session)"
              checked={!!activity.requiresSegmentName}
              onChange={(v) => onChange({ requiresSegmentName: v })}
            />
            <Check
              label="Additional-info field (per session)"
              checked={!!activity.freeText}
              onChange={(v) => onChange({ freeText: v })}
            />
            <Check
              label="Per-student options"
              checked={!!activity.perStudentOptions}
              onChange={(v) =>
                onChange({
                  perStudentOptions: v ? { label: "", options: [], template: "" } : undefined,
                })
              }
            />
          </div>
          {activity.perStudentOptions && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                paddingLeft: 12,
                borderLeft: "2px solid var(--color-border-tertiary)",
              }}
            >
              <div>
                <label className="label">Options label (shown on each student's card)</label>
                <input
                  className="input"
                  placeholder="e.g. Pragmatic skills used"
                  value={activity.perStudentOptions.label}
                  onChange={(e) =>
                    onChange({
                      perStudentOptions: { ...activity.perStudentOptions!, label: e.target.value },
                    })
                  }
                />
              </div>
              <OptionsEditor
                options={activity.perStudentOptions.options}
                onChange={(options) =>
                  onChange({ perStudentOptions: { ...activity.perStudentOptions!, options } })
                }
              />
              <div>
                <label className="label">
                  Note wording — use {"{options}"} for the chosen list option, {"{info}"} for additional info
                </label>
                <input
                  className="input"
                  placeholder="e.g. Displayed appropriate pragmatic language skills by {options} while {info}"
                  value={activity.perStudentOptions.template}
                  onChange={(e) =>
                    onChange({
                      perStudentOptions: { ...activity.perStudentOptions!, template: e.target.value },
                    })
                  }
                />
                <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "4px 0 0 0" }}>
                  When a student selects nothing, the activity's default description is used instead.
                </p>
              </div>
            </div>
          )}
          {/* Custom description — temporarily hidden (commented out per request)
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px 0" }}>Custom description</h4>
            <MadlibEditor
              key={`madlib-${activity.id}-${editNonce}`}
              activity={activity}
              fields={fields}
              onChange={onChange}
            />
          </div>
          */}
          {members}
          <div>
            <DeleteButton onClick={onDelete} />
          </div>
        </>
      )}
    </div>
  );
}

function RoleDetail({
  role,
  dup,
  members,
  onChange,
  onToggleField,
  onDelete,
}: {
  role: Role;
  dup: boolean;
  members?: ReactNode;
  onChange: (patch: Partial<Role>) => void;
  onToggleField: (fk: string, on: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Role name</label>
          <input
            className="input"
            value={role.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {dup && (
            <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>duplicate name</span>
          )}
        </div>
        <div>
          <label className="label">Phrase</label>
          <input
            className="input"
            placeholder={'e.g. "the anchor"'}
            value={role.phrase}
            onChange={(e) => onChange({ phrase: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label">Field components</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13 }}>
          {FIELD_KEYS.map((fk) => (
            <Check
              key={fk}
              label={fieldLabel(fk)}
              checked={role.fields.includes(fk)}
              onChange={(v) => onToggleField(fk, v)}
            />
          ))}
        </div>
      </div>
      {members}
      <div>
        <DeleteButton onClick={onDelete} />
      </div>
    </div>
  );
}

function StudentFieldDetail({
  field,
  keyEditable,
  members,
  onChange,
  onDelete,
}: {
  field: StudentField;
  keyEditable: boolean;
  members?: ReactNode;
  onChange: (patch: Partial<StudentField>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label className="label">Label (shown on the Students page)</label>
          <input
            className="input"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </div>
        <div>
          {/* The key is auto-derived from the label for new fields and fixed once
              saved (it's the CSV header and {student.key} reference). */}
          <label className="label">Key {keyEditable ? "(auto-generated)" : "(fixed)"}</label>
          <div
            className="input"
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              display: "flex",
              alignItems: "center",
            }}
          >
            {keyEditable ? slugKey(field.label) || "set a label →" : field.key}
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 200 }}>
        <label className="label">Type</label>
        <select
          className="select"
          value={field.type}
          onChange={(e) => {
            const type = e.target.value === "select" ? "select" : "toggle";
            onChange(
              type === "select" ? { type, options: field.options ?? [] } : { type, options: undefined },
            );
          }}
        >
          <option value="toggle">Toggle (yes / no)</option>
          <option value="select">Dropdown (pick values)</option>
        </select>
      </div>
      {field.type === "select" && (
        <OptionsEditor options={field.options ?? []} onChange={(options) => onChange({ options })} />
      )}
      {members}
      <div>
        <DeleteButton onClick={onDelete} />
      </div>
    </div>
  );
}

// Assign/unassign who uses a catalog item: current members show as removable
// pills, and an "add" dropdown lists everyone not yet assigned. `onAdd` either
// toggles membership directly (teachers, toggle fields) or opens the person to
// set a value (multi-select fields). `onOpen` makes a member pill's name a link.
function MembersPicker({
  title,
  addLabel,
  candidates,
  onAdd,
  onRemove,
  onOpen,
}: {
  title: string;
  addLabel: string;
  candidates: { id: string; name: string; member: boolean; bg?: string; text?: string }[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const members = candidates.filter((c) => c.member);
  const nonMembers = candidates.filter((c) => !c.member);
  return (
    <div>
      <label className="label">{title}</label>
      {members.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 8px 0" }}>
          {members.map((m) => (
            <span
              key={m.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: m.bg ?? "var(--color-background-pill)",
                color: m.text ?? "var(--color-text-secondary)",
                padding: "2px 6px 2px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {onOpen ? (
                <StudentLink id={m.id} onOpen={(id) => onOpen(id)} style={{ color: "inherit" }}>
                  {m.name}
                </StudentLink>
              ) : (
                <span>{m.name}</span>
              )}
              <button
                onClick={() => onRemove(m.id)}
                title="Remove"
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.65, padding: 0, lineHeight: 1, fontSize: 14 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "0 0 8px 0" }}>
          No one yet.
        </p>
      )}
      <select
        className="select"
        style={{ maxWidth: 240 }}
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
        }}
      >
        <option value="">{addLabel}</option>
        {nonMembers.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small shared bits
// ---------------------------------------------------------------------------

function SectionHeader({
  title,
  onAdd,
  addLabel,
}: {
  title: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 10,
      }}
    >
      <h3 className="card__title" style={{ margin: 0 }}>
        {title}
      </h3>
      <button className="button button--small" onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="button button--small button--danger-text" onClick={onClick}>
      Delete
    </button>
  );
}

// Friendly editor for an activity's description rewrite. Holds its own
// before/after/attribute state (initialized from the stored template) so typing
// is smooth, and writes the reconstructed `descriptionTemplate` +
// `requiresAttribute` up to the parent on every change.
function MadlibEditor({
  activity,
  fields,
  onChange,
}: {
  activity: Activity;
  fields: StudentField[];
  onChange: (patch: { descriptionTemplate?: string; requiresAttribute?: string }) => void;
}) {
  const init = parseDescriptionTemplate(activity);
  const [attr, setAttr] = useState(init.attr);
  const [before, setBefore] = useState(init.before);
  const [after, setAfter] = useState(init.after);

  const apply = (a: string, b: string, c: string) => onChange(buildDescriptionTemplate(a, b, c));
  const selectFields = fields.filter((f) => f.type === "select");
  const chosen = selectFields.find((f) => f.key === attr);
  const sample = chosen?.options?.[0] ?? chosen?.label ?? attr;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
        Use this when you want this activity worded the same way in every note it appears in. Pick a
        student field to swap in a per-student word (e.g. journal method → “traced” / “wrote”),
        or leave it on “Same for all students” for identical wording every time.
      </p>
      <div>
        <label className="label">Student field</label>
        <select
          className="select"
          value={attr}
          onChange={(e) => {
            setAttr(e.target.value);
            apply(e.target.value, before, after);
          }}
        >
          <option value="">— Same for all students —</option>
          {selectFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {attr === "" ? (
        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={2}
            placeholder="Full sentence used in the note for this activity."
            value={before}
            onChange={(e) => {
              setBefore(e.target.value);
              apply("", e.target.value, "");
            }}
          />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label className="label">Before</label>
              <input
                className="input"
                placeholder="e.g. Used a"
                value={before}
                onChange={(e) => {
                  setBefore(e.target.value);
                  apply(attr, e.target.value, after);
                }}
              />
            </div>
            <div>
              <label className="label">After</label>
              <input
                className="input"
                placeholder="e.g. to request and comment"
                value={after}
                onChange={(e) => {
                  setAfter(e.target.value);
                  apply(attr, before, e.target.value);
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: "var(--color-text-tertiary)" }}>Preview: </span>
            {before.trim() && <>{before.trim()} </>}
            <span
              style={{ background: "var(--color-background-secondary)", borderRadius: 4, padding: "0 5px" }}
              title="Varies per student"
            >
              {sample}
            </span>
            {after.trim() && <> {after.trim()}</>}
            <span style={{ color: "var(--color-text-tertiary)" }}> (varies per student)</span>
          </div>
        </>
      )}
    </div>
  );
}

// Editable string list for a select field's options.
function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="label">Options (can select multiple)</label>
      {options.map((opt, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            className="input"
            style={{ flex: 1, height: 30 }}
            placeholder="Option"
            value={opt}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)))}
          />
          <button
            className="button button--small button--danger-text"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="button button--small"
        style={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...options, ""])}
      >
        Add option
      </button>
    </div>
  );
}

function confirmDelete(kind: string, name: string, used: number, noun: string): boolean {
  const usage =
    used > 0 ? ` It's used by ${used} ${noun}${used === 1 ? "" : "s"} — existing data is kept.` : "";
  return window.confirm(`Confirm delete: ${kind} “${name || "(unnamed)"}”.${usage}`);
}

function countLabel(n: number, singular: string, plural: string): string {
  if (n === 0) return `No ${plural}`;
  return `${n} ${n === 1 ? singular : plural}`;
}

// Derive a safe camelCase field key from a label (e.g. "AAC device" → "aacDevice").
function slugKey(label: string): string {
  const words = label.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "";
  let key = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
  if (!/^[A-Za-z]/.test(key)) key = `f${key}`;
  return key;
}

function hasFieldValue(v: string | boolean | string[] | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  return Boolean(v);
}

function cloneActivity(a: Activity): Activity {
  return { ...a };
}

function cloneRole(r: Role): Role {
  return { ...r, fields: [...r.fields] };
}

function cloneField(f: StudentField): StudentField {
  return { ...f, ...(f.options ? { options: [...f.options] } : {}) };
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

function cloneStudent(s: Student): Student {
  return { ...s, fields: { ...s.fields } };
}

function duplicateNames(names: string[]): Set<string> {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (!k) continue;
    if (seen.has(k)) dups.add(k);
    else seen.add(k);
  }
  return dups;
}
