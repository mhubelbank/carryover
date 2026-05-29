// Date-only helpers. Inputs are "YYYY-MM-DD" strings parsed to local-time
// dates (not UTC) so a date never appears to shift across the day boundary.

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return new Date(year, month - 1, day);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });

// "Wednesday, May 28"
export function formatLong(date: Date): string {
  return LONG.format(date);
}

// "May 28"
export function formatShort(date: Date): string {
  return SHORT.format(date);
}

// "Wednesday"
export function weekdayName(date: Date): string {
  return WEEKDAY.format(date);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Whole calendar days from `from` to `to` (positive when `to` is later).
export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDays(date: Date, n: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6;
}

// Snap to the next weekday (Mon–Fri); unchanged if already a weekday. The
// schedule only has Mon–Fri, so the Today view never dwells on a weekend.
export function toWeekday(date: Date): Date {
  let d = date;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

// Step ±1 day, skipping weekends (Fri → Mon and back).
export function stepWeekday(date: Date, dir: 1 | -1): Date {
  let d = addDays(date, dir);
  while (isWeekend(d)) d = addDays(d, dir);
  return d;
}

// The Monday of the week containing `date`. Used as the stable key for a week's
// schedule file (toISODate(mondayOf(date))).
export function mondayOf(date: Date): Date {
  const day = date.getDay(); // 0 = Sun, 1 = Mon, … 6 = Sat
  const back = day === 0 ? 6 : day - 1; // Sunday belongs to the prior week
  return addDays(startOfDay(date), -back);
}

// "May 25 – 29" for a week starting at `monday`. Spans Mon–Fri (the school week).
export function formatWeekRange(monday: Date): string {
  return `${formatShort(monday)} – ${formatShort(addDays(monday, 4))}`;
}
