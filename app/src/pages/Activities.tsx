import { useState, type ReactNode } from "react";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import {
  RESERVED_OTHER_ID,
  activityRefCounts,
  buildDescriptionTemplate,
  parseDescriptionTemplate,
} from "../domain/activity";
import { roleRefCounts } from "../domain/role";
import { isValidFieldKey, studentFieldRefCounts, type StudentField } from "../domain/studentField";
import type { Activity, Role } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
}

// Filming field-component keys, with display labels, that a role can enable.
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

// The shared catalogs (activities, filming roles, student fields). Teachers/
// students reference these; here Emily edits the catalogs. Each catalog is a
// compact table (name + who uses it); clicking a row opens its detail editor.
export function Activities({ onNavigate }: Props) {
  const { state, saveActivities, saveFilmingRoles, saveStudentFields } = useTerm();
  const [acts, setActs] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [actsBase, setActsBase] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [roles, setRoles] = useState<Role[]>(() =>
    state.status === "ready" ? state.data.filmingRoles.map(cloneRole) : [],
  );
  const [rolesBase, setRolesBase] = useState<Role[]>(() =>
    state.status === "ready" ? state.data.filmingRoles.map(cloneRole) : [],
  );
  const [sf, setSf] = useState<StudentField[]>(() =>
    state.status === "ready" ? state.data.studentFields.map(cloneField) : [],
  );
  const [sfBase, setSfBase] = useState<StudentField[]>(() =>
    state.status === "ready" ? state.data.studentFields.map(cloneField) : [],
  );
  const [view, setView] = useState<View>({ kind: "list" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on discard so a detail's MadlibEditor (which holds its own
  // before/after state) remounts and re-reads the reverted template.
  const [editNonce, setEditNonce] = useState(0);

  if (state.status !== "ready") return null;
  const { teachers, students } = state.data;
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
  const dirty = actsDirty || rolesDirty || sfDirty;
  const dupActNames = duplicateNames(acts.map((a) => a.name));
  const dupRoleNames = duplicateNames(roles.map((r) => r.name));

  const updateAct = (id: string, patch: Partial<Activity>) =>
    setActs((d) => d.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addAct = () => {
    const id = `act_${crypto.randomUUID()}`;
    setActs((d) => [...d, { id, name: "" }]);
    setView({ kind: "detail", cat: "activity", id });
  };
  const removeAct = (id: string): boolean => {
    if (!confirmDelete(actRefs.get(id) ?? 0)) return false;
    setActs((d) => d.filter((a) => a.id !== id));
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
    if (!confirmDelete(roleRefs.get(id) ?? 0)) return false;
    setRoles((d) => d.filter((r) => r.id !== id));
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
    if (!confirmDelete(sfRefs.get(key) ?? 0, "reference")) return false;
    setSf((d) => d.filter((_, j) => j !== i));
    return true;
  };

  async function handleSave() {
    setError(null);
    const cleanedActs = acts.map((a) => ({ ...a, name: a.name.trim() })).filter((a) => a.name !== "");
    const cleanedRoles = roles
      .map((r) => ({ ...r, name: r.name.trim(), phrase: r.phrase.trim() }))
      .filter((r) => r.name !== "");
    const cleanedFields: StudentField[] = sf
      .map((f) => ({
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        ...(f.type === "select"
          ? { options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) }
          : {}),
      }))
      .filter((f) => f.key !== "");
    for (const f of cleanedFields) {
      if (!isValidFieldKey(f.key)) {
        setError(
          `Invalid field key "${f.key}". Use letters, numbers, and underscore (no spaces/dots), not a reserved name.`,
        );
        return;
      }
    }
    const keys = cleanedFields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) {
      setError("Two student fields share a key — keys must be unique.");
      return;
    }
    setSaving(true);
    try {
      if (actsDirty) await saveActivities(cleanedActs);
      if (rolesDirty) await saveFilmingRoles(cleanedRoles);
      if (sfDirty) await saveStudentFields(cleanedFields);
      setActs(cleanedActs.map(cloneActivity));
      setActsBase(cleanedActs.map(cloneActivity));
      setRoles(cleanedRoles.map(cloneRole));
      setRolesBase(cleanedRoles.map(cloneRole));
      setSf(cleanedFields.map(cloneField));
      setSfBase(cleanedFields.map(cloneField));
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
    setEditNonce((n) => n + 1);
  }

  // "Used by" text per catalog item.
  const activityUsers = (a: Activity): { text: string; muted: boolean } => {
    if (a.id === RESERVED_OTHER_ID) return { text: "Always available (ad-hoc)", muted: true };
    const names = teachers.filter((t) => t.activityIds.includes(a.id)).map((t) => t.name);
    return names.length ? { text: names.join(", "), muted: false } : { text: "Unused", muted: true };
  };
  const roleUsers = (r: Role): { text: string; muted: boolean } => {
    const names = teachers.filter((t) => t.filmingRoleIds.includes(r.id)).map((t) => t.name);
    return names.length ? { text: names.join(", "), muted: false } : { text: "Unused", muted: true };
  };
  const fieldUsers = (f: StudentField): { text: string; muted: boolean } => {
    if (!f.key) return { text: "Unused", muted: true };
    const names = students
      .filter((s) => !s.archived && hasFieldValue(s.fields[f.key]))
      .map((s) => s.firstName || s.id);
    return names.length ? { text: names.join(", "), muted: false } : { text: "Unused", muted: true };
  };

  const backBar = (
    <button
      className="button button--ghost button--small"
      onClick={() => setView({ kind: "list" })}
      style={{ padding: 0, color: "var(--color-text-secondary)", marginBottom: 14 }}
    >
      ← Back to catalogs
    </button>
  );

  let body: ReactNode;
  if (view.kind === "list") {
    body = (
      <>
        <div style={{ marginBottom: "1rem" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Activities</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {countLabel(acts.length, "activity", "activities")} ·{" "}
            {countLabel(roles.length, "filming role", "filming roles")} ·{" "}
            {countLabel(sf.length, "student field", "student fields")}
          </p>
        </div>
        <CatalogTable
          title="Activities"
          addLabel="Add activity"
          onAdd={addAct}
          usedHeader="Used by teachers"
          rows={acts.map((a) => ({
            id: a.id,
            name: a.name,
            ...activityUsers(a),
            onClick: () => setView({ kind: "detail", cat: "activity", id: a.id }),
          }))}
        />
        <CatalogTable
          title="Filming roles"
          addLabel="Add role"
          onAdd={addRole}
          usedHeader="Used by teachers"
          rows={roles.map((r) => ({
            id: r.id,
            name: r.name,
            ...roleUsers(r),
            onClick: () => setView({ kind: "detail", cat: "role", id: r.id }),
          }))}
        />
        <CatalogTable
          title="Student fields"
          addLabel="Add field"
          onAdd={addField}
          usedHeader="Set for students"
          rows={sf.map((f, i) => ({
            id: `field-${i}`,
            name: f.label || f.key,
            ...fieldUsers(f),
            onClick: () => setView({ kind: "detail", cat: "field", idx: i }),
          }))}
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
            used={actRefs.get(a.id) ?? 0}
            dup={a.name.trim() !== "" && dupActNames.has(a.name.trim().toLowerCase())}
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
            used={roleRefs.get(r.id) ?? 0}
            dup={r.name.trim() !== "" && dupRoleNames.has(r.name.trim().toLowerCase())}
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
            used={sfRefs.get(f.key) ?? 0}
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

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 12 }}>
          {error}
        </p>
      )}

      {dirty && (
        <div
          style={{
            position: "sticky",
            bottom: 16,
            marginTop: 16,
            padding: "10px 14px",
            background: "var(--color-background-secondary)",
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
            Unsaved changes
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button button--small" onClick={discard} disabled={saving}>
              Discard
            </button>
            <button
              className="button button--small button--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
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
  text: string;
  muted: boolean;
  onClick: () => void;
}

function CatalogTable({
  title,
  addLabel,
  onAdd,
  usedHeader,
  rows,
}: {
  title: string;
  addLabel: string;
  onAdd: () => void;
  usedHeader: string;
  rows: CatalogRow[];
}) {
  return (
    <section style={SECTION_BOX}>
      <SectionHeader title={title} onAdd={onAdd} addLabel={addLabel} />
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>None yet.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--color-text-tertiary)", fontSize: 12 }}>
              <th style={{ padding: "2px 8px", width: "38%", fontWeight: 400 }}>Name</th>
              <th style={{ padding: "2px 8px", fontWeight: 400 }}>{usedHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={r.onClick}
                style={{
                  cursor: "pointer",
                  borderTop: "0.5px solid var(--color-border-tertiary)",
                  background: "var(--color-background-primary)",
                }}
              >
                <td style={{ padding: "8px", fontWeight: 500 }}>
                  {r.name || <span style={{ color: "var(--color-text-tertiary)" }}>(unnamed)</span>}
                </td>
                <td
                  style={{
                    padding: "8px",
                    color: r.muted
                      ? "var(--color-text-tertiary)"
                      : "var(--color-text-secondary)",
                  }}
                >
                  {r.text}
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
  used,
  dup,
  onChange,
  onDelete,
}: {
  activity: Activity;
  fields: StudentField[];
  editNonce: number;
  used: number;
  dup: boolean;
  onChange: (patch: Partial<Activity>) => void;
  onDelete: () => void;
}) {
  const reserved = activity.id === RESERVED_OTHER_ID;
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Check
              label="Show a “Segment name” field on the Generate form"
              checked={!!activity.requiresSegmentName}
              onChange={(v) => onChange({ requiresSegmentName: v })}
            />
            <Check
              label="Show an “Additional info” field (appended to the activity wording)"
              checked={!!activity.freeText}
              onChange={(v) => onChange({ freeText: v })}
            />
          </div>
          <div>
            <h4 style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px 0" }}>Custom description</h4>
            <MadlibEditor
              key={`madlib-${activity.id}-${editNonce}`}
              activity={activity}
              fields={fields}
              onChange={onChange}
            />
          </div>
          <div>
            <DeleteButton used={used} onClick={onDelete} />
          </div>
        </>
      )}
    </div>
  );
}

function RoleDetail({
  role,
  used,
  dup,
  onChange,
  onToggleField,
  onDelete,
}: {
  role: Role;
  used: number;
  dup: boolean;
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
      <div>
        <DeleteButton used={used} onClick={onDelete} />
      </div>
    </div>
  );
}

function StudentFieldDetail({
  field,
  keyEditable,
  used,
  onChange,
  onDelete,
}: {
  field: StudentField;
  keyEditable: boolean;
  used: number;
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
          <label className="label">Key {keyEditable ? "" : "(fixed)"}</label>
          {keyEditable ? (
            <input
              className="input"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 13 }}
              placeholder="e.g. language"
              value={field.key}
              onChange={(e) => onChange({ key: e.target.value })}
            />
          ) : (
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
              {field.key}
            </div>
          )}
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
      <div>
        <DeleteButton used={used} noun="reference" onClick={onDelete} />
      </div>
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

function DeleteButton({
  used,
  onClick,
  noun = "teacher",
}: {
  used: number;
  onClick: () => void;
  noun?: string;
}) {
  return (
    <button
      className="button button--small button--danger-text"
      onClick={onClick}
      title={used > 0 ? `Used by ${used} ${noun}${used === 1 ? "" : "s"}` : "Delete"}
    >
      Delete{used > 0 ? ` (${used})` : ""}
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
        student attribute to swap in a per-student word (e.g. journal method → “traced” / “wrote”),
        or leave it on “Same for all students” for identical wording every time.
      </p>
      <div>
        <label className="label">Per-student word</label>
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
      <label className="label">Options (students pick any number)</label>
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

function confirmDelete(used: number, noun = "teacher"): boolean {
  if (used === 0) return true;
  return window.confirm(
    `This is used by ${used} ${noun}${used === 1 ? "" : "s"}. Delete anyway? ` +
      "Existing values are kept in the data but it stops being offered.",
  );
}

function countLabel(n: number, singular: string, plural: string): string {
  if (n === 0) return `No ${plural}`;
  return `${n} ${n === 1 ? singular : plural}`;
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
