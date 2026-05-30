import { useState } from "react";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { RESERVED_OTHER_ID, activityRefCounts } from "../domain/activity";
import type { Activity } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
}

// The shared activity catalog (data/activities.json). Teachers pick which
// entries they use (Teachers page); here Emily edits the catalog itself.
export function Activities({ onNavigate }: Props) {
  const { state, saveActivities } = useTerm();
  const [draft, setDraft] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [baseline, setBaseline] = useState<Activity[]>(() =>
    state.status === "ready" ? state.data.activities.map(cloneActivity) : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== "ready") return null;
  const refCounts = activityRefCounts(state.data.teachers);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const dupNames = duplicateNames(draft.map((a) => a.name));

  const update = (id: string, patch: Partial<Activity>) =>
    setDraft((d) => d.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const add = () => setDraft((d) => [...d, { id: `act_${crypto.randomUUID()}`, name: "" }]);
  const remove = (id: string) => {
    const n = refCounts.get(id) ?? 0;
    if (
      n > 0 &&
      !window.confirm(
        `This activity is used by ${n} teacher${n === 1 ? "" : "s"}. Delete anyway? ` +
          "Those teachers will simply stop offering it.",
      )
    ) {
      return;
    }
    setDraft((d) => d.filter((a) => a.id !== id));
  };

  async function handleSave() {
    setSaving(true);
    setError(null);
    const cleaned = draft.map((a) => ({ ...a, name: a.name.trim() })).filter((a) => a.name !== "");
    try {
      await saveActivities(cleaned);
      setDraft(cleaned.map(cloneActivity));
      setBaseline(cleaned.map(cloneActivity));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <Nav current="activities" onNavigate={onNavigate} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Activities</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            Shared catalog — teachers choose which ones they use.
          </p>
        </div>
        <button className="button button--small" onClick={add}>
          Add activity
        </button>
      </div>

      {draft.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No activities yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {draft.map((a) => {
            const reserved = a.id === RESERVED_OTHER_ID;
            const used = refCounts.get(a.id) ?? 0;
            const dup = a.name.trim() !== "" && dupNames.has(a.name.trim().toLowerCase());
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
                    onChange={(e) => update(a.id, { name: e.target.value })}
                  />
                  {reserved ? (
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      reserved (ad-hoc)
                    </span>
                  ) : (
                    <button
                      className="button button--small button--danger-text"
                      onClick={() => remove(a.id)}
                      title={used > 0 ? `Used by ${used} teacher${used === 1 ? "" : "s"}` : "Delete"}
                    >
                      Delete{used > 0 ? ` (${used})` : ""}
                    </button>
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
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!a.requiresSegmentName}
                      onChange={(e) => update(a.id, { requiresSegmentName: e.target.checked })}
                    />
                    Segment name
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!a.freeText}
                      onChange={(e) => update(a.id, { freeText: e.target.checked })}
                    />
                    Free text
                  </label>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6, opacity: reserved ? 0.6 : 1 }}
                  >
                    <input
                      type="checkbox"
                      checked={!!a.freeTextIsDescription}
                      disabled={reserved}
                      onChange={(e) => update(a.id, { freeTextIsDescription: e.target.checked })}
                    />
                    Free text is the description
                  </label>
                  {dup && (
                    <span style={{ fontSize: 12, color: "var(--color-text-warning)" }}>
                      duplicate name
                    </span>
                  )}
                </div>

                <details>
                  <summary
                    style={{ fontSize: 12, color: "var(--color-text-secondary)", cursor: "pointer" }}
                  >
                    Advanced
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    <div>
                      <label className="label">Description template</label>
                      <textarea
                        className="input"
                        rows={2}
                        placeholder='Overrides the name when set. Interpolate e.g. "{student.journalMethod}".'
                        value={a.descriptionTemplate ?? ""}
                        onChange={(e) =>
                          update(a.id, { descriptionTemplate: e.target.value || undefined })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Requires student attribute</label>
                      <input
                        className="input"
                        placeholder="e.g. journalMethod — template applies only when the student has it"
                        value={a.requiresAttribute ?? ""}
                        onChange={(e) =>
                          update(a.id, { requiresAttribute: e.target.value || undefined })
                        }
                      />
                    </div>
                  </div>
                </details>
              </div>
            );
          })}
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
            <button
              className="button button--small"
              onClick={() => setDraft(baseline.map(cloneActivity))}
              disabled={saving}
            >
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

function cloneActivity(a: Activity): Activity {
  return { ...a };
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
