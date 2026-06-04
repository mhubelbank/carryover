import { describe, it, expect } from "vitest";
import { parseDate, toISODate, addDays, daysBetween, mondayOf } from "../domain/dates";

describe("date helpers", () => {
  it("parses YYYY-MM-DD as a local date (no UTC day shift) and round-trips", () => {
    const d = parseDate("2026-03-15")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 15]);
    expect(toISODate(d)).toBe("2026-03-15");
    expect(parseDate("")).toBeNull();
    expect(parseDate("nope")).toBeNull();
  });

  it("adds days across a month boundary and counts whole days between", () => {
    expect(toISODate(addDays(parseDate("2026-03-30")!, 3))).toBe("2026-04-02");
    expect(daysBetween(parseDate("2026-03-15")!, parseDate("2026-03-18")!)).toBe(3);
  });

  it("mondayOf snaps to the week's Monday (Sunday belongs to the prior week)", () => {
    expect(toISODate(mondayOf(parseDate("2026-03-18")!))).toBe("2026-03-16"); // Wed → Mon
    expect(toISODate(mondayOf(parseDate("2026-03-15")!))).toBe("2026-03-09"); // Sun → prior Mon
  });
});
