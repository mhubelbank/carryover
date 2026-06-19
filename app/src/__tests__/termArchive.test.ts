import { describe, it, expect } from "vitest";
import { archiveKey, type ArchivedTerm } from "../domain/term";
import { upsertTermHistory } from "../domain/data";

const term = (over: Partial<ArchivedTerm> = {}): ArchivedTerm => ({
  termType: "school-year",
  firstDay: "2025-09-04",
  lastDay: "2026-06-26",
  label: "School Year 2025–2026",
  ...over,
});

describe("archiveKey", () => {
  it("identifies a term by type + first day (stable across finishedOn/label)", () => {
    expect(archiveKey(term())).toBe("school-year_2025-09-04");
    expect(archiveKey({ termType: "summer", firstDay: "2026-07-06" })).toBe("summer_2026-07-06");
    // finishedOn / label don't change the key
    expect(archiveKey(term({ finishedOn: "2026-06-30", label: "Renamed" }))).toBe(
      "school-year_2025-09-04",
    );
  });
});

describe("upsertTermHistory archiveKey handling", () => {
  it("carries the archiveKey when first filed", () => {
    const next = upsertTermHistory([], term({ archiveKey: "school-year_2025-09-04" }));
    expect(next).toHaveLength(1);
    expect(next[0]!.archiveKey).toBe("school-year_2025-09-04");
  });

  it("preserves an existing archiveKey/snapshot when a later upsert lacks them", () => {
    const base = upsertTermHistory([], term({ archiveKey: "k1", snapshot: { finishedOn: "x", students: [], teachers: [] } }));
    // A subsequent snapshot-less/key-less upsert of the same term must not drop them.
    const next = upsertTermHistory(base, term({ finishedOn: "2026-06-30" }));
    expect(next).toHaveLength(1);
    expect(next[0]!.archiveKey).toBe("k1");
    expect(next[0]!.snapshot).toBeTruthy();
    expect(next[0]!.finishedOn).toBe("2026-06-30");
  });

  it("appends a different term rather than merging", () => {
    const base = upsertTermHistory([], term({ archiveKey: "k1" }));
    const next = upsertTermHistory(base, term({ termType: "summer", firstDay: "2026-07-06", label: "Summer 2026", archiveKey: "k2" }));
    expect(next).toHaveLength(2);
    expect(next.map((t) => t.archiveKey)).toEqual(["k1", "k2"]);
  });
});
