import { describe, it, expect } from "vitest";
import { dayEvents } from "../domain/events";
import type { Student } from "../domain/student";

// 2026-06-12 is a Friday; 06-13 is Saturday, 06-14 Sunday.
function student(birthday: string): Student {
  return {
    id: "s_1",
    firstName: "Theo",
    middle: "",
    lastName: "Bauer",
    pronouns: "he/him",
    emoji: "",
    teacherId: "t_1",
    birthday,
    age: null,
    nextIepReview: null,
    nextTriennial: null,
    mandate: null,
    firstDay: null,
    lastDay: null,
    archived: false,
    fields: {},
    defaultPromptingLevel: [],
    defaultPromptingType: [],
    defaultRedirection: [],
    defaultResponse: [],
  };
}

describe("dayEvents weekend birthdays", () => {
  it("surfaces a Saturday birthday on the Friday before, tagged Sat", () => {
    const e = dayEvents([student("2015-06-13")], "2026-06-12");
    expect(e).toEqual([{ kind: "birthday", studentId: "s_1", firstName: "Theo", weekend: "Sat" }]);
  });

  it("surfaces a Sunday birthday on the Friday before, tagged Sun", () => {
    const e = dayEvents([student("2015-06-14")], "2026-06-12");
    expect(e[0]?.weekend).toBe("Sun");
  });

  it("shows a birthday plainly on its own day, with no weekend tag", () => {
    const e = dayEvents([student("2015-06-13")], "2026-06-13");
    expect(e).toEqual([{ kind: "birthday", studentId: "s_1", firstName: "Theo" }]);
  });

  it("does not surface weekend birthdays on a non-Friday weekday", () => {
    expect(dayEvents([student("2015-06-13")], "2026-06-11")).toEqual([]);
  });
});
