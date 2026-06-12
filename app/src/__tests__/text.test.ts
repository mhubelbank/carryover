import { describe, it, expect } from "vitest";
import {
  normalizeAcronyms,
  pronounMismatches,
  dropSelfCorrection,
  splitConcessive,
  streamlineLostClinicalDetail,
  missingSupportTerms,
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
