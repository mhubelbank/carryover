import { parseDate, startOfDay } from "./dates";

export interface Student {
  id: string;
  firstName: string;
  // Middle name / initial / suffix — used as a collision tiebreaker on the same
  // teacher's caseload. Optional (empty for most students).
  middle: string;
  lastName: string;
  pronouns: string;
  // Optional emoji avatar (shown on a brown circle). Empty = initial fallback.
  emoji: string;
  teacherId: string;
  // YYYY-MM-DD. When present, `age` is computed from this; otherwise the legacy
  // stored `age` is shown as a fallback.
  birthday: string | null;
  // Legacy fallback for students entered before birthdays were tracked. New
  // students should rely on `birthday`; preserved on load so existing ages
  // aren't lost during the transition.
  age: number | null;
  nextIepReview: string | null;
  nextTriennial: string | null;
  mandate: string | null;
  // Optional enrollment window. Students outside this window are skipped from
  // Today's session lists; past-`lastDay` triggers a "ready to archive" hint.
  firstDay: string | null;
  lastDay: string | null;
  archived: boolean;
  // Configurable per-student attributes, keyed by StudentField.key. A toggle
  // value is a boolean; a select value is a string[] (multi-select). Drives
  // teacher session-captures + post-processing in the Generate pipeline.
  fields: Record<string, string | boolean | string[]>;
  // Explicit session-form defaults that pre-fill each activity's prompting /
  // redirection / response inputs in Generate. Empty arrays = no default;
  // editable per session and clearable on the Student page.
  defaultPromptingLevel: string[];
  defaultPromptingType: string[];
  defaultRedirection: string[];
  defaultResponse: string[];
}

// The student object flattened for condition/template evaluation: custom field
// values are lifted to top level so `student.needsBengali` / `{student.journalMethod}`
// / `student.language` resolve directly (the keys never shadow base columns).
export function studentContext(student: Student): Record<string, unknown> {
  return { ...student, ...student.fields };
}

export type AgeFlag = "ok" | "warn" | "alert";

// NY eligibility: 21 is the final eligible year (warn); 22+ is a likely data
// error or a COVID-era extension worth verifying (alert).
export function ageFlag(age: number | null): AgeFlag {
  if (age == null) return "ok";
  if (age >= 22) return "alert";
  if (age >= 21) return "warn";
  return "ok";
}

// Full display name: "First Middle Last", with empty parts collapsed.
export function fullName(s: Pick<Student, "firstName" | "middle" | "lastName">): string {
  return [s.firstName, s.middle, s.lastName]
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .join(" ");
}

// Compact display name for table/list rendering. Disambiguates progressively
// against `peers`: first name → "First L." → full "First Last" → include middle.
// Pass active peers only (archived students don't collide).
export function displayName(student: Student, peers: Student[]): string {
  const first = student.firstName.trim();
  if (first === "") return fullName(student) || "Unknown";
  const others = peers.filter((p) => p.id !== student.id);
  const sameFirst = others.filter((p) => p.firstName.trim() === first);
  if (sameFirst.length === 0) return first;

  const lastInitial = (student.lastName.trim().charAt(0) || "").toUpperCase();
  const sameInitial = sameFirst.filter(
    (p) => (p.lastName.trim().charAt(0) || "").toUpperCase() === lastInitial,
  );
  const withInitial = lastInitial === "" ? first : `${first} ${lastInitial}.`;
  if (sameInitial.length === 0) return withInitial;

  const last = student.lastName.trim();
  const sameFull = sameInitial.filter((p) => p.lastName.trim() === last);
  const withLast = last === "" ? withInitial : `${first} ${last}`;
  if (sameFull.length === 0) return withLast;

  // Still ambiguous — fall back to including middle. Last-ditch tiebreaker.
  return fullName(student);
}

// Years from birthday to `now` (defaults to today). Falls back to the legacy
// stored `age` when no birthday is set.
export function computedAge(student: Student, now: Date = new Date()): number | null {
  if (student.birthday) {
    const dob = parseDate(student.birthday);
    if (!dob) return student.age;
    const today = startOfDay(now);
    let years = today.getFullYear() - dob.getFullYear();
    const before =
      today.getMonth() < dob.getMonth() ||
      (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
    if (before) years -= 1;
    return years;
  }
  return student.age;
}

// Past their last day in the active term, given today's date. Used to suggest
// archiving departed students.
export function isDeparted(student: Student, now: Date = new Date()): boolean {
  if (!student.lastDay) return false;
  const last = parseDate(student.lastDay);
  if (!last) return false;
  return startOfDay(now).getTime() > last.getTime();
}

// Before their first day. Used so Today's session list doesn't include a student
// who hasn't started yet.
export function isPreEnrollment(student: Student, now: Date = new Date()): boolean {
  if (!student.firstDay) return false;
  const first = parseDate(student.firstDay);
  if (!first) return false;
  return startOfDay(now).getTime() < first.getTime();
}

// Whether a student should appear in session lookups / Today on the given date.
// Wraps the archived + enrollment-window checks.
export function isActiveOn(student: Student, date: Date): boolean {
  if (student.archived) return false;
  if (isPreEnrollment(student, date)) return false;
  if (isDeparted(student, date)) return false;
  return true;
}
