import { describe, it, expect } from "vitest";
import { normalizeAcronyms } from "../domain/text";

describe("normalizeAcronyms", () => {
  it("upper-cases WH as a whole token, however typed", () => {
    expect(normalizeAcronyms("answered wh questions")).toBe("answered WH questions");
    expect(normalizeAcronyms("Wh and wh-questions")).toBe("WH and WH-questions");
  });

  it("leaves words that merely contain the letters alone", () => {
    expect(normalizeAcronyms("what is white, somewhat awhile")).toBe("what is white, somewhat awhile");
  });
});
