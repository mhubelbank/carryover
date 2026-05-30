import { useState } from "react";
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

// The shared catalogs (activities, filming roles, student fields). Teachers/
// students reference these; here Emily edits the catalogs.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on discard so each row's MadlibEditor (which holds its own
  // before/after state) remounts and re-reads the reverted template.
  const [editNonce, setEditNonce] = useState(0);

  if (state.status !== "ready") return null;
  const actRefs = activityRefCounts(state.data.teachers);
  const roleRefs = roleRefCounts(state.data.teachers);
  const sfRefs = studentFieldRefCounts(
    sf.map((f) => f.key),
    state.data.teachers,
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
  const addAct = () => setActs((d) => [...d, { id: `act_${crypto.randomUUID()}`, name: "" }]);
  const removeAct = (id: string) => {
    if (!confirmDelete(actRefs.get(id) ?? 0)) return;
    setActs((d) => d.filter((a) => a.id !== id));
  };

  const updateRole = (id: string, patch: Partial<Role>) =>
    setRoles((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRole = () =>
    setRoles((d) => [...d, { id: `role_${crypto.randomUUID()}`, name: "", phrase: "", fields: [] }]);
  const removeRole = (id: string) => {
    if (!confirmDelete(roleRefs.get(id) ?? 0)) return;
    setRoles((d) => d.filter((r) => r.id !== id));
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
  const addField = () => setSf((d) => [...d, { key: "", label: "", type: "toggle" }]);
  const removeField = (i: number, key: string) => {
    if (!confirmDelete(sfRefs.get(key) ?? 0, "reference")) return;
    setSf((d) => d.filter((_, j) => j !== i));
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
    // Validate field keys (safe identifiers, no reserved names, unique).
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

  return (
    <div className="shell">
      <Nav current="activities" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Activities</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {countLabel(acts.length, "activity", "activities")} ·{" "}
          {countLabel(roles.length, "filming role", "filming roles")} ·{" "}
          {countLabel(sf.length, "student field", "student fields")}
        </p>
      </div>

      <SectionHeader title="Activities" onAdd={addAct} addLabel="Add activity" />
      {acts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.5rem" }}>
          {acts.map((a) => {
            const reserved = a.id === RESERVED_OTHER_ID;
            const used = actRefs.get(a.id) ?? 0;
            const dup = a.name.trim() !== "" && dupActNames.has(a.name.trim().toLowerCase());
            return (
              <div
                key={a.id}
                className="card"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="input"
                    style={{ flex: 1, height: 32 }}
                    placeholder="Activity name"
                    value={a.name}
                    onChange={(e) => updateAct(a.id, { name: e.target.value })}
                  />
                  {reserved ? (
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      reserved (ad-hoc)
                    </span>
                  ) : (
                    <DeleteButton used={used} onClick={() => removeAct(a.id)} />
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    fontSize: 13,
                    flexWrap: "wrap",
                  }}
                >
                  <Check
                    label="Segment name"
                    checked={!!a.requiresSegmentName}
                    onChange={(v) => updateAct(a.id, { requiresSegmentName: v })}
                  />
                  <Check
                    label="Free text"
                    checked={!!a.freeText}
                    onChange={(v) => updateAct(a.id, { freeText: v })}
                  />
                  <Check
                    label="Free text is the description"
                    checked={!!a.freeTextIsDescription}
                    disabled={reserved}
                    onChange={(v) => updateAct(a.id, { freeTextIsDescription: v })}
                  />
                  {dup && <Dup />}
                </div>
                {!reserved && (
                  <details>
                    <summary
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      Custom description
                    </summary>
                    <MadlibEditor
                      key={`madlib-${a.id}-${editNonce}`}
                      activity={a}
                      fields={sf}
                      onChange={(patch) => updateAct(a.id, patch)}
                    />
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SectionHeader title="Filming roles" onAdd={addRole} addLabel="Add role" />
      {roles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {roles.map((r) => {
            const used = roleRefs.get(r.id) ?? 0;
            const dup = r.name.trim() !== "" && dupRoleNames.has(r.name.trim().toLowerCase());
            return (
              <div
                key={r.id}
                className="card"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    className="input"
                    style={{ width: 160, height: 32 }}
                    placeholder="Role name"
                    value={r.name}
                    onChange={(e) => updateRole(r.id, { name: e.target.value })}
                  />
                  <input
                    className="input"
                    style={{ flex: 1, height: 32 }}
                    placeholder={'Phrase (e.g. "the anchor")'}
                    value={r.phrase}
                    onChange={(e) => updateRole(r.id, { phrase: e.target.value })}
                  />
                  <DeleteButton used={used} onClick={() => removeRole(r.id)} />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 12 }}>
                  {FIELD_KEYS.map((fk) => (
                    <Check
                      key={fk}
                      label={fieldLabel(fk)}
                      checked={r.fields.includes(fk)}
                      onChange={(v) => toggleRoleField(r.id, fk, v)}
                    />
                  ))}
                </div>
                {dup && <Dup />}
              </div>
            );
          })}
        </div>
      )}

      <SectionHeader title="Student fields" onAdd={addField} addLabel="Add field" />
      {sf.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sf.map((f, i) => (
            <StudentFieldRow
              key={i}
              field={f}
              keyEditable={!sfBaseKeys.has(f.key)}
              used={sfRefs.get(f.key) ?? 0}
              onChange={(patch) => updateField(i, patch)}
              onDelete={() => removeField(i, f.key)}
            />
          ))}
        </div>
      )}

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)", marginTop: 12 }}>
          {error}
        </p>
      )}

      {dirty && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "var(--color-background-secondary)",
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

function Dup() {
  return (
    <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>duplicate name</span>
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
  // Only dropdown (select) fields carry a value worth interpolating.
  const selectFields = fields.filter((f) => f.type === "select");
  const chosen = selectFields.find((f) => f.key === attr);
  const sample = chosen?.options?.[0] ?? chosen?.label ?? attr;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
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

// One row of the student-field catalog: key (read-only once saved), label, type,
// and an options sub-editor for `select` (multi-select) fields.
function StudentFieldRow({
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
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {keyEditable ? (
          <input
            className="input"
            style={{ width: 130, height: 32, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
            placeholder="key"
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value })}
          />
        ) : (
          <span
            style={{
              width: 130,
              fontSize: 12,
              fontFamily: "ui-monospace, monospace",
              color: "var(--color-text-tertiary)",
            }}
            title="Key is fixed after the field is saved"
          >
            {field.key}
          </span>
        )}
        <input
          className="input"
          style={{ flex: 1, height: 32 }}
          placeholder="Label (shown on the Students page)"
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <select
          className="select"
          style={{ width: 120, height: 32 }}
          value={field.type}
          onChange={(e) => {
            const type = e.target.value === "select" ? "select" : "toggle";
            onChange(type === "select" ? { type, options: field.options ?? [] } : { type, options: undefined });
          }}
        >
          <option value="toggle">Toggle</option>
          <option value="select">Dropdown</option>
        </select>
        <DeleteButton used={used} noun="reference" onClick={onDelete} />
      </div>
      {field.type === "select" && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onChange({ options })}
        />
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
