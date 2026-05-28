import type { GitHubClient } from "../clients/github";
import { parseCsv } from "./csv";
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

const PATHS = {
  term: "data/term.json",
  teachers: "data/teachers.json",
  students: "data/students.csv",
  goals: "data/goals.csv",
  schedule: "data/schedule.csv",
} as const;

const SESSIONS_DIR = "sessions";

// Loads the full term bundle. Returns null when there's no term.json yet —
// the signal for the first-run / empty state.
export async function loadTermData(client: GitHubClient): Promise<TermData | null> {
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
    term,
    teachers: teachersFile ? (JSON.parse(teachersFile.text) as Teacher[]) : [],
    students: studentsFile ? parseCsv(studentsFile.text).map(toStudent) : [],
    goals: goalsFile ? parseCsv(goalsFile.text).map(toGoal) : [],
    schedule: scheduleFile ? parseCsv(scheduleFile.text).map(toScheduleEntry) : [],
  };
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

const STUDENT_COLUMNS = new Set([
  "id",
  "name",
  "pronouns",
  "teacherId",
  "age",
  "aacDevice",
  "nextIepReview",
  "nextTriennial",
  "mandate",
]);

function toStudent(row: Record<string, string>): Student {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!STUDENT_COLUMNS.has(key)) fields[key] = value;
  }
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    pronouns: row.pronouns ?? "",
    teacherId: row.teacherId ?? "",
    age: numberOrNull(row.age),
    aacDevice: blankToNull(row.aacDevice),
    nextIepReview: blankToNull(row.nextIepReview),
    nextTriennial: blankToNull(row.nextTriennial),
    mandate: blankToNull(row.mandate),
    fields,
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
