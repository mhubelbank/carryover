import { describe, it, expect } from "vitest";
import {
  normalizeAcronyms,
  fixClinicalSpelling,
  pronounMismatches,
  dropSelfCorrection,
  splitConcessive,
  streamlineLostClinicalDetail,
  missingSupportTerms,
  stripLeakedReasoning,
  hasLeakedReasoning,
  hasDroppedOpener,
} from "../domain/text";

describe("normalizeAcronyms", () => {
  it("upper-cases WH as a whole token, however typed", () => {
    expect(normalizeAcronyms("answered wh questions")).toBe("answered WH questions");
    expect(normalizeAcronyms("Wh and wh-questions")).toBe("WH and WH-questions");
  });

  it("leaves words that merely contain the letters alone", () => {
    expect(normalizeAcronyms("what is white, somewhat awhile")).toBe("what is white, somewhat awhile");
  });
});

describe("fixClinicalSpelling", () => {
  it("corrects common clinical misspellings, preserving capitalization", () => {
    expect(fixClinicalSpelling("They became disregulated.")).toBe("They became dysregulated.");
    expect(fixClinicalSpelling("Disregulation was noted; he was dysregular.")).toBe(
      "Dysregulation was noted; he was dysregulated.",
    );
  });

  it("leaves correct and unrelated words alone", () => {
    expect(fixClinicalSpelling("He was dysregulated during the regular activity.")).toBe(
      "He was dysregulated during the regular activity.",
    );
  });
});

describe("pronounMismatches", () => {
  it("flags a wrong-gender pronoun for a they/them student", () => {
    expect(pronounMismatches("Omar sorted the cards; he was distracted.", "they/them")).toEqual(["he"]);
    expect(pronounMismatches("They sorted the cards and stayed on task.", "they/them")).toEqual([]);
  });

  it("flags cross-gender pronouns but not the student's own", () => {
    expect(pronounMismatches("She read the passage; his answers were brief.", "she/her")).toEqual(["his"]);
    expect(pronounMismatches("He answered; her turn was next.", "he/him")).toEqual(["her"]);
  });

  it("never flags 'they' (may refer to classmates) and ignores substrings", () => {
    // "they" is allowed for a he/him student; "the" must not match "he".
    expect(pronounMismatches("He worked with peers and they applauded the segment.", "he/him")).toEqual([]);
  });

  it("returns nothing when pronouns are unset", () => {
    expect(pronounMismatches("He did the thing.", "")).toEqual([]);
  });
});

describe("dropSelfCorrection", () => {
  it("leaves a clean note untouched", () => {
    const note = "Alex sorted picture cards. He was distracted. This session built receptive language.";
    expect(dropSelfCorrection(note)).toBe(note);
  });

  it("drops the meta sentence and keeps the re-emitted (corrected) copy", () => {
    const v1 = "Alisia worked on writing the script. She was dysregular during the activity.";
    const v2 = "Alisia worked on writing the script. She was dysregulated during the activity.";
    const leaked = `${v1} Wait, I need to re-read the original and fix only the listed issues. ${v2}`;
    expect(dropSelfCorrection(leaked)).toBe(v2);
  });

  it("drops a trailing meta sentence when the note wasn't re-emitted", () => {
    const note = "Alex sorted picture cards. This session built receptive language.";
    expect(dropSelfCorrection(`${note} Let me reconsider whether that's right.`)).toBe(note);
  });
});

describe("splitConcessive", () => {
  it("splits a concessive-fused affect into its own sentence", () => {
    expect(
      splitConcessive("Alisia wrote the script given minimal prompting, though she was dysregulated throughout."),
    ).toBe("Alisia wrote the script given minimal prompting. She was dysregulated throughout.");
    expect(splitConcessive("He sorted cards, although they were distracted.")).toBe(
      "He sorted cards. They were distracted.",
    );
  });

  it("leaves legitimate 'though'/'while' and clean notes alone", () => {
    const legit = "She answered 3/5, though with prompting on the last two.";
    expect(splitConcessive(legit)).toBe(legit);
    const temporal = "He maintained attention while she presented the weather.";
    expect(splitConcessive(temporal)).toBe(temporal);
  });
});

describe("streamlineLostClinicalDetail", () => {
  const review = "Fabian chose the segment, given minimal tactile prompting and continuous redirection to task. This work built pragmatic language.";

  it("flags a dropped redirection clause", () => {
    const streamlined = "Fabian chose the segment, given minimal tactile prompting. This work built pragmatic language.";
    expect(streamlineLostClinicalDetail(review, streamlined)).toBe(true);
  });

  it("flags all prompting disappearing", () => {
    const streamlined = "Fabian chose the segment. This work built pragmatic language.";
    expect(streamlineLostClinicalDetail(review, streamlined)).toBe(true);
  });

  it("does not flag a legitimate prompting combine or an unchanged note", () => {
    const before = "He sorted cards given minimal verbal prompting and minimal visual prompting.";
    const combined = "He sorted cards given minimal verbal and visual prompting.";
    expect(streamlineLostClinicalDetail(before, combined)).toBe(false);
    expect(streamlineLostClinicalDetail(review, review)).toBe(false);
  });
});

describe("missingSupportTerms", () => {
  it("flags a level/type the session set but the note omits", () => {
    const note = "Imane chose the segment given visual prompting and redirection to task.";
    expect(missingSupportTerms(note, ["significant", "visual", "occasional"])).toEqual(["significant", "occasional"]);
  });

  it("returns nothing when all terms are present, and ignores 'no'", () => {
    const note = "He answered given significant visual prompting and occasional redirection to task.";
    expect(missingSupportTerms(note, ["significant", "visual", "occasional", "no"])).toEqual([]);
  });
});

describe("stripLeakedReasoning", () => {
  // The exact reasoning leak observed in the Claude pipeline eval (regular note
  // 1.10): a clean note, then a numbered self-critique, then two redrafts, with
  // "Wait —" and "I must not write Wait in output" meta — all separated by "---".
  const LEAK_1_10 =
    'Jordan produced target sounds in structured word and phrase drills given significant modeled prompting and continuous redirection to task, with a paraprofessional providing hand-over-hand support during the writing portion. She was engaged throughout. She then sorted picture cards into categories and explained the grouping. She correctly produced 7/8 target sounds given moderate visual prompting. She was alert but more fatigued than usual following a morning assessment. This work built expressive and receptive skills as she produced target sounds and sequenced picture cards to retell an event. --- Several issues need to be fixed: 1. "with a paraprofessional providing hand-over-hand support" — prompting/support must be introduced with "given," not "with." 2. The closing re-states activity verbs from the body — replace with a brief back-reference. 3. Closing is a re-statement of activity details already in the note body. 7. The closing names verbs which is banned. Replace with "This session" or "This work." --- Jordan produced target sounds in structured word and phrase drills given significant modeled prompting, continuous redirection to task, and hand-over-hand support from a paraprofessional during the writing portion. She was engaged throughout. She then sorted picture cards into categories and explained the grouping. She correctly produced 7/8 target sounds given moderate visual prompting. She was alert but more fatigued than usual following a morning assessment. This session developed expressive and receptive language as she practiced producing target sounds and retelling an event through picture sequencing. --- Wait — the closing still re-states activity verbs. Also I must not write "Wait" in output. Jordan produced target sounds in structured word and phrase drills. She correctly produced 7/8 target sounds given moderate visual prompting. This session developed expressive and receptive language, supporting her goals of producing target sounds and retelling events.';

  it("recovers a clean note from the observed 1.10 multi-redraft leak", () => {
    const out = stripLeakedReasoning(LEAK_1_10);
    expect(hasLeakedReasoning(out)).toBe(false);
    expect(out).not.toMatch(/Several issues|Wait|I must not|---/);
    expect(out.startsWith("Jordan produced target sounds")).toBe(true);
    expect(out).toContain("She correctly produced 7/8 target sounds given moderate visual prompting.");
    expect(out.length).toBeLessThan(LEAK_1_10.length);
  });

  it("strips a leading 'here is the note only:' commentary preamble glued to the note", () => {
    const leak =
      "I keep adding commentary. Here is the note only: Anasur asked for help on his SGD given minimal gestural prompting and occasional redirection to task. He was engaged throughout the activity.";
    const out = stripLeakedReasoning(leak);
    expect(hasLeakedReasoning(out)).toBe(false);
    expect(out.startsWith("Anasur asked for help on his SGD")).toBe(true);
    expect(out).not.toMatch(/commentary|Here is the note|I keep/i);
  });

  it("recovers when meta sentences are interspersed without a --- separator", () => {
    const leak =
      'Here is the revised note. Sam read a short passage and answered comprehension questions about it. He answered 3/5 WH questions given minimal verbal prompting. This session built receptive language.';
    const out = stripLeakedReasoning(leak);
    expect(out).not.toMatch(/Here is the revised/);
    expect(out).toContain("Sam read a short passage");
  });

  it("is a no-op on a clean note", () => {
    const clean =
      "Quinn read a short passage and answered comprehension questions about it. He correctly identified 3/5 main ideas given significant visual prompting. He was tired. This session built receptive language.";
    expect(stripLeakedReasoning(clean)).toBe(clean);
    expect(hasLeakedReasoning(clean)).toBe(false);
  });
});

describe("hasDroppedOpener", () => {
  it("flags a note whose opener was dropped and subject doubled", () => {
    expect(hasDroppedOpener("Tess She correctly identified 5/8 main ideas given significant verbal prompting.")).toBe(true);
  });
  it("does not flag a normal opening", () => {
    expect(hasDroppedOpener("Tess read a short passage and answered comprehension questions about it.")).toBe(false);
    expect(hasDroppedOpener("She read a short passage about it.")).toBe(false);
  });
});
