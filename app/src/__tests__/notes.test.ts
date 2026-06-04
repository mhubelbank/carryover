import { describe, it, expect } from "vitest";
import { renderTemplate, splitWarnings } from "../domain/notes";

describe("renderTemplate", () => {
  it("interpolates vars, nested paths, and the join/default filters", () => {
    const out = renderTemplate("Hi {{name}} ({{a.b}}) {{tags | join: \", \"}} {{missing | default: \"none\"}}", {
      name: "Sam",
      a: { b: "x" },
      tags: ["one", "two"],
    });
    expect(out).toBe("Hi Sam (x) one, two none");
  });

  it("handles if/else by truthiness (empty string + empty array are falsy)", () => {
    const t = "{{#if v}}yes{{else}}no{{/if}}";
    expect(renderTemplate(t, { v: "x" })).toBe("yes");
    expect(renderTemplate(t, { v: "  " })).toBe("no");
    expect(renderTemplate(t, { v: [] })).toBe("no");
    expect(renderTemplate(t, { v: [1] })).toBe("yes");
  });

  it("iterates each with this and @index_plus_one", () => {
    const out = renderTemplate("{{#each items}}{{@index_plus_one}}:{{this}} {{/each}}", {
      items: ["a", "b"],
    });
    expect(out).toBe("1:a 2:b ");
  });
});

describe("splitWarnings", () => {
  it("splits the note from a [[WARNINGS]] block into bullet lines", () => {
    const r = splitWarnings("The note body.\n[[WARNINGS]]\n- one\n- two");
    expect(r.note).toBe("The note body.");
    expect(r.warnings).toEqual(["one", "two"]);
  });

  it("returns the whole text and no warnings when the marker is absent", () => {
    const r = splitWarnings("Just a note.");
    expect(r.note).toBe("Just a note.");
    expect(r.warnings).toEqual([]);
  });
});
