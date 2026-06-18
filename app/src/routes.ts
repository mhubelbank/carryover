import type { NavPage } from "./components/Nav";

// Single source of truth for the History-API routes. Kept in its own module so
// both App (the router) and link components can share it without a cycle.
export const NAV_PAGES: NavPage[] = [
  "today",
  "generate",
  "students",
  "teachers",
  "activities",
  "schedule",
  "settings",
];

export const pathForPage = (p: NavPage): string => `/${p}`;

// First path segment → page, if it's a known page (else null).
export function pageFromPath(path: string): NavPage | null {
  const seg = path.replace(/^\/+/, "").split("/")[0] ?? "";
  return (NAV_PAGES as string[]).includes(seg) ? (seg as NavPage) : null;
}

// Deep link to a student's detail/goals sub-view (so cmd/middle-click opens it in
// a new tab). App reads `?s=<id>&v=<view>` on the students page at load/popstate.
export function studentHref(id: string, view: "detail" | "goals" = "detail"): string {
  return `/students?s=${encodeURIComponent(id)}${view === "goals" ? "&v=goals" : ""}`;
}

// Deep link to a teacher's detail. App reads `?t=<id>` on the teachers page at
// load/popstate (mirrors studentHref).
export function teacherHref(id: string): string {
  return `/teachers?t=${encodeURIComponent(id)}`;
}
