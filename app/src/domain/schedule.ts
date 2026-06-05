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

// Convert a bare clock time to minutes since midnight, treating 1–7 o'clock as
// PM. The school day runs from ~8am into the early afternoon, so "1:10" means
// 13:10, not 1:10am — without this, afternoon blocks sort/position before 8am.
function clockToMinutes(h: number, m: number): number {
  const hour = h >= 1 && h <= 7 ? h + 12 : h;
  return hour * 60 + m;
}

// Start time of a slot label like "8:44-9:14" as minutes since midnight, for
// chronological sorting (lexical sort mis-orders "10:.." before "8:..").
export function slotStartMinutes(slot: string): number {
  const m = /(\d{1,2}):(\d{2})/.exec(slot);
  if (!m) return 0;
  return clockToMinutes(Number(m[1]), Number(m[2]));
}

// End time of a slot label (the last clock time in it). Falls back to the start
// when the label has only one time.
export function slotEndMinutes(slot: string): number {
  const matches = [...slot.matchAll(/(\d{1,2}):(\d{2})/g)];
  const last = matches[matches.length - 1];
  if (!last) return slotStartMinutes(slot);
  return clockToMinutes(Number(last[1]), Number(last[2]));
}

// Parse a free-typed time ("9", "12", "2", "9:15") into canonical minutes plus a
// normalized "H:MM" label, using the school 12-hour clock (1–7 read as PM).
// Returns null when it isn't a valid H or H:MM (hour 1–12, minute 0–59).
export function parseTimeInput(raw: string): { minutes: number; label: string } | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] === undefined ? 0 : Number(m[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  return {
    minutes: clockToMinutes(hour, minute),
    label: `${hour}:${String(minute).padStart(2, "0")}`,
  };
}

export function sortedTimeSlots(entries: ScheduleEntry[]): string[] {
  const slots = [...new Set(entries.map((e) => e.timeSlot))];
  return slots.sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
}

// Replace the roster of one (teacher, day, slot) cell within a full week's
// entries. Other cells are untouched; the named cell becomes exactly
// `studentIds` (order preserved). Used to diverge a week from the usual template
// when notes are generated for an adjusted roster.
export function setCellRoster(
  entries: ScheduleEntry[],
  teacherId: string,
  dayOfWeek: Weekday,
  timeSlot: string,
  studentIds: string[],
): ScheduleEntry[] {
  const others = entries.filter(
    (e) => !(e.teacherId === teacherId && e.dayOfWeek === dayOfWeek && e.timeSlot === timeSlot),
  );
  const cell = studentIds.map((studentId) => ({ teacherId, dayOfWeek, timeSlot, studentId }));
  return [...others, ...cell];
}

// Reduce a schedule to its time-slot structure: one marker per distinct (day,
// slot), keeping that slot's teacher but clearing students. Used to carry last
// term's slots into the new-term wizard, where the roster is picked fresh but the
// slot stays teacher-specific. Roster builders ignore these markers (the empty
// studentId matches no student); only the slot grid reads them.
export function emptySlotMarkers(entries: ScheduleEntry[]): ScheduleEntry[] {
  const seen = new Set<string>();
  const markers: ScheduleEntry[] = [];
  for (const e of entries) {
    const key = `${e.dayOfWeek}|${e.timeSlot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    markers.push({ teacherId: e.teacherId, dayOfWeek: e.dayOfWeek, timeSlot: e.timeSlot, studentId: "" });
  }
  return markers;
}

// Order-independent fingerprint for comparing two schedules (a week vs. the
// usual template) for divergence/convergence.
export function scheduleFingerprint(entries: ScheduleEntry[]): string {
  return entries
    .map((e) => `${e.teacherId}|${e.dayOfWeek}|${e.timeSlot}|${e.studentId}`)
    .sort()
    .join("\n");
}
