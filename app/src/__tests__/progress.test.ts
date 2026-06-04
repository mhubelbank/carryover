import { describe, it, expect } from "vitest";
import { studentGoalProgress, overallTrend } from "../domain/progress";
import type { SessionMetadata } from "../domain/session";
import type { TrialEntry, TrialSupportRow } from "../domain/trial";

const r = (level: string, types: string[], count: string): TrialSupportRow => ({ level, types, count });
const te = (goalId: string, total: string, rows: TrialSupportRow[]): TrialEntry => ({
  goalId,
  verb: "answered",
  noun: "wh questions",
  total,
  rows,
  failed: "",
});
const sess = (date: string, trials: TrialEntry[]): SessionMetadata => ({
  date,
  teacherId: "t1",
  students: [{ studentId: "s1", goalIds: trials.map((x) => x.goalId), mode: "regular", trials }],
});

describe("studentGoalProgress", () => {
  it("builds chronological per-goal points, sums same-day activities, and skips zero-total", () => {
    const sessions = [
      sess("2026-05-01", [te("g1", "10", [r("minimal", ["verbal"], "4")])]),
      sess("2026-05-08", [te("g1", "10", [r("no support", [], "4"), r("minimal", ["verbal"], "3")])]),
      // same date, two activities targeting g1 → one summed point (10 trials, 8 indep)
      sess("2026-05-15", [te("g1", "5", [r("no support", [], "5")]), te("g1", "5", [r("no support", [], "3")])]),
      sess("2026-05-22", [te("g1", "0", [])]), // zero total → no point
    ];
    const pts = studentGoalProgress(sessions, "s1").get("g1")!.points;
    expect(pts.map((p) => p.accuracyPct)).toEqual([40, 70, 80]);
    expect(pts.map((p) => p.independencePct)).toEqual([0, 40, 80]);
    expect(pts[0]!.failed).toBe(6);
    expect(pts[2]!.total).toBe(10);
  });
});

describe("overallTrend", () => {
  it("pools all goals per date (trial-weighted)", () => {
    const sessions = [
      sess("2026-05-01", [te("g1", "10", [r("minimal", ["verbal"], "4")]), te("g2", "10", [r("no support", [], "6")])]),
    ];
    expect(overallTrend(studentGoalProgress(sessions, "s1"))).toEqual([
      { date: "2026-05-01", accuracyPct: 50, independencePct: 30 },
    ]);
  });
});
