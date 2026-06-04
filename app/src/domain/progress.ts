// Per-goal trial progress over time, derived from saved session metadata. Pure
// (no I/O) so it's easy to test. Powers the student Progress view.
import type { SessionMetadata } from "./session";

const num = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

// One session's aggregated trial result for a single goal (summed across any
// activities in that session that targeted the goal).
export interface GoalSessionPoint {
  date: string; // YYYY-MM-DD
  total: number;
  successful: number; // successes at any support level
  independent: number; // successes with "no support"
  accuracyPct: number; // successful / total
  independencePct: number; // independent / total
  failed: number; // total − successful
  byLevel: Record<string, number>; // successes per support level
  byType: Record<string, number>; // successes per prompt type (a trial may count >1)
  // type -> level -> count, for the session×type support grid.
  typeLevel: Record<string, Record<string, number>>;
}

export interface GoalProgress {
  goalId: string;
  points: GoalSessionPoint[]; // chronological (oldest first)
}

// Build per-goal chronological progress for one student from all sessions.
// Sessions with no trials for the goal (or a zero total) are skipped.
export function studentGoalProgress(
  sessions: SessionMetadata[],
  studentId: string,
): Map<string, GoalProgress> {
  // goalId -> date -> running aggregate
  interface Acc {
    total: number;
    byLevel: Record<string, number>;
    byType: Record<string, number>;
    typeLevel: Record<string, Record<string, number>>;
  }
  const byGoal = new Map<string, Map<string, Acc>>();
  for (const session of sessions) {
    const entry = session.students.find((s) => s.studentId === studentId);
    if (!entry?.trials) continue;
    for (const t of entry.trials) {
      if (!t.goalId) continue;
      const total = num(t.total);
      if (total <= 0) continue;
      const dates = byGoal.get(t.goalId) ?? new Map<string, Acc>();
      const acc = dates.get(session.date) ?? { total: 0, byLevel: {}, byType: {}, typeLevel: {} };
      acc.total += total;
      for (const r of t.rows ?? []) {
        const c = num(r.count);
        if (c <= 0) continue;
        acc.byLevel[r.level] = (acc.byLevel[r.level] ?? 0) + c;
        for (const ty of r.types ?? []) {
          acc.byType[ty] = (acc.byType[ty] ?? 0) + c;
          acc.typeLevel[ty] = acc.typeLevel[ty] ?? {};
          acc.typeLevel[ty][r.level] = (acc.typeLevel[ty][r.level] ?? 0) + c;
        }
      }
      dates.set(session.date, acc);
      byGoal.set(t.goalId, dates);
    }
  }

  const out = new Map<string, GoalProgress>();
  for (const [goalId, dates] of byGoal) {
    const points = [...dates.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([date, a]) => {
        const successful = Object.values(a.byLevel).reduce((s, n) => s + n, 0);
        const independent = a.byLevel["no support"] ?? 0;
        return {
          date,
          total: a.total,
          successful,
          independent,
          accuracyPct: Math.round((successful / a.total) * 100),
          independencePct: Math.round((independent / a.total) * 100),
          failed: Math.max(0, a.total - successful),
          byLevel: a.byLevel,
          byType: a.byType,
          typeLevel: a.typeLevel,
        };
      });
    out.set(goalId, { goalId, points });
  }
  return out;
}

export interface OverallPoint {
  date: string;
  accuracyPct: number;
  independencePct: number;
}

// Aggregate trend across ALL of a student's goals: per session date, pool every
// goal's trials that day (trial-weighted) into one accuracy / independence.
export function overallTrend(progress: Map<string, GoalProgress>): OverallPoint[] {
  const byDate = new Map<string, { total: number; successful: number; independent: number }>();
  for (const gp of progress.values()) {
    for (const p of gp.points) {
      const a = byDate.get(p.date) ?? { total: 0, successful: 0, independent: 0 };
      a.total += p.total;
      a.successful += p.successful;
      a.independent += p.independent;
      byDate.set(p.date, a);
    }
  }
  return [...byDate.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
    .map(([date, a]) => ({
      date,
      accuracyPct: a.total ? Math.round((a.successful / a.total) * 100) : 0,
      independencePct: a.total ? Math.round((a.independent / a.total) * 100) : 0,
    }));
}
