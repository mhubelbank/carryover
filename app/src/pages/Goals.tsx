import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { loadSessions } from "../domain/data";
import { groupByLongTerm, type Goal } from "../domain/goal";
import { goalUsageCounts } from "../domain/session";

// Per-student goals view. Reached from a student's detail page (Students flow),
// not a top-level tab — goals are always scoped to one student.
export function StudentGoals({
  studentId,
  onBack,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, studentById, client } = useTerm();
  const [usage, setUsage] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setUsage(null);
    loadSessions(client)
      .then((sessions) => {
        if (!cancelled) setUsage(goalUsageCounts(sessions));
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
  const goals = data.goals.filter((g) => g.studentId === studentId && !g.archived);
  const groups = groupByLongTerm(goals);

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← {student.name}
        </button>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{student.name}'s goals</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {goals.length} short-term goal{goals.length === 1 ? "" : "s"} across {groups.length} long-term
          area{groups.length === 1 ? "" : "s"}
          {teacher ? ` · ${teacher.name}` : ""}
        </p>
      </div>

      {groups.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 14 }}
        >
          No goals yet for {student.name}.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((group, i) => (
            <div
              key={i}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {group.goals.map((goal) => (
                  <div
                    key={goal.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      background: "var(--color-background-secondary)",
                      borderRadius: "var(--border-radius-md)",
                    }}
                  >
                    <span style={{ fontSize: 13, flex: 1 }}>{goal.shortName}</span>
                    <UsageLabel usage={usage} goal={goal} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
      <Icon name="check" size={12} /> {count} session{count === 1 ? "" : "s"}
    </span>
  );
}
