import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { SaveBar } from "../components/SaveBar";
import { Nav, type NavPage } from "../components/Nav";
import {
  GoalScorecard,
  Metric,
  Sparkline,
  StatusChip,
  SupportTypeBars,
  sumByType,
  criterionMetPct,
  shortDate,
  ACCURACY_COLOR,
  INDEPENDENCE_COLOR,
  ACCURACY_DEF,
  INDEPENDENCE_DEF,
} from "../components/GoalScorecard";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadSessions, loadIepHistory } from "../domain/data";
import { groupByLongTerm, type Goal } from "../domain/goal";
import { TRIAL_SUPPORT_LEVELS } from "../domain/trial";
import { fullName } from "../domain/student";
import { studentGoalProgress, overallTrend, type GoalProgress } from "../domain/progress";
import { suggestGoalLabels, type GoalLabels } from "../domain/shortnames";

// Per-student goals hub: the editable list (view) and the Add-goals workflow.
// Reached from a student's detail page (Students flow).
export function StudentGoals({
  studentId,
  expandGoalId,
  onBack,
  onNavigate,
}: {
  studentId: string;
  expandGoalId?: string;
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
      expandGoalId={expandGoalId}
      onBack={onBack}
      onAdd={(ltg) => setAdding({ ltg })}
      onNavigate={onNavigate}
    />
  );
}

function GoalsView({
  studentId,
  expandGoalId,
  onBack,
  onAdd,
  onNavigate,
}: {
  studentId: string;
  expandGoalId?: string;
  onBack: () => void;
  onAdd: (ltg: string) => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, studentById, client, saveGoals, termHistory } = useTerm();
  const { keys } = useAuth();
  const apiKey = keys?.anthropicApiKey ?? "";
  const ownGoals = () =>
    (state.status === "ready" ? state.data.goals.filter((g) => g.studentId === studentId) : []).map(
      cloneGoal,
    );
  const [draft, setDraft] = useState<Goal[]>(ownGoals);
  const [baseline, setBaseline] = useState<Goal[]>(ownGoals);
  const [showArchived, setShowArchived] = useState(false);
  const [progress, setProgress] = useState<Map<string, GoalProgress>>(new Map());
  const [iepDates, setIepDates] = useState<string[]>([]);
  // Goal ids whose inline Progress panel is expanded (seeded from a deep-link).
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    expandGoalId ? new Set([expandGoalId]) : new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadSessions(client)
      .then((s) => {
        if (!cancelled) setProgress(studentGoalProgress(s, studentId));
      })
      .catch(() => {});
    loadIepHistory(client, studentId)
      .then((h) => {
        if (!cancelled) setIepDates(h.map((r) => r.date).filter(Boolean));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, studentId]);

  // Term dividers for the progress sparklines: each term's first day, current +
  // archived, newest-first deduped by date.
  const terms = (() => {
    const cur = state.status === "ready" ? state.data.term : null;
    const list = [
      ...(cur ? [{ label: cur.label, firstDay: cur.firstDay }] : []),
      ...termHistory.map((t) => ({ label: t.label, firstDay: t.firstDay })),
    ];
    const seen = new Set<string>();
    return list.filter((t) => t.firstDay && !seen.has(t.firstDay) && seen.add(t.firstDay));
  })();

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
  const setMeasured = (id: string, patch: { measuredVerb?: string; measuredNoun?: string }) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const setTarget = (id: string, patch: { targetPercent?: number; targetLevel?: string }) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const setShortTermGoal = (id: string, v: string) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, shortTermGoal: v } : g)));
  const toggleArchived = (id: string) =>
    setDraft((d) => d.map((g) => (g.id === id ? { ...g, archived: !g.archived } : g)));
  const removeGoal = (id: string) => setDraft((d) => d.filter((g) => g.id !== id));

  // Re-suggest shortnames + measured actions for every active goal — one Claude
  // call per long-term group, fed the full short-term text (falling back to the
  // current shortname for legacy goals). Updates the draft; she reviews and saves
  // via the SaveBar.
  async function reSuggestAll() {
    if (!apiKey) {
      setError("No Anthropic API key set — add one in Settings.");
      return;
    }
    setSuggesting(true);
    setError(null);
    try {
      const groups = groupByLongTerm(draft.filter((g) => !g.archived));
      const updates = new Map<string, GoalLabels>();
      for (const group of groups) {
        const labels = await suggestGoalLabels(apiKey, {
          longTermGoal: group.longTermGoal,
          shortTerms: group.goals.map((g) => g.shortTermGoal.trim() || g.shortName),
          current: group.goals.map((g) => g.shortName),
        });
        group.goals.forEach((g, i) => labels[i] && updates.set(g.id, labels[i]));
      }
      setDraft((d) => d.map((g) => (updates.has(g.id) ? { ...g, ...updates.get(g.id)! } : g)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-suggest labels.");
    } finally {
      setSuggesting(false);
    }
  }

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
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{fullName(student)}'s goals & progress</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {activeCount} short-term goal{activeCount === 1 ? "" : "s"} across {activeGroups.length}{" "}
            long-term area{activeGroups.length === 1 ? "" : "s"}
            {teacher ? ` · ${teacher.name}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {activeCount > 0 && (
            <button
              className="button button--small button--primary"
              onClick={() => void reSuggestAll()}
              disabled={suggesting}
              title="Re-suggest a shortname for every goal from its full text"
            >
              <Icon name="sparkles" size={14} />
              {suggesting ? "Suggesting…" : "Re-suggest shortnames"}
            </button>
          )}
          <button className="button button--small" onClick={() => onAdd("")}>
            <Icon name="plus" size={14} />
            Add goals
          </button>
        </div>
      </div>

      <ProgressOverview
        goals={draft.filter((g) => !g.archived)}
        progress={progress}
        termStart={state.status === "ready" ? state.data.term.firstDay : ""}
      />

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
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {group.goals.map((goal, idx) => (
                  <div
                    key={goal.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: 8, opacity: goal.archived ? 0.55 : 1 }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 24,
                        height: 32,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--color-background-pill)",
                        color: "var(--color-text-secondary)",
                        borderRadius: "var(--border-radius-md)",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
                      {(() => {
                        const gp = progress.get(goal.id);
                        const isOpen = expanded.has(goal.id);
                        const target = { percent: goal.targetPercent, level: goal.targetLevel };
                        const has = !!gp && gp.points.length > 0;
                        const series = has
                          ? target.percent > 0
                            ? gp!.points.map((p) => criterionMetPct(p, target.level))
                            : gp!.points.map((p) => p.independencePct)
                          : [];
                        const lastV = has ? series[series.length - 1]! : 0;
                        const atGoal = has && target.percent > 0 && lastV >= target.percent;
                        return (
                          <>
                            {/* Collapsed header: rename inline + at-a-glance coverage. */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button
                                className="button button--ghost button--small"
                                onClick={() => toggleExpanded(goal.id)}
                                title={isOpen ? "Hide details" : "Show details & progress"}
                                style={{ flexShrink: 0, padding: 4, color: "var(--color-text-tertiary)", display: "flex" }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    transform: isOpen ? "rotate(90deg)" : "none",
                                    transition: "transform 0.15s",
                                  }}
                                >
                                  <Icon name="chevron-right" size={14} />
                                </span>
                              </button>
                              <input
                                className="input"
                                style={{ flex: 1, height: 32 }}
                                placeholder="shortname — terse skill label, e.g. answer WH questions"
                                value={goal.shortName}
                                onChange={(e) => setShortName(goal.id, e.target.value)}
                              />
                              {has ? (
                                <>
                                  <Sparkline values={series} color={INDEPENDENCE_COLOR} w={60} h={18} />
                                  <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 500 }}>{lastV}%</span>
                                  <StatusChip values={series} atGoal={atGoal} />
                                </>
                              ) : (
                                <span style={{ flexShrink: 0, fontSize: 12, color: "var(--color-text-tertiary)" }}>
                                  no data
                                </span>
                              )}
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
                            {/* Expanded: config fields + full scorecard. */}
                            {isOpen && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 30 }}>
                                <textarea
                                  className="textarea"
                                  rows={2}
                                  placeholder="Full short-term goal — sent to the note generator (falls back to the shortname if left blank)"
                                  value={goal.shortTermGoal}
                                  onChange={(e) => setShortTermGoal(goal.id, e.target.value)}
                                  style={{ fontSize: 12, color: "var(--color-text-secondary)" }}
                                />
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                                    measured as
                                  </span>
                                  <input
                                    className="input"
                                    style={{ width: 170, height: 28, fontSize: 12 }}
                                    placeholder="base-form verb"
                                    value={goal.measuredVerb}
                                    onChange={(e) => setMeasured(goal.id, { measuredVerb: e.target.value })}
                                  />
                                  <input
                                    className="input"
                                    style={{ flex: 1, height: 28, fontSize: 12 }}
                                    placeholder="noun (falls back to shortname for Trials)"
                                    value={goal.measuredNoun}
                                    onChange={(e) => setMeasured(goal.id, { measuredNoun: e.target.value })}
                                  />
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                                    mastery target
                                  </span>
                                  <input
                                    className="input"
                                    type="text"
                                    inputMode="numeric"
                                    style={{ width: 52, height: 28, fontSize: 12 }}
                                    placeholder="—"
                                    value={goal.targetPercent ? String(goal.targetPercent) : ""}
                                    onChange={(e) =>
                                      setTarget(goal.id, {
                                        targetPercent: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0),
                                      })
                                    }
                                  />
                                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>% correct at</span>
                                  <select
                                    className="select"
                                    style={{ width: "auto", height: 28, fontSize: 12 }}
                                    value={goal.targetLevel || "no support"}
                                    onChange={(e) => setTarget(goal.id, { targetLevel: e.target.value })}
                                  >
                                    {TRIAL_SUPPORT_LEVELS.map((l) => (
                                      <option key={l} value={l}>
                                        {l}
                                      </option>
                                    ))}
                                  </select>
                                  <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                                    or better — optional; enables mastery tracking
                                  </span>
                                </div>
                                {has && (
                                  <div
                                    style={{
                                      marginTop: 2,
                                      padding: "10px 12px",
                                      border: "0.5px solid var(--color-border-tertiary)",
                                      borderRadius: "var(--border-radius-md)",
                                      background: "color-mix(in srgb, var(--color-background-secondary) 55%, transparent)",
                                    }}
                                  >
                                    <GoalScorecard
                                      progress={gp!}
                                      target={target}
                                      terms={terms}
                                      iepDates={iepDates}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
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
          message="Unsaved changes"
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
  measuredVerb: string;
  measuredNoun: string;
}

export function AddGoals({
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
        const labels = await suggestGoalLabels(apiKey, {
          longTermGoal: c.ltg,
          shortTerms: sts,
        });
        sts.forEach((st, i) =>
          items.push({
            id: crypto.randomUUID(),
            ltg: c.ltg,
            stText: st,
            shortName: labels[i]?.shortName ?? st,
            measuredVerb: labels[i]?.measuredVerb ?? "",
            measuredNoun: labels[i]?.measuredNoun ?? "",
          }),
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
          const labels = await suggestGoalLabels(apiKey, {
            longTermGoal: ltg,
            shortTerms: items.map((i) => i.stText),
            current: items.map((i) => i.shortName),
            feedback,
          });
          items.forEach((it, i) =>
            updated.push({
              ...it,
              shortName: labels[i]?.shortName ?? it.shortName,
              measuredVerb: labels[i]?.measuredVerb ?? it.measuredVerb,
              measuredNoun: labels[i]?.measuredNoun ?? it.measuredNoun,
            }),
          );
        }
        updated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        setReview(updated);
      } else {
        const item = review.find((it) => it.id === modalTarget);
        if (item) {
          const labels = await suggestGoalLabels(apiKey, {
            longTermGoal: item.ltg,
            shortTerms: [item.stText],
            current: [item.shortName],
            feedback,
          });
          setReview((r) =>
            (r ?? []).map((it) =>
              it.id === modalTarget
                ? {
                    ...it,
                    shortName: labels[0]?.shortName ?? it.shortName,
                    measuredVerb: labels[0]?.measuredVerb ?? it.measuredVerb,
                    measuredNoun: labels[0]?.measuredNoun ?? it.measuredNoun,
                  }
                : it,
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
    // ID guard: if a pasted goal's full text matches an existing goal for this
    // student (active OR archived), reuse that goal's id so its trial history
    // carries over instead of starting a fresh, disconnected goal. Match on the
    // normalized short-term text (falling back to shortname).
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const existingByText = new Map<string, Goal>();
    for (const g of data!.goals) {
      if (g.studentId !== studentId) continue;
      const key = norm(g.shortTermGoal || g.shortName);
      if (key && !existingByText.has(key)) existingByText.set(key, g);
    }
    const newGoals: Goal[] = review.map((it) => {
      const match = existingByText.get(norm(it.stText || it.shortName));
      return {
        id: match ? match.id : `g_${crypto.randomUUID()}`,
        studentId,
        longTermGoal: it.ltg.trim(),
        shortTermGoal: it.stText.trim(),
        shortName: it.shortName.trim(),
        measuredVerb: it.measuredVerb.trim(),
        measuredNoun: it.measuredNoun.trim(),
        // Preserve an existing goal's target when re-adding it; new goals start unset.
        targetPercent: match ? match.targetPercent : 0,
        targetLevel: match ? match.targetLevel : "no support",
        archived: false, // re-adding revives an archived goal
      };
    });
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
    // Replace any goals we reused-by-id (the matched existing rows) and any rows
    // in an emptied long-term group, then append the (re)built goals.
    const reusedIds = new Set(newGoals.map((g) => g.id));
    const kept = data!.goals.filter(
      (g) =>
        !reusedIds.has(g.id) &&
        !(initialLtg !== "" && g.studentId === studentId && g.longTermGoal === initialLtg),
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
                          placeholder="terse skill label, e.g. answer WH questions"
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}
                        >
                          measured as
                        </span>
                        <input
                          className="input"
                          style={{ width: 170, height: 32 }}
                          placeholder="past-tense verb"
                          value={item.measuredVerb}
                          onChange={(e) =>
                            setReview((r) =>
                              (r ?? []).map((it) =>
                                it.id === item.id ? { ...it, measuredVerb: e.target.value } : it,
                              ),
                            )
                          }
                        />
                        <input
                          className="input"
                          style={{ flex: 1, height: 32 }}
                          placeholder="noun (falls back to shortname)"
                          value={item.measuredNoun}
                          onChange={(e) =>
                            setReview((r) =>
                              (r ?? []).map((it) =>
                                it.id === item.id ? { ...it, measuredNoun: e.target.value } : it,
                              ),
                            )
                          }
                        />
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

// Caseload-level summary shown at the top of the Goals & progress view: headline
// stats + an all-goals trend. Hidden until there's any trial data.
function ProgressOverview({
  goals,
  progress,
  termStart,
}: {
  goals: Goal[];
  progress: Map<string, GoalProgress>;
  termStart: string;
}) {
  const ptsOf = (id: string) => progress.get(id)?.points ?? [];
  const withData = goals.filter((g) => ptsOf(g.id).length > 0);
  if (withData.length === 0) return null;
  const lastPt = (id: string) => ptsOf(id)[ptsOf(id).length - 1]!;
  const targeted = withData.filter((g) => g.targetPercent > 0);
  const atGoal = targeted.filter((g) => criterionMetPct(lastPt(g.id), g.targetLevel) >= g.targetPercent).length;
  const avgIndep = Math.round(
    withData.reduce((s, g) => s + lastPt(g.id).independencePct, 0) / withData.length,
  );
  const avgAcc = Math.round(
    withData.reduce((s, g) => s + lastPt(g.id).accuracyPct, 0) / withData.length,
  );
  const lastLogged = withData
    .map((g) => lastPt(g.id).date)
    .sort()
    .pop();
  // This-term coverage: goals with ≥1 session since the term start, and the
  // number of distinct session days logged this term.
  const usedThisTerm = termStart
    ? goals.filter((g) => ptsOf(g.id).some((p) => p.date >= termStart)).length
    : withData.length;
  const sessionDaysThisTerm = termStart
    ? new Set(withData.flatMap((g) => ptsOf(g.id).filter((p) => p.date >= termStart).map((p) => p.date))).size
    : 0;
  const trend = overallTrend(progress);
  const allByType = sumByType(withData.flatMap((g) => ptsOf(g.id)));
  const anyTypes = Object.values(allByType).reduce((s, n) => s + n, 0) > 0;
  const stat = (label: string, value: string, color?: string, hint?: string) => (
    <div>
      <div
        style={{ fontSize: 12, color: "var(--color-text-secondary)", cursor: hint ? "help" : undefined }}
        title={hint}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px" }}>
        {stat(termStart ? "Goals used this term" : "Goals measured", `${usedThisTerm} / ${goals.length}`)}
        {termStart && stat("Sessions this term", `${sessionDaysThisTerm}`)}
        {stat("Avg accuracy", `${avgAcc}%`, ACCURACY_COLOR, ACCURACY_DEF)}
        {stat("Avg independence", `${avgIndep}%`, INDEPENDENCE_COLOR, INDEPENDENCE_DEF)}
        {targeted.length > 0 && stat("At goal", `${atGoal} / ${targeted.length}`)}
        {lastLogged && stat("Last logged", shortDate(lastLogged))}
      </div>
      {(trend.length > 1 || anyTypes) && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 36px", alignItems: "flex-start" }}>
            {trend.length > 1 && (
              <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Overall trend — all goals</div>
                <Metric
                  name="Accuracy"
                  color={ACCURACY_COLOR}
                  hint={ACCURACY_DEF}
                  values={trend.map((p) => p.accuracyPct)}
                  latest={trend[trend.length - 1]!.accuracyPct}
                  delta={trend[trend.length - 1]!.accuracyPct - trend[trend.length - 2]!.accuracyPct}
                  single={false}
                />
                <Metric
                  name="Independence"
                  color={INDEPENDENCE_COLOR}
                  hint={INDEPENDENCE_DEF}
                  values={trend.map((p) => p.independencePct)}
                  latest={trend[trend.length - 1]!.independencePct}
                  delta={trend[trend.length - 1]!.independencePct - trend[trend.length - 2]!.independencePct}
                  single={false}
                />
              </div>
            )}
            {anyTypes && (
              <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 320 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>Support types needed</div>
                <SupportTypeBars byType={allByType} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function UsageLabel({ usage, goal }: { usage: Map<string, number> | null; goal: Goal }) {
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
    // Drop a leading list number from pasted goals ("1. Given a…" → "Given a…");
    // the goal's position is shown separately as a number badge.
    .map((l) => l.trim().replace(/^\d+[.)]\s+/, ""))
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
