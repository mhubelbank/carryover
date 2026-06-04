import { describe, it, expect } from "vitest";
import { trialEntrySentence, expandEntryToEvents, eventsToPatch, type TrialEntry } from "../domain/trial";

const entry = (rows: TrialEntry["rows"], total: string, failed = ""): TrialEntry => ({
  goalId: "g",
  verb: "answered",
  noun: "wh questions",
  total,
  rows,
  failed,
});

describe("trialEntrySentence", () => {
  it("renders the data sentence verbatim with an auto-failed clause", () => {
    const s = trialEntrySentence("Sam", "he", entry([{ level: "minimal", types: ["verbal"], count: "6" }], "10"));
    expect(s).toBe(
      "Sam correctly answered wh questions 6/10 given minimal verbal prompting. He did not do so on 4/10 trials.",
    );
  });

  it("uses 'no support' phrasing and omits the failed clause at 100%", () => {
    const s = trialEntrySentence("Mia", "she", entry([{ level: "no support", types: [], count: "5" }], "5"));
    expect(s).toBe("Mia correctly answered wh questions 5/5 given no support.");
  });
});

describe("events <-> aggregate round-trip", () => {
  it("expandEntryToEvents then eventsToPatch reproduces total/rows/failed", () => {
    const events = expandEntryToEvents(entry([{ level: "minimal", types: ["verbal"], count: "6" }], "10"));
    expect(events.filter((e) => e.ok)).toHaveLength(6);
    expect(events.filter((e) => !e.ok)).toHaveLength(4); // auto: 10 − 6
    expect(eventsToPatch(events)).toEqual({
      total: "10",
      failed: "4",
      rows: [{ level: "minimal", types: ["verbal"], count: "6" }],
    });
  });
});
