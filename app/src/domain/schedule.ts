export type Weekday = "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday";

export const WEEKDAYS: Weekday[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

export interface ScheduleEntry {
  teacherId: string;
  dayOfWeek: Weekday;
  timeSlot: string;
  studentId: string;
}

// Start time of a slot label like "8:44 – 9:14" as minutes since midnight, for
// chronological sorting (lexical sort mis-orders "10:.." before "8:..").
export function slotStartMinutes(slot: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(slot);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function sortedTimeSlots(entries: ScheduleEntry[]): string[] {
  const slots = [...new Set(entries.map((e) => e.timeSlot))];
  return slots.sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
}
