import { describe, it, expect } from "vitest";
import { renderTemplate } from "../domain/notes";

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
