import { describe, it, expect, vi } from "vitest";
import {
  trialEntrySentence,
  trialToken,
  spliceTrials,
  expandEntryToEvents,
  eventsToPatch,
  type TrialEntry,
} from "../domain/trial";

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
      "Sam correctly answered WH questions 6/10 given minimal verbal prompting. He did not do so on 4/10 trials.",
    );
  });

  it("uses 'no support' phrasing and omits the failed clause at 100%", () => {
    const s = trialEntrySentence("Mia", "she", entry([{ level: "no support", types: [], count: "5" }], "5"));
    expect(s).toBe("Mia correctly answered WH questions 5/5 given no support.");
  });
});

describe("spliceTrials", () => {
  it("replaces each token with its exact sentence", () => {
    const note = `Sam read a passage. ${trialToken(0)} It was good. ${trialToken(1)}`;
    const out = spliceTrials(note, { [trialToken(0)]: "A correctly did x 3/5.", [trialToken(1)]: "B." });
    expect(out).toBe("Sam read a passage. A correctly did x 3/5. It was good. B.");
  });

  it("appends a dropped token's sentence rather than losing it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = spliceTrials("Sam read a passage.", { [trialToken(0)]: "A correctly did x 3/5." });
    expect(out).toBe("Sam read a passage. A correctly did x 3/5.");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("strips a stray token that has no mapping", () => {
    expect(spliceTrials(`Note text ${trialToken(9)} here.`, {})).toBe("Note text here.");
  });

  it("fixes a token mis-placed after 'given' and a redundant trailing period", () => {
    const sentence = "Mia correctly sequenced picture cards 6/10 given moderate visual prompting. She did not do so on 4/10 trials.";
    const note = `Mia read a passage, given ${trialToken(0)}. She was engaged.`;
    const out = spliceTrials(note, { [trialToken(0)]: sentence });
    expect(out).toBe(`Mia read a passage. ${sentence} She was engaged.`);
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
