import { describe, it, expect } from "vitest";
import { regularContext, type RenderedActivity } from "../domain/generate";
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
