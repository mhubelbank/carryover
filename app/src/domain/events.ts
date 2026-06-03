import type { Student } from "./student";

// Date-anchored markers shown on both the Schedule (per day-column) and Today
// (for the selected day). Kept here so the two views compute identical events.
export type CalendarEventKind = "iep" | "first-day" | "last-day" | "birthday";

export interface CalendarEvent {
  kind: CalendarEventKind;
  studentId: string;
  firstName: string;
}

// Events falling on a given ISO date (YYYY-MM-DD): IEP review, enrollment
// first/last day, and birthday. Birthdays recur yearly, so they match on
// month-day and ignore the birth year. Archived students are skipped.
export function dayEvents(students: Student[], iso: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const s of students) {
    if (s.archived) continue;
    if (s.nextIepReview === iso) events.push({ kind: "iep", studentId: s.id, firstName: s.firstName });
    if (s.firstDay === iso) events.push({ kind: "first-day", studentId: s.id, firstName: s.firstName });
    if (s.lastDay === iso) events.push({ kind: "last-day", studentId: s.id, firstName: s.firstName });
    if (s.birthday && s.birthday.slice(5) === iso.slice(5))
      events.push({ kind: "birthday", studentId: s.id, firstName: s.firstName });
  }
  return events;
}
