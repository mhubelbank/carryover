import { describe, it, expect } from "vitest";
import { buildStudentReport, goalRating, goalBaselineLine, goalSupportLine, reportText } from "../domain/report";
import type { Goal } from "../domain/goal";
import type { Student } from "../domain/student";
import type { SessionMetadata, SessionStudentEntry } from "../domain/session";
import type { TrialEntry, TrialSupportRow } from "../domain/trial";

const student = {
  id: "s1",
  firstName: "Maya",
  middle: "",
  lastName: "Rivera",
  pronouns: "she/her",
} as Student;

const goal = (id: string, ltg: string, extra: Partial<Goal> = {}): Goal => ({
  id,
  studentId: "s1",
  longTermGoal: ltg,
  shortTermGoal: `${id} short-term`,
  shortName: id.toUpperCase(),
  measuredVerb: "",
  measuredNoun: "",
  targetPercent: 0,
  targetLevel: "",
  archived: false,
  ...extra,
});

const goals: Goal[] = [
  goal("g1", "Expressive language", { targetPercent: 80, targetLevel: "minimal" }),
  goal("g2", "Expressive language"),
  goal("g3", "Pragmatics"),
];

const row = (level: string, count: string): TrialSupportRow => ({ level, types: [], count });
const trial = (goalId: string, total: string, rows: TrialSupportRow[]): TrialEntry => ({
  goalId,
  verb: "",
  noun: "",
  total,
  rows,
  failed: "",
});
const entry = (e: Partial<SessionStudentEntry>): SessionStudentEntry => ({
  studentId: "s1",
  goalIds: [],
  mode: "regular",
  ...e,
});
const sess = (date: string, students: SessionStudentEntry[]): SessionMetadata => ({
  date,
  teacherId: "t1",
  students,
});

const sessions: SessionMetadata[] = [
  // Out of range — must be excluded from a 2026 report.
  sess("2025-12-01", [entry({ trials: [trial("g1", "10", [row("no support", "1")])] })]),
  sess("2026-01-10", [
    entry({ trials: [trial("g1", "10", [row("no support", "4")])], quals: [{ goalId: "g3", promptLevel: "moderate" }] }),
  ]),
  sess("2026-02-10", [
    entry({ trials: [trial("g1", "10", [row("no support", "7")])], quals: [{ goalId: "g3", promptLevel: "minimal" }] }),
  ]),
];

describe("buildStudentReport", () => {
  const report = buildStudentReport(student, goals, sessions, "2026-01-01", "2026-12-31");

  it("groups goals by long-term goal in order", () => {
    expect(report.groups.map((g) => g.longTermGoal)).toEqual(["Expressive language", "Pragmatics"]);
    expect(report.groups[0]!.goals.map((s) => s.goal.id)).toEqual(["g1", "g2"]);
  });

  it("computes start→current deltas from the first and last in-range sessions", () => {
    const g1 = report.groups[0]!.goals[0]!;
    expect(g1.accuracy).toEqual({ start: 40, current: 70, delta: 30 });
    expect(g1.independence).toEqual({ start: 40, current: 70, delta: 30 });
    // target 80% at minimal-or-better; all successes were "no support" → met = independence
    expect(g1.criterionMet).toEqual({ start: 40, current: 70, delta: 30 });
    expect(g1.sessionCount).toBe(2);
    expect(g1.qual).toBeNull();
  });

  it("leaves goals with no in-range data empty", () => {
    const g2 = report.groups[0]!.goals[1]!;
    expect(g2.sessionCount).toBe(0);
    expect(g2.accuracy).toBeNull();
  });

  it("summarizes trial-less goals as a support trend", () => {
    const g3 = report.groups[1]!.goals[0]!;
    expect(g3.accuracy).toBeNull();
    // moderate → 50, minimal → 75 (independence proxy)
    expect(g3.qual?.support).toEqual({ start: 50, current: 75, delta: 25 });
    expect(g3.sessionCount).toBe(2);
  });

  it("counts distinct in-range session dates and a pooled overall trend", () => {
    expect(report.sessionCount).toBe(2);
    expect(report.overall?.accuracy).toEqual({ start: 40, current: 70, delta: 30 });
  });

  it("excludes sessions outside the range", () => {
    const narrow = buildStudentReport(student, goals, sessions, "2026-02-01", "2026-12-31");
    const g1 = narrow.groups[0]!.goals[0]!;
    expect(g1.sessionCount).toBe(1);
    expect(g1.accuracy).toEqual({ start: 70, current: 70, delta: 0 });
  });
});

describe("goalRating", () => {
  const report = buildStudentReport(student, goals, sessions, "2026-01-01", "2026-12-31");
  it("rates an improving-but-below-target trial goal as On track", () => {
    // g1 criterion-met 40→70, target 80 → not met, improving
    expect(goalRating(report.groups[0]!.goals[0]!)).toEqual({ label: "On track", tone: "on-track" });
  });
  it("rates a goal with no data as Not yet addressed", () => {
    expect(goalRating(report.groups[0]!.goals[1]!)).toEqual({ label: "Not yet addressed", tone: "none" });
  });
  it("rates an improving qual goal as On track", () => {
    expect(goalRating(report.groups[1]!.goals[0]!)).toEqual({ label: "On track", tone: "on-track" });
  });
  it("rates a reached-criterion goal as Met", () => {
    const met = buildStudentReport(
      student,
      [goal("gm", "Expressive language", { targetPercent: 60, targetLevel: "no support" })],
      [sess("2026-03-01", [entry({ trials: [trial("gm", "10", [row("no support", "8")])] })])],
      "2026-01-01",
      "2026-12-31",
    );
    expect(goalRating(met.groups[0]!.goals[0]!)).toEqual({ label: "Met", tone: "met" });
  });
});

describe("support-type reliance", () => {
  const typed = buildStudentReport(
    student,
    [goal("gt", "Expressive language", { targetPercent: 80, targetLevel: "minimal" })],
    [
      sess("2026-02-01", [
        entry({
          trials: [
            { goalId: "gt", verb: "", noun: "", total: "10", failed: "", rows: [
              { level: "minimal", types: ["tactile"], count: "5" },
              { level: "minimal", types: ["verbal"], count: "2" },
            ] },
          ],
        }),
      ]),
      sess("2026-03-01", [
        entry({
          trials: [
            { goalId: "gt", verb: "", noun: "", total: "10", failed: "", rows: [
              { level: "minimal", types: ["verbal"], count: "6" },
              { level: "minimal", types: ["visual"], count: "2" },
            ] },
          ],
        }),
      ]),
    ],
    "2026-01-01",
    "2026-12-31",
  );
  const s = typed.groups[0]!.goals[0]!;
  it("ranks cue types by reliance and tracks the dominant-cue shift", () => {
    // totals: verbal 8, tactile 5, visual 2
    expect(s.support?.typesRanked).toEqual(["verbal", "tactile", "visual"]);
    expect(s.support?.counts).toEqual({ verbal: 8, tactile: 5, visual: 2 });
    expect(s.support?.dominant).toBe("verbal");
    expect(s.support?.baselineDominant).toBe("tactile"); // first session: tactile 5 > verbal 2
    expect(s.support?.currentDominant).toBe("verbal"); // last session: verbal 6 > visual 2
  });
  it("renders a support-used line", () => {
    expect(goalSupportLine(s)).toBe("Support used: verbal, tactile, visual");
  });
  it("is null when no cues were used (fully independent)", () => {
    const indep = buildStudentReport(
      student,
      [goal("gi", "Expressive language")],
      [sess("2026-02-01", [entry({ trials: [trial("gi", "10", [row("no support", "9")])] })])],
      "2026-01-01",
      "2026-12-31",
    );
    expect(indep.groups[0]!.goals[0]!.support).toBeNull();
  });
});

describe("goalBaselineLine", () => {
  const report = buildStudentReport(student, goals, sessions, "2026-01-01", "2026-12-31");
  it("frames a target goal as baseline→current(target)", () => {
    expect(goalBaselineLine(report.groups[0]!.goals[0]!)).toBe(
      "Baseline 40% → Current 70% (Target 80% at minimal or better)",
    );
  });
  it("frames a qual goal by support proxy", () => {
    expect(goalBaselineLine(report.groups[1]!.goals[0]!)).toBe(
      "Baseline 50% → Current 75% support (from prompting)",
    );
  });
  it("returns empty for a goal with no data", () => {
    expect(goalBaselineLine(report.groups[0]!.goals[1]!)).toBe("");
  });
});

describe("reportText", () => {
  it("renders a plain-text document with header, summary, and per-goal narratives", () => {
    const report = buildStudentReport(student, goals, sessions, "2026-01-01", "2026-12-31");
    const text = reportText(
      student,
      report,
      { summary: "Maya made steady progress.", goals: { g1: "Maya improved on wh- questions." } },
      "School Year 2026",
    );
    expect(text).toContain("Maya Rivera — Speech-Language Progress Report");
    expect(text).toContain("School Year 2026");
    expect(text).toContain("Maya made steady progress.");
    expect(text).toContain("LONG-TERM GOAL: Expressive language");
    expect(text).toContain("Maya improved on wh- questions.");
    // per-goal rating + baseline framing
    expect(text).toContain("[On track]");
    expect(text).toContain("Baseline 40% → Current 70% (Target 80% at minimal or better)");
    // g2 has no data (but the report does) → rated, no extra line
    expect(text).toContain("[Not yet addressed]");
  });

  it("says it once when nothing was logged in range, not per goal", () => {
    const empty = buildStudentReport(student, goals, sessions, "2030-01-01", "2030-12-31");
    const text = reportText(student, empty, { summary: "", goals: {} }, "Custom range");
    expect(text).toContain("No trials or prompting were logged for Maya");
    expect(text).not.toContain("[Not yet addressed]");
    expect(text).not.toContain("LONG-TERM GOAL:");
  });
});
