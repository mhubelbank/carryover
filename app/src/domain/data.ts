import type { GitHubClient } from "../clients/github";
import { parseCsv, serializeCsv } from "./csv";
import type { Goal } from "./goal";
import type { IepReview } from "./iep";
import type { ScheduleEntry, Weekday } from "./schedule";
import type { SessionMetadata } from "./session";
import type { Student } from "./student";
import type { Teacher } from "./teacher";
import type { Term } from "./term";

export interface TermData {
  term: Term;
  teachers: Teacher[];
  students: Student[];
  goals: Goal[];
  schedule: ScheduleEntry[];
}

// Blob shas of each loaded file, needed to safely overwrite on save.
export interface FileShas {
  term?: string;
  teachers?: string;
  students?: string;
  goals?: string;
  schedule?: string;
}

export interface LoadedTerm {
  data: TermData;
  shas: FileShas;
}

const PATHS = {
  term: "data/term.json",
  teachers: "data/teachers.json",
  students: "data/students.csv",
  goals: "data/goals.csv",
  schedule: "data/schedule.csv",
} as const;

const SESSIONS_DIR = "data/sessions";

// students.csv columns, in order. Legacy `name` and old per-teacher quirk
// columns are read at load (see toStudent) but no longer written.
const STUDENT_COLUMNS = [
  "id",
  "firstName",
  "middle",
  "lastName",
  "pronouns",
  "teacherId",
  "birthday",
  "age",
  "aacDevice",
  "nextIepReview",
  "nextTriennial",
  "mandate",
  "firstDay",
  "lastDay",
  "archived",
  "needsSpanish",
  "needsBengali",
  "journalMethod",
];

// Loads the full term bundle. Returns null when there's no term.json yet —
// the signal for the first-run / empty state.
export async function loadTermData(client: GitHubClient): Promise<LoadedTerm | null> {
  const termFile = await client.readFile(PATHS.term);
  if (!termFile) return null;
  const term = JSON.parse(termFile.text) as Term;

  const [teachersFile, studentsFile, goalsFile, scheduleFile] = await Promise.all([
    client.readFile(PATHS.teachers),
    client.readFile(PATHS.students),
    client.readFile(PATHS.goals),
    client.readFile(PATHS.schedule),
  ]);

  return {
    data: {
      term,
      teachers: teachersFile ? (JSON.parse(teachersFile.text) as unknown[]).map(toTeacher) : [],
      students: studentsFile ? parseCsv(studentsFile.text).map(toStudent) : [],
      goals: goalsFile ? parseCsv(goalsFile.text).map(toGoal) : [],
      schedule: scheduleFile ? parseCsv(scheduleFile.text).map(toScheduleEntry) : [],
    },
    shas: {
      term: termFile.sha,
      teachers: teachersFile?.sha,
      students: studentsFile?.sha,
      goals: goalsFile?.sha,
      schedule: scheduleFile?.sha,
    },
  };
}

export function studentsToCsv(students: Student[]): string {
  const rows = students.map((s) => [
    s.id,
    s.firstName,
    s.middle,
    s.lastName,
    s.pronouns,
    s.teacherId,
    s.birthday ?? "",
    s.age == null ? "" : String(s.age),
    s.aacDevice ?? "",
    s.nextIepReview ?? "",
    s.nextTriennial ?? "",
    s.mandate ?? "",
    s.firstDay ?? "",
    s.lastDay ?? "",
    s.archived ? "true" : "false",
    s.needsSpanish ? "true" : "false",
    s.needsBengali ? "true" : "false",
    s.journalMethod,
  ]);
  return serializeCsv(STUDENT_COLUMNS, rows);
}

// Writes students.csv; returns the new blob sha for the next safe overwrite.
export function writeStudents(
  client: GitHubClient,
  students: Student[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(PATHS.students, studentsToCsv(students), "data: update students", sha);
}

const GOAL_COLUMNS = ["id", "studentId", "longTermGoal", "shortName", "archived"];

export function goalsToCsv(goals: Goal[]): string {
  const rows = goals.map((g) => [
    g.id,
    g.studentId,
    g.longTermGoal,
    g.shortName,
    g.archived ? "true" : "false",
  ]);
  return serializeCsv(GOAL_COLUMNS, rows);
}

// Writes goals.csv; returns the new blob sha for the next safe overwrite.
export function writeGoals(
  client: GitHubClient,
  goals: Goal[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(PATHS.goals, goalsToCsv(goals), "data: update goals", sha);
}

// Writes term.json; returns the new blob sha for the next safe overwrite.
export function writeTerm(
  client: GitHubClient,
  term: Term,
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(PATHS.term, `${JSON.stringify(term, null, 2)}\n`, "data: update term", sha);
}

// Writes teachers.json; returns the new blob sha for the next safe overwrite.
export function writeTeachers(
  client: GitHubClient,
  teachers: Teacher[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.teachers,
    `${JSON.stringify(teachers, null, 2)}\n`,
    "data: update teachers",
    sha,
  );
}

const SCHEDULE_COLUMNS = ["teacherId", "dayOfWeek", "timeSlot", "studentId"];

export function scheduleToCsv(entries: ScheduleEntry[]): string {
  const rows = entries.map((e) => [e.teacherId, e.dayOfWeek, e.timeSlot, e.studentId]);
  return serializeCsv(SCHEDULE_COLUMNS, rows);
}

// Writes schedule.csv (the usual/template schedule); returns the new blob sha.
export function writeSchedule(
  client: GitHubClient,
  entries: ScheduleEntry[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(PATHS.schedule, scheduleToCsv(entries), "data: update schedule", sha);
}

// Per-week deviation files live under data/schedule/<week-monday>.csv. They only
// exist for weeks that diverge from the usual template (written lazily on edit).
export function weekSchedulePath(weekKey: string): string {
  return `data/schedule/${weekKey}.csv`;
}

export interface LoadedWeekSchedule {
  entries: ScheduleEntry[];
  sha: string;
}

// Reads a week's deviation file. Returns null when the week hasn't diverged —
// the caller then falls back to the usual template.
export async function loadWeekSchedule(
  client: GitHubClient,
  weekKey: string,
): Promise<LoadedWeekSchedule | null> {
  const file = await client.readFile(weekSchedulePath(weekKey));
  if (!file) return null;
  return { entries: parseCsv(file.text).map(toScheduleEntry), sha: file.sha };
}

// Writes a week's full-snapshot deviation file; returns the new blob sha.
export function writeWeekSchedule(
  client: GitHubClient,
  weekKey: string,
  entries: ScheduleEntry[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    weekSchedulePath(weekKey),
    scheduleToCsv(entries),
    `data: update schedule for week of ${weekKey}`,
    sha,
  );
}

// Removes a week's deviation file, reverting that week to the usual template.
export function deleteWeekSchedule(
  client: GitHubClient,
  weekKey: string,
  sha: string,
): Promise<void> {
  return client.deleteFile(
    weekSchedulePath(weekKey),
    `data: reset week of ${weekKey} to usual schedule`,
    sha,
  );
}

// Loads every session-metadata file. Safe when sessions/ is missing (-> []).
// Used for goal usage counts; the volume is one file per (date, teacher).
export async function loadSessions(client: GitHubClient): Promise<SessionMetadata[]> {
  const entries = await client.listDir(SESSIONS_DIR);
  const files = entries.filter((e) => e.type === "file" && e.name.endsWith(".json"));
  const contents = await Promise.all(files.map((e) => client.readFile(e.path)));
  const sessions: SessionMetadata[] = [];
  for (const file of contents) {
    if (!file) continue;
    try {
      sessions.push(JSON.parse(file.text) as SessionMetadata);
    } catch {
      // Skip a malformed session file rather than failing the whole view.
    }
  }
  return sessions;
}

export function sessionPath(date: string, teacherId: string): string {
  return `${SESSIONS_DIR}/${date}-${teacherId}.json`;
}

export interface LoadedSession {
  metadata: SessionMetadata;
  sha: string;
}

// One session's metadata (for prefilling the Generate form / safe overwrite).
export async function loadSession(
  client: GitHubClient,
  date: string,
  teacherId: string,
): Promise<LoadedSession | null> {
  const file = await client.readFile(sessionPath(date, teacherId));
  if (!file) return null;
  try {
    return { metadata: JSON.parse(file.text) as SessionMetadata, sha: file.sha };
  } catch {
    return null;
  }
}

// Persists session metadata (date, teacher, per-student goals + mode) — never
// the note narrative. Returns the new blob sha.
export function writeSessionMetadata(
  client: GitHubClient,
  metadata: SessionMetadata,
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    sessionPath(metadata.date, metadata.teacherId),
    `${JSON.stringify(metadata, null, 2)}\n`,
    `data: session ${metadata.date} ${metadata.teacherId}`,
    sha,
  );
}

// Per-student append-only IEP review log. Most recent first. [] when absent.
export async function loadIepHistory(
  client: GitHubClient,
  studentId: string,
): Promise<IepReview[]> {
  const file = await client.readFile(`data/iep-history/${studentId}.jsonl`);
  if (!file) return [];
  const reviews: IepReview[] = [];
  for (const line of file.text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      reviews.push(JSON.parse(trimmed) as IepReview);
    } catch {
      // Skip a malformed line rather than failing the whole timeline.
    }
  }
  return reviews.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// Normalize a raw teacher record from teachers.json — handles older shapes that
// predate `sessionCaptures` (still on disk on the data branch) and drops the
// retired `perStudentFields` field so the in-memory type matches.
function toTeacher(raw: unknown): Teacher {
  const t = (raw ?? {}) as Partial<Teacher> & { perStudentFields?: unknown };
  return {
    id: t.id ?? "",
    name: t.name ?? "",
    color: t.color ?? "blue",
    modes: t.modes ?? ["regular"],
    activities: t.activities ?? [],
    roles: t.roles ?? [],
    sessionCaptures: t.sessionCaptures ?? [],
    archived: t.archived === true,
    promptOverrides: t.promptOverrides,
  } as Teacher;
}

function toStudent(row: Record<string, string>): Student {
  // Migrate legacy single-`name` column into firstName/lastName on the fly.
  // The new schema's columns take precedence when present.
  let firstName = (row.firstName ?? "").trim();
  let lastName = (row.lastName ?? "").trim();
  if (!firstName && !lastName && row.name) {
    const parts = row.name.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  // Legacy per-student quirk fields lived as their own CSV columns (the
  // teacher-declared `fields` keys). Prefer first-class column when present;
  // otherwise fall back to any legacy column of the same name.
  const journalRaw = (row.journalMethod ?? "").trim();
  return {
    id: row.id ?? "",
    firstName,
    middle: (row.middle ?? "").trim(),
    lastName,
    pronouns: row.pronouns ?? "",
    teacherId: row.teacherId ?? "",
    birthday: blankToNull(row.birthday),
    age: numberOrNull(row.age),
    aacDevice: blankToNull(row.aacDevice),
    nextIepReview: blankToNull(row.nextIepReview),
    nextTriennial: blankToNull(row.nextTriennial),
    mandate: blankToNull(row.mandate),
    firstDay: blankToNull(row.firstDay),
    lastDay: blankToNull(row.lastDay),
    archived: isTrue(row.archived),
    needsSpanish: isTrue(row.needsSpanish),
    needsBengali: isTrue(row.needsBengali),
    journalMethod: journalRaw === "traced" || journalRaw === "wrote" ? journalRaw : "",
  };
}

function toGoal(row: Record<string, string>): Goal {
  return {
    id: row.id ?? "",
    studentId: row.studentId ?? "",
    longTermGoal: row.longTermGoal ?? "",
    shortName: row.shortName ?? "",
    archived: isTrue(row.archived),
  };
}

function toScheduleEntry(row: Record<string, string>): ScheduleEntry {
  return {
    teacherId: row.teacherId ?? "",
    dayOfWeek: (row.dayOfWeek ?? "") as Weekday,
    timeSlot: row.timeSlot ?? "",
    studentId: row.studentId ?? "",
  };
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function numberOrNull(value: string | undefined): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function isTrue(value: string | undefined): boolean {
  const trimmed = (value ?? "").trim().toLowerCase();
  return trimmed === "true" || trimmed === "1" || trimmed === "yes";
}
