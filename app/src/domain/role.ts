import type { Role, Teacher } from "./teacher";

// A teacher's news-day roles, resolved from the shared catalog. Dangling ids
// (a role deleted from the catalog while still referenced) are dropped.
export function resolveRoles(teacher: Teacher, catalog: Role[]): Role[] {
  const byId = new Map(catalog.map((r) => [r.id, r] as const));
  return teacher.newsRoleIds.map((id) => byId.get(id)).filter((r): r is Role => r != null);
}

// How many teachers reference each catalog role id. Powers the "used by N
// teachers" warning when deleting from the catalog editor.
export function roleRefCounts(teachers: Teacher[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of teachers) {
    for (const id of t.newsRoleIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
