import type { Activity, Teacher } from "./teacher";

// A configurable student attribute (data/student-fields.json). `toggle` holds a
// boolean; `select` is a MULTI-select holding a string[] (a student can have
// several values, e.g. Spanish + Bengali). `key` is a stable identifier used as
// the CSV column header and in `{student.key}` template/condition references;
// it is immutable after creation. `label` is the editable display name.
export interface StudentField {
  key: string;
  label: string;
  type: "toggle" | "select";
  options?: string[];
}

// Base Student columns (and legacy aliases) a custom field key must not shadow —
// they'd collide in the CSV header and the flattened eval context.
export const RESERVED_STUDENT_KEYS = new Set([
  "id",
  "name",
  "firstName",
  "middle",
  "lastName",
  "pronouns",
  "teacherId",
  "birthday",
  "age",
  "nextIepReview",
  "nextTriennial",
  "mandate",
  "firstDay",
  "lastDay",
  "archived",
  "fields",
]);

// A field key must be a safe identifier (usable as `{student.key}` — no dots —
// and a CSV header) and must not shadow a base column.
export function isValidFieldKey(key: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && !RESERVED_STUDENT_KEYS.has(key);
}

// Per-field usage: activities whose descriptionTemplate requires it, plus
// teachers whose session captures reference `student.<key>`. Powers the
// "used by N" warning when deleting a field.
export function studentFieldRefCounts(
  fieldKeys: string[],
  teachers: Teacher[],
  activities: Activity[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of fieldKeys) {
    if (!key) {
      counts.set(key, 0); // a not-yet-named field references nothing
      continue;
    }
    // Word-boundary match so `lang` doesn't count `student.language`.
    const re = new RegExp(`student\\.${key}\\b`);
    let n = activities.filter((a) => a.requiresAttribute === key).length;
    n += teachers.filter((t) => re.test(JSON.stringify(t.sessionCaptures ?? []))).length;
    counts.set(key, n);
  }
  return counts;
}
