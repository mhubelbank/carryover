import { describe, it, expect } from "vitest";
import { regularContext, repairPromptingTypes, type RenderedActivity } from "../domain/generate";
import { trialToken } from "../domain/trial";
import type { Teacher } from "../domain/teacher";

const teacher: Teacher = {
  id: "t1",
  name: "Carter",
  color: "purple",
  modes: ["regular"],
  activityIds: [],
  newsRoleIds: [],
  sessionCaptures: [],
  archived: false,
};

const activity = (trials: string): RenderedActivity => ({
  description: "did a thing",
  segmentName: "",
  domains: "expressive",
  goals: "answer wh questions",
  goalDetails: "",
  longTermGoals: "",
  trials,
  promptingLevel: "",
  promptingType: "",
  redirection: "",
  response: "",
  additionalNotes: "",
});

describe("regularContext trial tokenization", () => {
  it("swaps each non-empty trial sentence for an indexed token and maps it back", () => {
    const ctx = regularContext({
      studentName: "Sam",
      pronouns: "he/him",
      pronoun: "he",
      individualSession: false,
      teacher,
      activities: [activity("Sam correctly answered WH questions 6/10 given minimal verbal prompting."), activity("")],
    });
    const activities = ctx.activities as RenderedActivity[];
    expect(activities[0]!.trials).toBe(trialToken(0));
    expect(activities[1]!.trials).toBe(""); // no trials → untouched, no token
    expect(ctx.trialReplacements).toEqual({
      [trialToken(0)]: "Sam correctly answered WH questions 6/10 given minimal verbal prompting.",
    });
  });
});

describe("repairPromptingTypes", () => {
  it("restores a dropped type into the single prompting clause (the Angel case)", () => {
    const note =
      "Angel watched the broadcast and completed a worksheet, given verbal and visual prompting with regular redirection to task. He was alert throughout.";
    const out = repairPromptingTypes(note, ["verbal", "visual", "tactile"]);
    expect(out).toContain("given verbal, visual, and tactile prompting with regular redirection to task");
  });

  it("preserves a leading level word", () => {
    const note = "Sam sorted the cards given minimal verbal and tactile prompting.";
    expect(repairPromptingTypes(note, ["verbal", "visual", "tactile"])).toContain(
      "given minimal verbal, visual, and tactile prompting.",
    );
  });

  it("is a no-op when all required types are present", () => {
    const note = "Sam sorted the cards given verbal, visual, and tactile prompting.";
    expect(repairPromptingTypes(note, ["verbal", "visual", "tactile"])).toBe(note);
  });

  it("does nothing when there are two prompting clauses (ambiguous attribution)", () => {
    const note =
      "Sam read a passage given verbal and visual prompting. He then sorted cards given verbal and visual prompting.";
    expect(repairPromptingTypes(note, ["verbal", "visual", "tactile"])).toBe(note);
  });

  it("replaces hallucinated/substituted types with the activity's exact single type (the Angel case)", () => {
    const note =
      "Angel watched the broadcast and completed a worksheet, given verbal and visual prompting and regular redirection to task.";
    const out = repairPromptingTypes(note, ["tactile"]);
    expect(out).toContain("given tactile prompting and regular redirection to task");
    expect(out).not.toMatch(/verbal|visual/);
  });

  it("is a no-op when the single type already matches", () => {
    const note = "Sam sorted the cards given tactile prompting.";
    expect(repairPromptingTypes(note, ["tactile"])).toBe(note);
  });

  it("is a no-op when no required types are given", () => {
    const note = "Sam sorted the cards given verbal prompting.";
    expect(repairPromptingTypes(note, [])).toBe(note);
  });
});
