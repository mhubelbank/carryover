import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useUnsavedGuard } from "../hooks/useUnsavedGuard";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadSessions } from "../domain/data";
import { groupByLongTerm, type Goal } from "../domain/goal";
import { fullName } from "../domain/student";
import { goalUsageCounts } from "../domain/session";
import { suggestShortnames } from "../domain/shortnames";

// Per-student goals hub: the editable list (view) and the Add-goals workflow.
// Reached from a student's detail page (Students flow).
export function StudentGoals({
  studentId,
  onBack,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const [adding, setAdding] = useState<{ ltg: string } | null>(null);
  if (adding) {
    return (
      <AddGoals
        studentId={studentId}
        initialLtg={adding.ltg}
        onDone={() => setAdding(null)}
        onNavigate={onNavigate}
      />
    );
  }
  return (
    <GoalsView
      studentId={studentId}
      onBack={onBack}
      onAdd={(ltg) => setAdding({ ltg })}
      onNavigate={onNavigate}
    />
  );
}

function GoalsView({
  studentId,
  onBack,
  onAdd,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onAdd: (ltg: string) => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, studentById, client, saveGoals } = useTerm();
  const ownGoals = () =>
    (state.status === "ready" ? state.data.goals.filter((g) => g.studentId === studentId) : []).map(
      cloneGoal,
    );
  const [draft, setDraft] = useState<Goal[]>(ownGoals);
  const [baseline, setBaseline] = useState<Goal[]>(ownGoals);
  const [showArchived, setShowArchived] = useState(false);
  const [usage, setUsage] = useState<Map<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setUsage(null);
    loadSessions(client)
      .then((s) => {
        if (!cancelled) setUsage(goalUsageCounts(s));
      })
      .catch(() => {
        if (!cancelled) setUsage(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const data = state.status === "ready" ? state.data : null;
  const student = studentById.get(studentId);
  if (!data || !student) return null;

  const teacher = teacherById.get(student.teacherId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const archivedCount = draft.filter((g) => g.archived).length;
  const activeGroups = groupByLongTerm(draft.filter((g) => !g.archived));
  const activeCount = draft.filter((g) => !g.archived).length;
  const groups = groupByLongTerm(showArchived ? draft : draft.filter((g) => !g.archived));
  // Long-term goals that had goals at load but now have none in the draft —
  // removing the last short-term goal shouldn't silently drop the LTG.
  const draftLtgs = new Set(draft.map((g) => g.longTermGoal));
  const emptiedLtgs = [...new Set(baseline.map((g) => g.longTermGoal))].filter(
    (ltg) => ltg.trim() !== "" && !draftLtgs.has(ltg),
  );

  const setShortName = (id: string, v: string) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, shortName: v } : g)));
  const toggleArchived = (id: string) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, archived: !g.archived } : g)));
  const removeGoal = (id: string) => setDraft((d) => d.filter((g) => g.id !== id));

  async function handleSave() {
    // A shortname is the goal's checkbox label in Generate; a long-term goal is
    // its grouping key. Neither may be blank on an active goal.
    const blank = draft.find(
      (g) => !g.archived && (g.shortName.trim() === "" || g.longTermGoal.trim() === ""),
    );
    if (blank) {
      setError("Every goal needs a shortname (and long-term goal). Fill it in or remove the row.");
      return;
    }
    const dup = findDuplicateShortname(draft);
    if (dup) {
      setError(dup);
      return;
    }
    setSaving(true);
    setError(null);
    const others = data!.goals.filter((g) => g.studentId !== studentId);
    try {
      await saveGoals([...others, ...draft]);
      setBaseline(draft.map(cloneGoal));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
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
          ← {fullName(student)}
        </button>
      </div>

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
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{fullName(student)}'s goals</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {activeCount} short-term goal{activeCount === 1 ? "" : "s"} across {activeGroups.length}{" "}
            long-term area{activeGroups.length === 1 ? "" : "s"}
            {teacher ? ` · ${teacher.name}` : ""}
          </p>
        </div>
        <button className="button button--small" onClick={() => onAdd("")}>
          <Icon name="plus" size={14} />
          Add goals
        </button>
      </div>

      {groups.length === 0 && emptiedLtgs.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 14 }}
        >
          No goals yet for {fullName(student)}. Use "Add goals" to paste them in.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((group, gi) => (
            <div
              key={gi}
              style={{
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-md)",
                padding: "14px 16px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px 0",
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Long-term goal
              </p>
              <p style={{ margin: "0 0 12px 0", fontSize: 14, lineHeight: 1.6 }}>{group.longTermGoal}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.goals.map((goal) => (
                  <div
                    key={goal.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: goal.archived ? 0.55 : 1,
                    }}
                  >
                    <input
                      className="input"
                      style={{ flex: 1, height: 32 }}
                      value={goal.shortName}
                      onChange={(e) => setShortName(goal.id, e.target.value)}
                    />
                    <span style={{ flexShrink: 0 }}>
                      <UsageLabel usage={usage} goal={goal} />
                    </span>
                    <button
                      className="button button--ghost button--small"
                      style={{ flexShrink: 0 }}
                      onClick={() => toggleArchived(goal.id)}
                    >
                      {goal.archived ? "Unarchive" : "Archive"}
                    </button>
                    <button
                      className="button button--ghost button--small"
                      style={{ flexShrink: 0, padding: 6, color: "var(--color-text-tertiary)" }}
                      title="Remove goal"
                      onClick={() => removeGoal(goal.id)}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {emptiedLtgs.map((ltg, i) => (
            <div
              key={`emptied-${i}`}
              style={{
                border: "0.5px solid var(--color-border-warning)",
                background: "var(--color-background-warning)",
                borderRadius: "var(--border-radius-md)",
                padding: "14px 16px",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px 0",
                  fontSize: 11,
                  color: "var(--color-text-warning)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Long-term goal · no short-term goals
              </p>
              <p style={{ margin: "0 0 8px 0", fontSize: 14, lineHeight: 1.6 }}>{ltg}</p>
              <p style={{ margin: "0 0 10px 0", fontSize: 12, color: "var(--color-text-warning)" }}>
                All short-term goals were removed. Add goals to keep this long-term area — if you save
                now, it won't be kept.
              </p>
              <button className="button button--small" onClick={() => onAdd(ltg)}>
                <Icon name="sparkles" size={14} />
                Add goals for this area
              </button>
            </div>
          ))}
        </div>
      )}

      {archivedCount > 0 && (
        <button
          className="button button--ghost button--small"
          style={{ marginTop: 12, color: "var(--color-text-secondary)" }}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide" : "Show"} {archivedCount} archived
        </button>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {dirty && (
        <SaveBar
          label="Unsaved changes"
          saving={saving}
          onDiscard={() => {
            setDraft(baseline.map(cloneGoal));
            setError(null);
          }}
          onSave={handleSave}
          saveLabel="Save"
        />
      )}
    </div>
  );
}

interface Cluster {
  ltg: string;
  stText: string;
}

interface ReviewItem {
  id: string;
  ltg: string;
  stText: string;
  shortName: string;
}

function AddGoals({
  studentId,
  initialLtg,
  onDone,
  onNavigate,
}: {
  studentId: string;
  initialLtg: string;
  onDone: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { keys } = useAuth();
  const { state, studentById, saveGoals } = useTerm();
  const [clusters, setClusters] = useState<Cluster[]>([{ ltg: initialLtg, stText: "" }]);
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalTarget, setModalTarget] = useState<string | "all" | null>(null);
  const [feedback, setFeedback] = useState("");

  const data = state.status === "ready" ? state.data : null;
  const student = studentById.get(studentId);
  if (!data || !student) return null;

  const apiKey = keys?.anthropicApiKey ?? "";
  const totalDetected = clusters.reduce((n, c) => n + splitLines(c.stText).length, 0);

  const updateCluster = (i: number, patch: Partial<Cluster>) =>
    setClusters((cs) => cs.map((c, ci) => (ci === i ? { ...c, ...patch } : c)));

  async function handleSuggest() {
    if (!apiKey) {
      setError("No Anthropic API key set — add one in Settings.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const items: ReviewItem[] = [];
      for (const c of clusters) {
        const sts = splitLines(c.stText);
        if (sts.length === 0) continue;
        const names = await suggestShortnames(apiKey, {
          longTermGoal: c.ltg,
          shortTerms: sts,
        });
        sts.forEach((st, i) =>
          items.push({ id: crypto.randomUUID(), ltg: c.ltg, stText: st, shortName: names[i] ?? st }),
        );
      }
      if (items.length === 0) {
        setError("Add at least one short-term goal first.");
        return;
      }
      setReview(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setBusy(false);
    }
  }

  async function applyFeedback() {
    if (!apiKey || !review || modalTarget === null) return;
    setBusy(true);
    setError(null);
    try {
      if (modalTarget === "all") {
        const order = new Map(review.map((it, i) => [it.id, i] as const));
        const byLtg = new Map<string, ReviewItem[]>();
        for (const it of review) {
          const arr = byLtg.get(it.ltg) ?? [];
          arr.push(it);
          byLtg.set(it.ltg, arr);
        }
        const updated: ReviewItem[] = [];
        for (const [ltg, items] of byLtg) {
          const names = await suggestShortnames(apiKey, {
            longTermGoal: ltg,
            shortTerms: items.map((i) => i.stText),
            current: items.map((i) => i.shortName),
            feedback,
          });
          items.forEach((it, i) => updated.push({ ...it, shortName: names[i] ?? it.shortName }));
        }
        updated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setReview(updated);
      } else {
        const item = review.find((it) => it.id === modalTarget);
        if (item) {
          const names = await suggestShortnames(apiKey, {
            longTermGoal: item.ltg,
            shortTerms: [item.stText],
            current: [item.shortName],
            feedback,
          });
          setReview((r) =>
            (r ?? []).map((it) =>
              it.id === modalTarget ? { ...it, shortName: names[0] ?? it.shortName } : it,
            ),
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-suggest failed");
    } finally {
      setBusy(false);
      setModalTarget(null);
      setFeedback("");
    }
  }

  async function handleSave() {
    if (!review) return;
    const newGoals: Goal[] = review.map((it) => ({
      id: `g_${crypto.randomUUID()}`,
      studentId,
      longTermGoal: it.ltg.trim(),
      shortName: it.shortName.trim(),
      archived: false,
    }));
    if (newGoals.some((g) => g.longTermGoal === "" || g.shortName === "")) {
      setError("Each goal needs a long-term goal and a shortname before saving.");
      return;
    }
    const dup = findDuplicateShortname(newGoals);
    if (dup) {
      setError(dup);
      return;
    }
    setBusy(true);
    setError(null);
    // Re-populating an emptied long-term goal replaces its existing rows rather
    // than appending alongside them.
    const kept = data!.goals.filter(
      (g) => !(initialLtg !== "" && g.studentId === studentId && g.longTermGoal === initialLtg),
    );
    try {
      await saveGoals([...kept, ...newGoals]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  }

  const reviewGroups = review ? groupReview(review) : [];

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onDone}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← {fullName(student)}'s goals
        </button>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 4px 0" }}>Add goals for {fullName(student)}</h1>
      <p style={{ margin: "0 0 1.5rem 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
        For each long-term goal, paste the LTG text and its short-term goals below it (one per line), then
        suggest shortnames.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {clusters.map((cluster, ci) => {
          const detected = splitLines(cluster.stText).length;
          return (
            <div
              key={ci}
              style={{
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-md)",
                padding: "14px 16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 10,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 11,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  Long-term goal #{ci + 1}
                </p>
                {clusters.length > 1 && (
                  <button
                    className="button button--ghost button--small"
                    style={{ padding: 4, color: "var(--color-text-tertiary)" }}
                    title="Remove this long-term goal"
                    onClick={() => setClusters((cs) => cs.filter((_, i) => i !== ci))}
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              <label className="label">Long-term goal text</label>
              <textarea
                className="textarea"
                rows={3}
                value={cluster.ltg}
                onChange={(e) => updateCluster(ci, { ltg: e.target.value })}
              />
              <label className="label" style={{ marginTop: 10 }}>
                Short-term goals (one per line)
              </label>
              <textarea
                className="textarea"
                rows={5}
                value={cluster.stText}
                onChange={(e) => updateCluster(ci, { stText: e.target.value })}
              />
              <p
                style={{
                  margin: "6px 0 0 0",
                  fontSize: 12,
                  color: detected > 0 ? "var(--color-text-success)" : "var(--color-text-tertiary)",
                }}
              >
                {detected} short-term goal{detected === 1 ? "" : "s"} detected
              </p>
            </div>
          );
        })}

        <button
          className="button button--ghost"
          style={{
            border: "1px dashed var(--color-border-secondary)",
            justifyContent: "center",
            color: "var(--color-text-secondary)",
          }}
          onClick={() => setClusters((cs) => [...cs, { ltg: "", stText: "" }])}
        >
          <Icon name="plus" size={14} />
          Add another long-term goal
        </button>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <button
          className="button button--primary"
          onClick={handleSuggest}
          disabled={busy || totalDetected === 0}
        >
          <Icon name="sparkles" size={14} />
          {busy && !review ? "Suggesting…" : review ? "Re-suggest from input" : "Suggest shortnames"}
        </button>
      </div>

      {review && (
        <div style={{ marginTop: "2rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 4,
              gap: 12,
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Review and confirm</h2>
            <button
              className="button button--ghost button--small"
              onClick={() => setModalTarget("all")}
              disabled={busy}
            >
              <Icon name="refresh" size={13} />
              Re-suggest all
            </button>
          </div>
          <p style={{ margin: "0 0 1rem 0", color: "var(--color-text-secondary)", fontSize: 13 }}>
            Edit any shortname directly, or use ↻ to ask the AI to retry with feedback. Want more or
            fewer shortnames? Split or combine the short-term goal lines above and re-suggest — one line
            becomes one shortname.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {reviewGroups.map((group, gi) => (
              <div
                key={gi}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: "var(--border-radius-md)",
                  padding: "14px 16px",
                }}
              >
                <p
                  style={{
                    margin: "0 0 10px 0",
                    fontSize: 11,
                    color: "var(--color-text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {group.ltg.trim() || "Long-term goal"}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {group.items.map((item) => (
                    <div key={item.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ fontSize: 13, lineHeight: 1.5 }}>{item.stText}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}
                        >
                          shortname
                        </span>
                        <input
                          className="input"
                          style={{ flex: 1, height: 32 }}
                          value={item.shortName}
                          onChange={(e) =>
                            setReview((r) =>
                              (r ?? []).map((it) =>
                                it.id === item.id ? { ...it, shortName: e.target.value } : it,
                              ),
                            )
                          }
                        />
                        <button
                          className="button button--ghost button--small"
                          style={{ flexShrink: 0, padding: 6, color: "var(--color-text-tertiary)" }}
                          title="Re-suggest this shortname"
                          onClick={() => setModalTarget(item.id)}
                          disabled={busy}
                        >
                          <Icon name="refresh" size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
            <button className="button button--success" onClick={handleSave} disabled={busy}>
              <Icon name="check" size={14} />
              {busy ? "Saving…" : `Save ${review.length} goal${review.length === 1 ? "" : "s"} to ${fullName(student)}`}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {modalTarget !== null && (
        <ReSuggestModal
          feedback={feedback}
          setFeedback={setFeedback}
          busy={busy}
          onCancel={() => {
            setModalTarget(null);
            setFeedback("");
          }}
          onSubmit={applyFeedback}
        />
      )}
    </div>
  );
}

const CHIPS = ["Too long", "Too vague", "Too specific", "Wrong words"] as const;
const CHIP_FEEDBACK: Record<(typeof CHIPS)[number], string> = {
  "Too long": "Make the shortnames shorter.",
  "Too vague": "Make the shortnames more specific.",
  "Too specific": "Make the shortnames more general.",
  "Wrong words": "Use different wording.",
};

function ReSuggestModal({
  feedback,
  setFeedback,
  busy,
  onCancel,
  onSubmit,
}: {
  feedback: string;
  setFeedback: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
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
      <div className="card" style={{ width: 440, maxWidth: "100%" }}>
        <h3 className="card__title">Re-suggest with feedback</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {CHIPS.map((chip) => (
            <button
              key={chip}
              className="button button--small"
              onClick={() => setFeedback(CHIP_FEEDBACK[chip])}
            >
              {chip}
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          rows={3}
          placeholder="What should change?"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button className="button button--small" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="button button--small button--primary"
            onClick={onSubmit}
            disabled={busy || feedback.trim() === ""}
          >
            {busy ? "Re-suggesting…" : "Re-suggest"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBar({
  label,
  saveLabel,
  saving,
  onDiscard,
  onSave,
}: {
  label: string;
  saveLabel: string;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  // Mounted only while there are unsaved goal edits — warn on leaving.
  useUnsavedGuard();
  return (
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
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{label}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="button button--small" onClick={onDiscard} disabled={saving}>
          Discard
        </button>
        <button className="button button--small button--primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

function UsageLabel({ usage, goal }: { usage: Map<string, number> | null; goal: Goal }) {
  if (usage === null) {
    return <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>…</span>;
  }
  const count = usage.get(goal.id) ?? 0;
  if (count === 0) {
    return <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>Not used yet</span>;
  }
  return (
    <span
      style={{
        fontSize: 11,
        color: "var(--color-text-success)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      <Icon name="check" size={12} /> {count}
    </span>
  );
}

function groupReview(items: ReviewItem[]): { ltg: string; items: ReviewItem[] }[] {
  const groups: { ltg: string; items: ReviewItem[] }[] = [];
  const index = new Map<string, { ltg: string; items: ReviewItem[] }>();
  for (const item of items) {
    let group = index.get(item.ltg);
    if (!group) {
      group = { ltg: item.ltg, items: [] };
      index.set(item.ltg, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function cloneGoal(g: Goal): Goal {
  return { ...g };
}

// The only goal-shortname collision worth blocking (per spec): two identical
// shortnames under the same long-term goal — almost certainly a paste dupe.
function findDuplicateShortname(goals: Goal[]): string | null {
  const seen = new Set<string>();
  for (const g of goals) {
    if (g.archived) continue;
    const name = g.shortName.trim();
    if (name === "") continue;
    const key = `${g.longTermGoal} ${name.toLowerCase()}`;
    if (seen.has(key)) {
      return `Two goals share the shortname "${name}" under the same long-term goal. Rename one.`;
    }
    seen.add(key);
  }
  return null;
}
