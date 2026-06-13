import type { Student } from "./student";
import { addDays, parseDate, toISODate } from "./dates";

// Date-anchored markers shown on both the Schedule (per day-column) and Today
// (for the selected day). Kept here so the two views compute identical events.
export type CalendarEventKind = "iep" | "first-day" | "last-day" | "birthday";

export interface CalendarEvent {
  kind: CalendarEventKind;
  studentId: string;
  firstName: string;
  // For a birthday that lands on the weekend, surfaced on the Friday before — which
  // day it actually is. Absent for events shown on their own day.
  weekend?: "Sat" | "Sun";
}

// Events falling on a given ISO date (YYYY-MM-DD): IEP review, enrollment
// first/last day, and birthday. Birthdays recur yearly, so they match on month-day
// and ignore the birth year. On a Friday, birthdays landing on the upcoming Sat/Sun
// are surfaced too (there are no weekend columns/sessions). Archived students skip.
export function dayEvents(students: Student[], iso: string): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const date = parseDate(iso);
  const isFriday = date?.getDay() === 5;
  const satMd = isFriday && date ? toISODate(addDays(date, 1)).slice(5) : null;
  const sunMd = isFriday && date ? toISODate(addDays(date, 2)).slice(5) : null;
  const md = iso.slice(5);
  for (const s of students) {
    if (s.archived) continue;
    if (s.nextIepReview === iso) events.push({ kind: "iep", studentId: s.id, firstName: s.firstName });
    if (s.firstDay === iso) events.push({ kind: "first-day", studentId: s.id, firstName: s.firstName });
    if (s.lastDay === iso) events.push({ kind: "last-day", studentId: s.id, firstName: s.firstName });
    const bd = s.birthday ? s.birthday.slice(5) : null;
    if (!bd) continue;
    if (bd === md) events.push({ kind: "birthday", studentId: s.id, firstName: s.firstName });
    else if (satMd && bd === satMd) events.push({ kind: "birthday", studentId: s.id, firstName: s.firstName, weekend: "Sat" });
    else if (sunMd && bd === sunMd) events.push({ kind: "birthday", studentId: s.id, firstName: s.firstName, weekend: "Sun" });
  }
  return events;
}
