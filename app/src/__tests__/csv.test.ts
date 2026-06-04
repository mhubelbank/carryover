import { describe, it, expect } from "vitest";
import { serializeCsv, parseCsv } from "../domain/csv";

describe("CSV round-trip", () => {
  it("preserves commas, quotes, and embedded newlines through serialize → parse", () => {
    const csv = serializeCsv(
      ["a", "b"],
      [
        ["x,y", 'he said "hi"'],
        ["line1\nline2", "z"],
      ],
    );
    expect(parseCsv(csv)).toEqual([
      { a: "x,y", b: 'he said "hi"' },
      { a: "line1\nline2", b: "z" },
    ]);
  });
});
