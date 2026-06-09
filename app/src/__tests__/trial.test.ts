import { describe, it, expect, vi } from "vitest";
import {
  trialEntrySentence,
  trialSentence,
  trialToken,
  spliceTrials,
  limitMissSemicolons,
  expandEntryToEvents,
  eventsToPatch,
  type TrialData,
  type TrialEntry,
} from "../domain/trial";

const entry = (rows: TrialEntry["rows"], total: string, failed = ""): TrialEntry => ({
  goalId: "g",
  verb: "answer", // base form; conjugated to past for the success clause
  noun: "wh questions",
  total,
  rows,
  failed,
});

describe("trialSentence", () => {
  it("alternates the subject pronoun → name → … across entries", () => {
    const t: TrialData = {
      enabled: true,
      method: "summary",
      entries: [
        { ...entry([{ level: "minimal", types: ["verbal"], count: "6" }], "10"), verb: "identify", noun: "main ideas" },
        { ...entry([{ level: "moderate", types: ["visual"], count: "4" }], "5"), verb: "sequence", noun: "picture cards" },
      ],
    };
    expect(trialSentence("Quinn", "he", t)).toBe(
      "He correctly identified 6/10 main ideas given minimal verbal prompting. Quinn correctly sequenced 4/5 picture cards given moderate visual prompting.",
    );
  });
});

describe("trialEntrySentence", () => {
  it("conjugates the base verb, puts the count before the noun, and omits the miss for a single row", () => {
    const s = trialEntrySentence("Sam", "he", entry([{ level: "minimal", types: ["verbal"], count: "6" }], "10"));
    expect(s).toBe("Sam correctly answered 6/10 WH questions given minimal verbal prompting.");
  });

  it("uses 'no support' phrasing and no miss clause at 100%", () => {
    const s = trialEntrySentence("Mia", "she", entry([{ level: "no support", types: [], count: "5" }], "5"));
    expect(s).toBe("Mia correctly answered 5/5 WH questions given no support.");
  });

  it("lists 2 rows descending joined by 'and', with a miss clause (semicolon joiner here)", () => {
    const s = trialEntrySentence(
      "Omar",
      "he",
      entry(
        [
          { level: "minimal", types: ["verbal"], count: "3" },
          { level: "significant", types: ["verbal"], count: "4" },
        ],
        "10",
      ),
    );
    // The joiner is content-seeded (~2:1 period:semicolon); this entry hashes to a semicolon.
    expect(s).toBe(
      "Omar correctly answered 4/10 WH questions given significant verbal prompting and 3/10 given minimal verbal prompting; he did not answer 3/10 WH questions.",
    );
  });

  it("lists 3+ rows descending with an Oxford comma and a miss clause", () => {
    const s = trialEntrySentence(
      "Omar",
      "he",
      entry(
        [
          { level: "minimal", types: ["gestural"], count: "2" },
          { level: "significant", types: ["verbal"], count: "4" },
          { level: "moderate", types: ["verbal"], count: "3" },
        ],
        "10",
      ),
    );
    expect(s).toBe(
      "Omar correctly answered 4/10 WH questions given significant verbal prompting, 3/10 given moderate verbal prompting, and 2/10 given minimal gestural prompting. He did not answer 1/10 WH questions.",
    );
  });

  it("uses a provided pastForms map (e.g. from the LLM pass) over the rules", () => {
    const e = entry([{ level: "minimal", types: ["verbal"], count: "4" }], "5");
    expect(trialEntrySentence("Sam", "he", e, { answer: "responded" })).toBe(
      "Sam correctly responded 4/5 WH questions given minimal verbal prompting.",
    );
  });

  it("conjugates an irregular base verb correctly", () => {
    const e = { ...entry([{ level: "minimal", types: ["verbal"], count: "4" }], "5"), verb: "make", noun: "on-topic comments" };
    expect(trialEntrySentence("Noa", "they", e)).toBe(
      "Noa correctly made 4/5 on-topic comments given minimal verbal prompting.",
    );
  });

  it("conjugates an e-ending base verb correctly", () => {
    const e = { ...entry([{ level: "minimal", types: ["verbal"], count: "4" }], "5"), verb: "sequence", noun: "picture cards" };
    expect(trialEntrySentence("Mia", "she", e)).toBe(
      "Mia correctly sequenced 4/5 picture cards given minimal verbal prompting.",
    );
  });
});

describe("limitMissSemicolons", () => {
  it("keeps the first trial semicolon and demotes the rest to periods", () => {
    const note = "A read. He answered 4/5; he did not answer 1/5 questions. B sorted; she did not sort 1/5 cards.";
    expect(limitMissSemicolons(note)).toBe(
      "A read. He answered 4/5; he did not answer 1/5 questions. B sorted. She did not sort 1/5 cards.",
    );
  });

  it("demotes the trial semicolon when the prose already has one", () => {
    const note = "A read a passage; she was engaged. He answered 4/5; he did not answer 1/5 questions.";
    expect(limitMissSemicolons(note)).toBe(
      "A read a passage; she was engaged. He answered 4/5. He did not answer 1/5 questions.",
    );
  });

  it("leaves a lone trial semicolon untouched", () => {
    const note = "Quinn read. He correctly sequenced 4/5; he did not sequence 1/5 picture cards.";
    expect(limitMissSemicolons(note)).toBe(note);
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

  it("drops an orphan 'prompting.' fragment the model left beside the token", () => {
    const sentence = "Sam correctly sequenced 3/8 picture cards given moderate verbal prompting.";
    const note = `Sam read a passage. ${trialToken(0)} prompting. He was tired.`;
    expect(spliceTrials(note, { [trialToken(0)]: sentence })).toBe(
      `Sam read a passage. ${sentence} He was tired.`,
    );
  });

  it("drops an orphan 'given prompting' clause with no level or type", () => {
    expect(spliceTrials("Sam read a passage given prompting. He was tired.", {})).toBe(
      "Sam read a passage. He was tired.",
    );
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
