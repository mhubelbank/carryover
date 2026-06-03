import { addDays, parseDate, toISODate } from "./dates";
import type { Student } from "./student";
import { fullName } from "./student";
import type { Teacher, Mode } from "./teacher";
import type { Goal } from "./goal";

export type TermType = "school-year" | "summer";

// Grace window after a term's last day before it auto-archives. Gives Emily time
// to finish it herself (or extend the dates) before the app does it for her.
export const TERM_ARCHIVE_GRACE_DAYS = 14;

// The ISO date on/after which an unfinished term auto-archives, or null if it has
// no valid last day.
export function autoArchiveDueDate(term: Term): string | null {
  const last = parseDate(term.lastDay);
  return last ? toISODate(addDays(last, TERM_ARCHIVE_GRACE_DAYS)) : null;
}

// True once an active (unfinished) term is past its grace window. `today` is an
// ISO date; ISO strings compare lexicographically.
export function isAutoArchiveDue(term: Term, today: string): boolean {
  if (term.finishedOn) return false;
  const due = autoArchiveDueDate(term);
  return !!due && today >= due;
}

export interface Term {
  termType: TermType;
  firstDay: string;
  lastDay: string;
  label: string;
  // ISO dates (YYYY-MM-DD) within the term with no school (holidays, snow days),
  // marked manually from Today. Absent = none.
  closures?: string[];
  // ISO date the term was finished (archived to history). Absent while the term
  // is still active; set by "Finish term". Distinct from `lastDay` (the scheduled
  // end) — `finishedOn` is when Emily actually closed it out.
  finishedOn?: string;
}

// A frozen, self-contained snapshot of a term's caseload, captured when the term
// is finished. Denormalized (teacher names and goal text inlined) so a past term
// still reads correctly even after the live students/teachers/goals files change.
export interface TermSnapshot {
  // ISO date the snapshot was taken (the term's finish date).
  finishedOn: string;
  students: StudentSnapshot[];
  teachers: TeacherSnapshot[];
}

export interface StudentSnapshot {
  id: string;
  name: string;
  pronouns: string;
  teacherId: string;
  // Denormalized classroom name for this term (the teacher may be renamed or
  // archived later; this preserves who they were with).
  teacherName: string;
  birthday: string | null;
  // Service mandate (frequency) as it stood — clinical context for the term.
  mandate: string | null;
  // Long-term goal texts worked on this term, in first-seen order.
  goals: string[];
  // Enrollment window within the term, when the student joined late / left early.
  firstDay: string | null;
  lastDay: string | null;
  // Left before the term ended — archived during the term, or `lastDay` passed.
  exited: boolean;
}

export interface TeacherSnapshot {
  id: string;
  name: string;
  modes: Mode[];
  // Caseload size under this teacher in the snapshot.
  studentCount: number;
}

// A past term plus, when available, its end-of-term snapshot. History entries
// archived before snapshots existed have no `snapshot`.
export interface ArchivedTerm extends Term {
  snapshot?: TermSnapshot;
}

// Capture the caseload as it stands at term end. Includes every student on the
// caseload during the term — all active students, plus students archived during
// this term (a `lastDay` on or after the term's first day). Students archived in
// a prior term are excluded. ISO date strings sort lexicographically, so plain
// `>=`/`<` comparisons are correct for YYYY-MM-DD.
export function buildTermSnapshot(
  term: Term,
  students: Student[],
  teachers: Teacher[],
  goals: Goal[],
  finishedOn: string,
): TermSnapshot {
  const teacherName = new Map(teachers.map((t) => [t.id, t.name]));

  // Ordered, de-duplicated long-term goal texts per student.
  const goalsByStudent = new Map<string, string[]>();
  for (const g of goals) {
    if (g.archived) continue;
    const text = g.longTermGoal.trim();
    if (!text) continue;
    const list = goalsByStudent.get(g.studentId) ?? [];
    if (!list.includes(text)) list.push(text);
    goalsByStudent.set(g.studentId, list);
  }

  const onCaseload = students.filter((s) =>
    s.archived ? !!s.lastDay && s.lastDay >= term.firstDay : true,
  );

  const studentSnaps: StudentSnapshot[] = onCaseload.map((s) => ({
    id: s.id,
    name: fullName(s) || "Unknown",
    pronouns: s.pronouns,
    teacherId: s.teacherId,
    teacherName: teacherName.get(s.teacherId) ?? "",
    birthday: s.birthday,
    mandate: s.mandate,
    goals: goalsByStudent.get(s.id) ?? [],
    firstDay: s.firstDay,
    lastDay: s.lastDay,
    exited: s.archived || (!!s.lastDay && s.lastDay < finishedOn),
  }));

  // Teachers with someone on the snapshot caseload, plus any still-active teacher.
  const referenced = new Set(studentSnaps.map((s) => s.teacherId).filter(Boolean));
  const teacherSnaps: TeacherSnapshot[] = teachers
    .filter((t) => referenced.has(t.id) || !t.archived)
    .map((t) => ({
      id: t.id,
      name: t.name,
      modes: t.modes,
      studentCount: studentSnaps.filter((s) => s.teacherId === t.id).length,
    }));

  return { finishedOn, students: studentSnaps, teachers: teacherSnaps };
}

// Auto-label a term from its type and dates: "School Year 2026–2027" (or a
// single year if the dates don't span a boundary) / "Summer 2026".
export function termLabel(termType: TermType, firstDay: string, lastDay: string): string {
  const startYear = firstDay.slice(0, 4);
  const endYear = lastDay.slice(0, 4);
  if (termType === "summer") return startYear ? `Summer ${startYear}` : "Summer";
  if (startYear && endYear && startYear !== endYear) {
    return `School Year ${startYear}–${endYear}`;
  }
  return startYear ? `School Year ${startYear}` : "School Year";
}
