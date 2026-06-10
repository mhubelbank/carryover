import { describe, it, expect } from "vitest";
import { normalizeAcronyms, pronounMismatches } from "../domain/text";

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
