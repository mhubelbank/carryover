import type { Student } from "./student";
import type { Activity, Teacher } from "./teacher";

// The reserved ad-hoc activity. Always offered in the Generate dropdown
// regardless of a teacher's activityIds, and locked (undeletable) in the
// Activities tab. Free text replaces the name as the description.
export const RESERVED_OTHER_ID = "other";

const FALLBACK_OTHER: Activity = {
  id: RESERVED_OTHER_ID,
  name: "Other",
  freeText: true,
  freeTextIsDescription: true,
};

export function catalogById(catalog: Activity[]): Map<string, Activity> {
  return new Map(catalog.map((a) => [a.id, a] as const));
}

// A teacher's activities, resolved from the shared catalog. Dangling ids (an
// activity deleted from the catalog while still referenced) are dropped.
export function resolveActivities(teacher: Teacher, catalog: Activity[]): Activity[] {
  const byId = catalogById(catalog);
  return teacher.activityIds.map((id) => byId.get(id)).filter((a): a is Activity => a != null);
}

// The activity options offered in the Generate form: the teacher's resolved
// catalog activities, plus the reserved "Other" entry (deduped). Falls back to
// a synthesized "Other" if the catalog doesn't define one yet (pre-migration).
export function activityOptionsForGenerate(teacher: Teacher, catalog: Activity[]): Activity[] {
  const resolved = resolveActivities(teacher, catalog);
  if (resolved.some((a) => a.id === RESERVED_OTHER_ID)) return resolved;
  const other = catalog.find((a) => a.id === RESERVED_OTHER_ID) ?? FALLBACK_OTHER;
  return [...resolved, other];
}

// How many teachers reference each catalog activity id. Powers the
// "used by N teachers" warning when deleting from the Activities tab.
export function activityRefCounts(teachers: Teacher[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of teachers) {
    for (const id of t.activityIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// The default activity description (before any descriptionTemplate / session
// capture rewrite). For `freeTextIsDescription` activities (the reserved
// "Other") the free text IS the description; otherwise free text augments the
// name. Returns "" when an ad-hoc activity has no text — caller drops the row.
export function defaultDescription(activity: Activity, additionalInfo: string): string {
  const info = additionalInfo.trim();
  if (activity.freeTextIsDescription) return info;
  return info ? `${activity.name} ${info}` : activity.name;
}

// Whether a catalog activity's descriptionTemplate should apply for this
// student: no required attribute, or the student has a truthy value for it.
export function attributeSatisfied(activity: Activity, student: Student): boolean {
  if (!activity.requiresAttribute) return true;
  const v = (student as unknown as Record<string, unknown>)[activity.requiresAttribute];
  if (typeof v === "string") return v.trim() !== "";
  return Boolean(v);
}
