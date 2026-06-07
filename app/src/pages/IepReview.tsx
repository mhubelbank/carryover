import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { appendIepReview, loadSessions } from "../domain/data";
import { formatShort, parseDate, startOfDay, toISODate } from "../domain/dates";
import { groupByLongTerm, type Goal } from "../domain/goal";
import { goalUsageCounts } from "../domain/session";
import { fullName } from "../domain/student";
import { AddGoals, UsageLabel } from "./Goals";

// The IEP review workflow (mock §19). Reached when a student's next-IEP date has
// passed (soft block — generation still works, this clears the nudge). Reuses the
// Add-goals paste tool and the shared usage labels; writes a review entry to the
// student's iep-history log and sets the next review date on finish.
export function IepReview({
  studentId,
  onBack,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, client, studentById, saveGoals, saveStudents } = useTerm();

  const today = toISODate(startOfDay(new Date()));
  const [adding, setAdding] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  // Per-goal retire/keep overrides applied on finish (id → archived?).
  const [override, setOverride] = useState<Map<string, boolean>>(() => new Map());
  const [nextDate, setNextDate] = useState<string>("");
  // Mandate + triennial are prefilled from the student once it loads (see effect
  // below), then edited here. The mandate is overwritten in place on finish; the
  // change is recorded in the iep-history log.
  const [mandate, setMandate] = useState("");
  const [triennial, setTriennial] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [usage, setUsage] = useState<Map<string, number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = state.status === "ready" ? state.data : null;
  const student = studentById.get(studentId);

  // Active short-term goal ids at the moment the review opened — the baseline for
  // counting kept / retired / added. Captured once; survives the Add-goals round
  // trip because this component stays mounted.
  const [openActiveIds] = useState<Set<string>>(
    () =>
      new Set(
        (data?.goals ?? [])
          .filter((g) => g.studentId === studentId && !g.archived)
          .map((g) => g.id),
      ),
  );

  // Next-review input starts blank (per the mock): finishing clears the overdue
  // date — which is what lifts the soft block — unless she picks a new one.
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

  // Prefill mandate/triennial from the student once (it may be absent on the
  // first render before data loads).
  useEffect(() => {
    if (student && !prefilled) {
      setMandate(student.mandate ?? "");
      setTriennial(student.nextTriennial ?? "");
      setPrefilled(true);
    }
  }, [student, prefilled]);

  const studentGoals = useMemo(
    () => (data?.goals ?? []).filter((g) => g.studentId === studentId),
    [data, studentId],
  );

  if (!data || !student) return null;

  if (adding) {
    return (
      <AddGoals
        studentId={studentId}
        initialLtg=""
        onDone={() => setAdding(false)}
        onNavigate={onNavigate}
      />
    );
  }

  const isArchived = (g: Goal) => (override.has(g.id) ? override.get(g.id)! : g.archived);
  const activeGoals = studentGoals.filter((g) => !isArchived(g));
  const retiredGoals = studentGoals.filter((g) => isArchived(g));
  const activeGroups = groupByLongTerm(activeGoals);

  const overdue = parseDate(student.nextIepReview);
  const overdueLabel = overdue ? formatShort(overdue) : null;

  const toggleRetire = (g: Goal) =>
    setOverride((m) => {
      const next = new Map(m);
      next.set(g.id, !isArchived(g));
      return next;
    });

  // Apply the retire/keep overrides to this student's goals.
  const finalGoals = studentGoals.map((g) =>
    override.has(g.id) ? { ...g, archived: override.get(g.id)! } : g,
  );

  async function persistGoalChanges() {
    if (override.size === 0) return;
    const others = data!.goals.filter((g) => g.studentId !== studentId);
    await saveGoals([...others, ...finalGoals]);
  }

  const mandateValue = mandate.trim() || null;
  const mandateChanged = mandateValue !== (student.mandate ?? null);

  // Persist the IEP-review outcome fields in a single write: the next review date
  // (blank clears the overdue nudge), the mandate (overwritten in place), and the
  // next triennial.
  async function persistStudentFields() {
    const iepValue = nextDate || null;
    const triValue = triennial || null;
    const cur = student!;
    if (
      iepValue === (cur.nextIepReview ?? null) &&
      mandateValue === (cur.mandate ?? null) &&
      triValue === (cur.nextTriennial ?? null)
    )
      return;
    await saveStudents(
      data!.students.map((s) =>
        s.id === studentId
          ? { ...s, nextIepReview: iepValue, mandate: mandateValue, nextTriennial: triValue }
          : s,
      ),
    );
  }

  async function handleNothingChanged() {
    setSaving(true);
    setError(null);
    try {
      if (client)
        await appendIepReview(client, studentId, {
          date: today,
          nothingChanged: true,
          ...(mandateChanged && mandateValue ? { mandate: mandateValue } : {}),
        });
      await persistStudentFields();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the review.");
      setSaving(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      await persistGoalChanges();
      const finalActive = new Set(finalGoals.filter((g) => !g.archived).map((g) => g.id));
      const added = [...finalActive].filter((id) => !openActiveIds.has(id)).length;
      const retired = [...openActiveIds].filter((id) => !finalActive.has(id)).length;
      const kept = [...openActiveIds].filter((id) => finalActive.has(id)).length;
      if (client) {
        const base =
          added === 0 && retired === 0
            ? { date: today, nothingChanged: true }
            : { date: today, added, retired, kept };
        await appendIepReview(
          client,
          studentId,
          mandateChanged && mandateValue ? { ...base, mandate: mandateValue } : base,
        );
      }
      await persistStudentFields();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the review.");
      setSaving(false);
    }
  }

  const name = fullName(student);

  const reviewRow: CSSProperties = {
    padding: "14px 16px",
    background: "var(--color-background-secondary)",
    borderRadius: "var(--border-radius-md)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  };

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← {name}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>IEP review for {student.firstName}</h1>
        {overdueLabel && (
          <span
            style={{
              background: "var(--color-background-warning)",
              color: "var(--color-text-warning)",
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: "var(--border-radius-md)",
            }}
          >
            {overdueLabel}
          </span>
        )}
      </div>

      {/* Nothing-changed shortcut. */}
      <div
        style={{
          background: "var(--color-background-secondary)",
          borderRadius: "var(--border-radius-md)",
          padding: "14px 16px",
          margin: "1rem 0 1.5rem 0",
        }}
      >
        <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
          If {student.firstName}'s new IEP keeps the existing goals unchanged, mark it so and unblock
          their notes.
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button className="button button--small" onClick={() => void handleNothingChanged()} disabled={saving}>
            <Icon name="check" size={14} /> Nothing changed — confirm goals
          </button>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            or update the goals below
          </span>
        </div>
      </div>

      {/* Tabs: existing / add new / retired. */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1rem" }}>
        <span
          style={{
            padding: "6px 12px",
            fontSize: 13,
            fontWeight: 500,
            background: showRetired ? "transparent" : "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            cursor: "pointer",
          }}
          onClick={() => setShowRetired(false)}
        >
          Existing goals <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>{activeGoals.length}</span>
        </span>
        <span
          style={{ padding: "6px 12px", fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer" }}
          onClick={() => setAdding(true)}
        >
          Add new <span style={{ color: "var(--color-text-tertiary)" }}>+</span>
        </span>
        <span
          style={{
            padding: "6px 12px",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            background: showRetired ? "var(--color-background-secondary)" : "transparent",
            borderRadius: "var(--border-radius-md)",
            fontWeight: showRetired ? 500 : 400,
            cursor: "pointer",
          }}
          onClick={() => setShowRetired(true)}
        >
          Retired <span style={{ color: "var(--color-text-tertiary)" }}>{retiredGoals.length}</span>
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
        {showRetired ? (
          retiredGoals.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
              No retired goals.
            </p>
          ) : (
            retiredGoals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} usage={usage} archived onToggle={() => toggleRetire(goal)} />
            ))
          )
        ) : activeGroups.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
            No active goals. Use "Add new" to add them from the updated IEP.
          </p>
        ) : (
          activeGroups.map((group, gi) => (
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
                  <GoalRow key={goal.id} goal={goal} usage={usage} archived={false} onToggle={() => toggleRetire(goal)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add goals entry (routes to the paste tool). */}
      <div style={{ ...reviewRow, marginBottom: "1.5rem" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Add goals from updated IEP</p>
        <button className="button button--small" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add goals
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.5rem" }}>
        {/* Service mandate — edit in place if it changed at the review. */}
        <div style={reviewRow}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              Service mandate
            </p>
            <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
              Update if it changed at this review.
            </p>
          </div>
          <input
            className="input"
            style={{ width: 180 }}
            placeholder="e.g. 2:30:4"
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
          />
        </div>

        {/* Next IEP review date — blank clears the overdue nudge. */}
        <div style={reviewRow}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              Set next IEP review date
            </p>
            <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
              Can be left blank — set it later if you don't know yet.
            </p>
          </div>
          <input
            className="input"
            type="date"
            style={{ width: 180 }}
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
        </div>

        {/* Next triennial date — editable, prefilled from the student. */}
        <div style={reviewRow}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
              Next triennial date
            </p>
            <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
              Update if the reevaluation date changed.
            </p>
          </div>
          <input
            className="input"
            type="date"
            style={{ width: 180 }}
            value={triennial}
            onChange={(e) => setTriennial(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)", marginBottom: 12 }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="button button--small" onClick={onBack} disabled={saving}>
          Cancel
        </button>
        <button
          className="button button--small button--primary"
          onClick={() => void handleFinish()}
          disabled={saving}
        >
          <Icon name="check" size={14} /> {saving ? "Saving…" : "Finish review and unblock"}
        </button>
      </div>
    </div>
  );
}

function GoalRow({
  goal,
  usage,
  archived,
  onToggle,
}: {
  goal: Goal;
  usage: Map<string, number> | null;
  archived: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: archived ? 0.55 : 1 }}>
      <span style={{ flex: 1, fontSize: 13 }}>{goal.shortName || "(no shortname)"}</span>
      <span style={{ flexShrink: 0 }}>
        <UsageLabel usage={usage} goal={goal} />
      </span>
      <button className="button button--ghost button--small" style={{ flexShrink: 0 }} onClick={onToggle}>
        {archived ? "Restore" : "Retire"}
      </button>
    </div>
  );
}
