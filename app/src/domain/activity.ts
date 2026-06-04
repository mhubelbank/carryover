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
// Resolved in CATALOG order (not the teacher's id order), so reordering the
// Activities catalog drives the order shown in Generate.
export function resolveActivities(teacher: Teacher, catalog: Activity[]): Activity[] {
  const ids = new Set(teacher.activityIds);
  return catalog.filter((a) => ids.has(a.id));
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
  // For the ad-hoc "Other" the free text IS the description (the name never
  // appears). `freeTextIsDescription` is kept as a fallback for already-saved
  // data, but the behavior is now driven by the reserved id.
  if (activity.id === RESERVED_OTHER_ID || activity.freeTextIsDescription) return info;
  return info ? `${activity.name} ${info}` : activity.name;
}

// Whether a catalog activity's descriptionTemplate should apply for this
// student: no required attribute, or the student has a non-empty value for it
// (a non-empty string, a true toggle, or a non-empty multi-select array).
export function attributeSatisfied(activity: Activity, student: Student): boolean {
  if (!activity.requiresAttribute) return true;
  const v = student.fields?.[activity.requiresAttribute];
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  return Boolean(v);
}

// Madlib split/join for the catalog editor. The stored model is a
// `descriptionTemplate` string with an optional `{student.<attr>}` placeholder
// plus `requiresAttribute`; the editor presents it as before / {attr} / after.
// These are inverse: parse(activity) → parts, build(parts) → stored fields.
export function parseDescriptionTemplate(activity: Activity): {
  attr: string;
  before: string;
  after: string;
} {
  const attr = activity.requiresAttribute ?? "";
  const tpl = activity.descriptionTemplate ?? "";
  if (!attr) return { attr: "", before: tpl, after: "" };
  // Match `{student.<attr>}` with or without a trailing filter (e.g. `| join: ", "`).
  const m = new RegExp(`\\{\\s*student\\.${attr}\\s*(?:\\|[^}]*)?\\}`).exec(tpl);
  if (!m) return { attr, before: tpl, after: "" };
  return { attr, before: tpl.slice(0, m.index).trim(), after: tpl.slice(m.index + m[0].length).trim() };
}

export function buildDescriptionTemplate(
  attr: string,
  before: string,
  after: string,
): { descriptionTemplate: string | undefined; requiresAttribute: string | undefined } {
  const b = before.trim();
  const a = after.trim();
  // No attribute → a fixed description shared by all students (just the text).
  if (!attr) return { descriptionTemplate: b || undefined, requiresAttribute: undefined };
  // The attribute is a multi-select (string[]), so join its values for prose.
  const tpl = [b, `{student.${attr} | join: ", "}`, a].filter((p) => p !== "").join(" ");
  return { descriptionTemplate: tpl, requiresAttribute: attr };
}
