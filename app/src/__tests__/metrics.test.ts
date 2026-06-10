import { describe, it, expect } from "vitest";
import { noteFlags } from "../__eval__/metrics";

describe("noteFlags", () => {
  const cleanClosing =
    "Alex sorted the cards. He answered 3/10 WH questions given verbal prompting. This session drew on receptive language as he made on-topic comments, advancing comprehension of grade-level texts.";

  it("flags an over-enumerated closing", () => {
    const note =
      "Alex did the activity. This session supported receptive, expressive, and pragmatic language by organizing categories, answering WH questions, identifying the main idea, and making on-topic comments while comprehending grade-level texts and participating in structured conversations.";
    expect(noteFlags(note, "he/him").bloatedClosing).toBe(true);
  });

  it("does not flag a concise woven closing", () => {
    const f = noteFlags(cleanClosing, "he/him");
    expect(f.bloatedClosing).toBe(false);
    expect(f.pronoun).toEqual([]);
  });

  it("detects 'addressed' filler and surfaces pronoun mismatches", () => {
    const note = "Theo collaborated with classmates. Throughout the session, this work addressed making on-topic comments.";
    const f = noteFlags(note, "they/them");
    expect(f.filler).toBe(true);
    expect(noteFlags("Omar sorted cards; he was distracted.", "they/them").pronoun).toEqual(["he"]);
  });
});
