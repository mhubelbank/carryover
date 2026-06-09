import { describe, it, expect } from "vitest";
import { goalMeasuredAction, groupByLongTerm, type Goal } from "../domain/goal";
import { goalUsageCounts } from "../domain/session";
import type { SessionMetadata } from "../domain/session";

describe("goalMeasuredAction", () => {
  it("joins verb + noun, trimming, and is empty when unset", () => {
    expect(goalMeasuredAction({ measuredVerb: "answer", measuredNoun: "wh questions" })).toBe("answer wh questions");
    expect(goalMeasuredAction({ measuredVerb: "", measuredNoun: "" })).toBe("");
  });
});

describe("groupByLongTerm", () => {
  it("groups goals under their long-term goal in first-seen order", () => {
    const goals = [
      { id: "a", longTermGoal: "LTG1" },
      { id: "b", longTermGoal: "LTG2" },
      { id: "c", longTermGoal: "LTG1" },
    ] as unknown as Goal[];
    const groups = groupByLongTerm(goals);
    expect(groups.map((g) => g.longTermGoal)).toEqual(["LTG1", "LTG2"]);
    expect(groups[0]!.goals.map((g) => g.id)).toEqual(["a", "c"]);
  });
});

describe("goalUsageCounts", () => {
  it("counts the number of distinct sessions each goal was targeted in", () => {
    const sessions = [
      { date: "d1", teacherId: "t", students: [{ studentId: "s1", goalIds: ["g1", "g2"], mode: "regular" }] },
      { date: "d2", teacherId: "t", students: [{ studentId: "s1", goalIds: ["g1"], mode: "regular" }] },
    ] as unknown as SessionMetadata[];
    const counts = goalUsageCounts(sessions);
    expect(counts.get("g1")).toBe(2);
    expect(counts.get("g2")).toBe(1);
  });
});
