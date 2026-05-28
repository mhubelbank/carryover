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
