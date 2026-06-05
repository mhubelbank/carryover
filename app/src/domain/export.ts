import { goalsToCsv, scheduleToCsv, studentsToCsv, type TermData } from "./data";
import type { ZipEntry } from "../clients/download";
import type { Sheet } from "../clients/xlsx";
import type { CachedNote } from "../clients/noteCache";
import { formatLong, parseDate } from "./dates";
import { groupByLongTerm } from "./goal";
import { WEEKDAYS, slotStartMinutes } from "./schedule";
import { computedAge, fullName } from "./student";

// One JSON blob mirroring the repo's editable data — a portable backup she can
// keep or re-import later. Versioned so a future importer can detect the shape.
export function backupJson(data: TermData): string {
  const payload = {
    format: "sesis-notes-backup",
    version: 1,
    term: data.term,
    teachers: data.teachers,
    students: data.students,
    goals: data.goals,
    schedule: data.schedule,
    activities: data.activities,
    newsRoles: data.newsRoles,
    studentFields: data.studentFields,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// The repo's data files, ready to zip: CSVs in the same shape the app writes
// (so they round-trip), plus the JSON catalogs.
export function csvBundleEntries(data: TermData): ZipEntry[] {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return [
    { name: "students.csv", content: studentsToCsv(data.students, data.studentFields) },
    { name: "goals.csv", content: goalsToCsv(data.goals) },
    { name: "schedule.csv", content: scheduleToCsv(data.schedule) },
    { name: "teachers.json", content: json(data.teachers) },
    { name: "activities.json", content: json(data.activities) },
    { name: "news-roles.json", content: json(data.newsRoles) },
    { name: "student-fields.json", content: json(data.studentFields) },
    { name: "term.json", content: json(data.term) },
  ];
}

// --- Excel workbook mirroring Emily's "SESIS Sample Input.xlsx" (3 sheets) ---

// Schedule: weekday columns, each a chronological list of time-block headers
// followed by the students stacked under them, with a blank row between blocks
// (non-student activity columns like PREP / Breakfast-Lunch are out of scope).
function scheduleSheet(data: TermData): Sheet {
  const nameById = new Map(data.students.map((s) => [s.id, fullName(s)]));
  // Per weekday: ordered slots → student names.
  const columns = WEEKDAYS.map((day) => {
    const slots = new Map<string, string[]>();
    for (const e of data.schedule) {
      if (e.dayOfWeek !== day) continue;
      const list = slots.get(e.timeSlot) ?? [];
      // Keep empty-slot markers as an empty row (slot exists, no students yet).
      if (e.studentId) list.push(nameById.get(e.studentId) ?? e.studentId);
      slots.set(e.timeSlot, list);
    }
    const ordered = [...slots.entries()].sort(
      (a, b) => slotStartMinutes(a[0]) - slotStartMinutes(b[0]),
    );
    const cells: string[] = [];
    for (const [slot, names] of ordered) {
      cells.push(slot, ...names, "");
    }
    return cells;
  });
  const height = Math.max(0, ...columns.map((c) => c.length));
  const rows: string[][] = [["Emily's Speech Therapy Schedule"], [...WEEKDAYS]];
  for (let r = 0; r < height; r++) rows.push(columns.map((c) => c[r] ?? ""));
  return { name: "Schedule", rows };
}

// IEP Dates: one row per active student. Dates are written as plain ISO text
// (not Excel serials) so the export is human-readable.
function iepSheet(data: TermData): Sheet {
  const rows: string[][] = [
    ["ID", "First Name", "Age", "Projected IEP Date", "Projected Triennial Date", "Mandate"],
  ];
  for (const s of data.students.filter((s) => !s.archived)) {
    const age = computedAge(s) ?? s.age;
    rows.push([
      s.id,
      s.firstName,
      age == null ? "" : String(age),
      s.nextIepReview ?? "",
      s.nextTriennial ?? "",
      s.mandate ?? "",
    ]);
  }
  return { name: "IEP Dates", rows };
}

// Goals for All: per student, grouped by long-term goal. Teacher/name/AAC appear
// only on the student's first row; the LTG only on each group's first row; the
// short-term goal (we store the shortname) on every row — matching her layout.
function goalsSheet(data: TermData): Sheet {
  const teacherName = new Map(data.teachers.map((t) => [t.id, t.name]));
  // Best-effort AAC value from a student field whose key/label mentions "aac".
  const aacField = data.studentFields.find(
    (f) => /aac/i.test(f.key) || /aac/i.test(f.label ?? ""),
  );
  const aacOf = (s: (typeof data.students)[number]): string => {
    if (!aacField) return "";
    const v = s.fields[aacField.key];
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "boolean") return v ? "Yes" : "";
    return v ?? "";
  };

  const rows: string[][] = [
    ["Teacher and Class", "Student's Name", "Long Term Goal", "Short Term Goal", "AAC Device"],
  ];
  const active = data.students
    .filter((s) => !s.archived)
    .sort(
      (a, b) =>
        (teacherName.get(a.teacherId) ?? "").localeCompare(teacherName.get(b.teacherId) ?? "") ||
        fullName(a).localeCompare(fullName(b)),
    );
  for (const s of active) {
    const groups = groupByLongTerm(
      data.goals.filter((g) => g.studentId === s.id && !g.archived),
    );
    let firstStudentRow = true;
    for (const group of groups) {
      let firstGoalRow = true;
      for (const goal of group.goals) {
        rows.push([
          firstStudentRow ? teacherName.get(s.teacherId) ?? "" : "",
          firstStudentRow ? fullName(s) : "",
          firstGoalRow ? group.longTermGoal : "",
          goal.shortTermGoal.trim() || goal.shortName,
          firstStudentRow ? aacOf(s) : "",
        ]);
        firstStudentRow = false;
        firstGoalRow = false;
      }
    }
  }
  return { name: "Goals for All", rows };
}

export function workbookSheets(data: TermData): Sheet[] {
  return [scheduleSheet(data), iepSheet(data), goalsSheet(data)];
}

// Recent generated notes (from the local cache) as plain text, grouped by
// session (newest first). `notes` is expected pre-sorted newest-first.
export function recentNotesTxt(notes: CachedNote[]): string {
  const groups = new Map<string, CachedNote[]>();
  for (const n of notes) {
    const key = `${n.date}|${n.teacherId}|${n.timeSlot}`;
    const list = groups.get(key);
    if (list) list.push(n);
    else groups.set(key, [n]);
  }
  const blocks: string[] = [];
  for (const group of groups.values()) {
    const f = group[0]!;
    const d = parseDate(f.date);
    const header =
      `${d ? formatLong(d) : f.date}${f.timeSlot ? ` · ${f.timeSlot}` : ""} · ${f.teacherName}`;
    const body = group.map((n) => `${n.studentName}:\n${n.note}`).join("\n\n");
    blocks.push(`${header}\n${"=".repeat(header.length)}\n${body}`);
  }
  return `${blocks.join("\n\n\n")}\n`;
}

// A filesystem-safe slug from the term label, e.g. "School Year 2025–2026" →
// "school-year-2025-2026", for export filenames.
export function termSlug(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "term"
  );
}
