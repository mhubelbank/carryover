import type { GitHubClient } from "../clients/github";
import { parseCsv, serializeCsv } from "./csv";
import type { Goal } from "./goal";
import type { IepReview } from "./iep";
import type { ScheduleEntry, Weekday } from "./schedule";
import type { SessionMetadata } from "./session";
import type { Student } from "./student";
import type { StudentField } from "./studentField";
import type { Activity, Role, Teacher } from "./teacher";
import type { ArchivedTerm, Term } from "./term";

export interface TermData {
  term: Term;
  teachers: Teacher[];
  students: Student[];
  goals: Goal[];
  schedule: ScheduleEntry[];
  // Shared activity catalog (data/activities.json), referenced by teachers.
  activities: Activity[];
  // Shared news-role catalog (data/news-roles.json).
  newsRoles: Role[];
  // Configurable student-field catalog (data/student-fields.json).
  studentFields: StudentField[];
}

// Blob shas of each loaded file, needed to safely overwrite on save.
export interface FileShas {
  term?: string;
  termHistory?: string;
  teachers?: string;
  students?: string;
  goals?: string;
  schedule?: string;
  activities?: string;
  newsRoles?: string;
  studentFields?: string;
}

export interface LoadedTerm {
  data: TermData;
  shas: FileShas;
}

const PATHS = {
  term: "data/term.json",
  termHistory: "data/term-history.json",
  teachers: "data/teachers.json",
  students: "data/students.csv",
  goals: "data/goals.csv",
  schedule: "data/schedule.csv",
  activities: "data/activities.json",
  newsRoles: "data/news-roles.json",
  studentFields: "data/student-fields.json",
  feedbackRules: "data/feedback-rules.md",
} as const;

const SESSIONS_DIR = "data/sessions";

// Fixed students.csv columns, in order. Configurable student-field values are
// written as additional columns (one per field key) after these. Legacy `name`
// and former quirk columns (aacDevice, needsSpanish, …) are read at load — quirk
// columns now resolve as field values; orphan columns are preserved on write.
const BASE_STUDENT_COLUMNS = [
  "id",
  "firstName",
  "middle",
  "lastName",
  "pronouns",
  "emoji",
  "teacherId",
  "birthday",
  "age",
  "nextIepReview",
  "nextTriennial",
  "mandate",
  "firstDay",
  "lastDay",
  "archived",
  "defaultPromptingLevel",
  "defaultPromptingType",
  "defaultRedirection",
  "defaultResponse",
];

// Separator for a multi-select field's values inside one CSV cell. A pipe avoids
// CSV comma-quoting and won't appear in clinical option values.
const FIELD_VALUE_SEP = "|";

// Loads the full term bundle. Returns null when there's no term.json yet —
// the signal for the first-run / empty state.
export async function loadTermData(client: GitHubClient): Promise<LoadedTerm | null> {
  const termFile = await client.readFile(PATHS.term);
  if (!termFile) return null;
  const term = JSON.parse(termFile.text) as Term;

  const [
    teachersFile,
    studentsFile,
    goalsFile,
    scheduleFile,
    activitiesFile,
    newsRolesFile,
    studentFieldsFile,
  ] = await Promise.all([
    client.readFile(PATHS.teachers),
    client.readFile(PATHS.students),
    client.readFile(PATHS.goals),
    client.readFile(PATHS.schedule),
    client.readFile(PATHS.activities),
    client.readFile(PATHS.newsRoles),
    client.readFile(PATHS.studentFields),
  ]);

  // Parse the field catalog first — students are parsed against it.
  const studentFields = studentFieldsFile
    ? (JSON.parse(studentFieldsFile.text) as unknown[]).map(toStudentField)
    : [];

  return {
    data: {
      term,
      teachers: teachersFile ? (JSON.parse(teachersFile.text) as unknown[]).map(toTeacher) : [],
      students: studentsFile
        ? parseCsv(studentsFile.text).map((r) => toStudent(r, studentFields))
        : [],
      goals: goalsFile ? parseCsv(goalsFile.text).map(toGoal) : [],
      schedule: scheduleFile ? parseCsv(scheduleFile.text).map(toScheduleEntry) : [],
      activities: activitiesFile
        ? (JSON.parse(activitiesFile.text) as unknown[]).map(toActivity)
        : [],
      newsRoles: newsRolesFile
        ? (JSON.parse(newsRolesFile.text) as unknown[]).map(toRole)
        : [],
      studentFields,
    },
    shas: {
      term: termFile.sha,
      teachers: teachersFile?.sha,
      students: studentsFile?.sha,
      goals: goalsFile?.sha,
      schedule: scheduleFile?.sha,
      activities: activitiesFile?.sha,
      newsRoles: newsRolesFile?.sha,
      studentFields: studentFieldsFile?.sha,
    },
  };
}

// Serialize a single student-field value to one CSV cell.
function encodeFieldValue(v: string | boolean | string[] | undefined): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.join(FIELD_VALUE_SEP);
  return v;
}

export function studentsToCsv(students: Student[], fieldDefs: StudentField[]): string {
  const fieldKeys = fieldDefs.map((f) => f.key);
  const fieldKeySet = new Set(fieldKeys);
  // Preserve columns for any field value present in the data that isn't a
  // current field def (e.g. a deleted field, or the language-collapse orphans)
  // so deleting/renaming a field never destroys stored values.
  const orphanKeys: string[] = [];
  const seen = new Set<string>();
  for (const s of students) {
    for (const k of Object.keys(s.fields)) {
      if (!fieldKeySet.has(k) && !seen.has(k)) {
        seen.add(k);
        orphanKeys.push(k);
      }
    }
  }
  const allFieldKeys = [...fieldKeys, ...orphanKeys];
  const header = [...BASE_STUDENT_COLUMNS, ...allFieldKeys];
  const rows = students.map((s) => [
    s.id,
    s.firstName,
    s.middle,
    s.lastName,
    s.pronouns,
    s.emoji,
    s.teacherId,
    s.birthday ?? "",
    s.age == null ? "" : String(s.age),
    s.nextIepReview ?? "",
    s.nextTriennial ?? "",
    s.mandate ?? "",
    s.firstDay ?? "",
    s.lastDay ?? "",
    s.archived ? "true" : "false",
    s.defaultPromptingLevel.join(FIELD_VALUE_SEP),
    s.defaultPromptingType.join(FIELD_VALUE_SEP),
    s.defaultRedirection.join(FIELD_VALUE_SEP),
    s.defaultResponse.join(FIELD_VALUE_SEP),
    ...allFieldKeys.map((k) => encodeFieldValue(s.fields[k])),
  ]);
  return serializeCsv(header, rows);
}

// Writes students.csv; returns the new blob sha for the next safe overwrite.
export function writeStudents(
  client: GitHubClient,
  students: Student[],
  fieldDefs: StudentField[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.students,
    studentsToCsv(students, fieldDefs),
    "data: update students",
    sha,
  );
}

const GOAL_COLUMNS = ["id", "studentId", "longTermGoal", "shortTermGoal", "shortName", "measuredVerb", "measuredNoun", "targetPercent", "targetLevel", "archived"];

export function goalsToCsv(goals: Goal[]): string {
  const rows = goals.map((g) => [
    g.id,
    g.studentId,
    g.longTermGoal,
    g.shortTermGoal,
    g.shortName,
    g.measuredVerb,
    g.measuredNoun,
    g.targetPercent ? String(g.targetPercent) : "",
    g.targetLevel || "no support",
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

// data/term-history.json — the record of past terms (oldest → newest), so the
// outgoing term isn't lost when term.json is overwritten. A term lands here when
// it's finished ("Finish term", carrying a caseload snapshot) or when the next
// term starts (carried forward without a snapshot if it wasn't finished first).
// Empty/absent until the first roll-over.
//
// History is held in memory by TermContext (array + tracked blob sha) and never
// re-read after a write — the same sha-threading every other data file uses. The
// pure helpers below mutate the in-memory array; writeTermHistory persists it with
// the tracked sha. (Re-reading for the sha would hit GitHub's CDN-cached contents
// API, which can serve a stale sha right after a write and 409 the next save.)
export async function loadTermHistory(
  client: GitHubClient,
): Promise<{ history: ArchivedTerm[]; sha: string | undefined }> {
  const file = await client.readFile(PATHS.termHistory);
  return { history: file ? (JSON.parse(file.text) as ArchivedTerm[]) : [], sha: file?.sha };
}

// Two terms are the same record if they share type and date span. Lets Finish
// (snapshot) then Start-new-term (no snapshot) coexist without duplicating.
function sameTerm(a: Term, b: Term): boolean {
  return a.termType === b.termType && a.firstDay === b.firstDay && a.lastDay === b.lastDay;
}

// Upsert a term into history (pure). A matching entry is merged (a new snapshot
// wins; an existing snapshot is preserved if the incoming entry has none),
// otherwise the term is appended. Keeps the order oldest → newest.
export function upsertTermHistory(history: ArchivedTerm[], term: ArchivedTerm): ArchivedTerm[] {
  let merged = false;
  const next = history.map((t) => {
    if (!sameTerm(t, term)) return t;
    merged = true;
    return { ...t, ...term, snapshot: term.snapshot ?? t.snapshot };
  });
  if (!merged) next.push(term);
  return next;
}

// Remove a term from history (pure). Used to undo an archive.
export function removeFromTermHistory(history: ArchivedTerm[], term: Term): ArchivedTerm[] {
  return history.filter((t) => !sameTerm(t, term));
}

// Persist the history array; returns the new blob sha for the next safe overwrite.
export function writeTermHistory(
  client: GitHubClient,
  history: ArchivedTerm[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.termHistory,
    `${JSON.stringify(history, null, 2)}\n`,
    "data: update term history",
    sha,
  );
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

// Writes activities.json (the shared catalog); returns the new blob sha.
export function writeActivities(
  client: GitHubClient,
  activities: Activity[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.activities,
    `${JSON.stringify(activities, null, 2)}\n`,
    "data: update activities",
    sha,
  );
}

// Writes news-roles.json (the shared catalog); returns the new blob sha.
export function writeNewsRoles(
  client: GitHubClient,
  roles: Role[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.newsRoles,
    `${JSON.stringify(roles, null, 2)}\n`,
    "data: update news roles",
    sha,
  );
}

// Writes student-fields.json (the configurable field catalog); returns the sha.
export function writeStudentFields(
  client: GitHubClient,
  fields: StudentField[],
  sha: string | undefined,
): Promise<string> {
  return client.writeFile(
    PATHS.studentFields,
    `${JSON.stringify(fields, null, 2)}\n`,
    "data: update student fields",
    sha,
  );
}

// data/feedback-rules.md — Emily's accumulated note corrections, appended to
// every draft prompt. Empty string when the file doesn't exist yet.
export async function loadFeedbackRules(client: GitHubClient): Promise<string> {
  const file = await client.readFile(PATHS.feedbackRules);
  return file?.text ?? "";
}

// Appends one feedback rule as a markdown bullet (creating the file if needed),
// so future generations pick it up via loadFeedbackRules.
export async function appendFeedbackRule(client: GitHubClient, rule: string): Promise<void> {
  const trimmed = rule.trim();
  if (!trimmed) return;
  const existing = await client.readFile(PATHS.feedbackRules);
  const header =
    "# Feedback rules\n\nAppended from regenerate-with-feedback. Applied to every note's draft pass.\n";
  const base = existing?.text?.trim() ? existing.text.replace(/\s*$/, "") : header.trimEnd();
  await client.writeFile(
    PATHS.feedbackRules,
    `${base}\n- ${trimmed}\n`,
    "data: add feedback rule",
    existing?.sha,
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

// Append one IEP review to a student's log (creates the file if absent). Reviews
// are infrequent (≤ a couple per student per year), so the read-for-sha here
// won't hit the rapid read-after-write staleness that term-history avoids.
export async function appendIepReview(
  client: GitHubClient,
  studentId: string,
  review: IepReview,
): Promise<void> {
  const path = `data/iep-history/${studentId}.jsonl`;
  const existing = await client.readFile(path);
  const prior = existing?.text ?? "";
  const base = prior && !prior.endsWith("\n") ? `${prior}\n` : prior;
  await client.writeFile(path, `${base}${JSON.stringify(review)}\n`, "data: append IEP review", existing?.sha);
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
    // Activities and news roles are now ids into shared catalogs. Records
    // lacking the fields (pre-migration) load empty rather than crashing.
    activityIds: t.activityIds ?? [],
    newsRoleIds: t.newsRoleIds ?? [],
    sessionCaptures: t.sessionCaptures ?? [],
    archived: t.archived === true,
    promptOverrides: t.promptOverrides,
  } as Teacher;
}

// Normalizes a raw catalog entry from activities.json, tolerating missing
// optional metadata.
function toActivity(raw: unknown): Activity {
  const a = (raw ?? {}) as Partial<Activity>;
  return {
    id: a.id ?? "",
    name: a.name ?? "",
    requiresSegmentName: a.requiresSegmentName === true,
    freeText: a.freeText === true,
    freeTextIsDescription: a.freeTextIsDescription === true,
    descriptionTemplate: a.descriptionTemplate,
    requiresAttribute: a.requiresAttribute,
    perStudentOptions: a.perStudentOptions
      ? {
          label: a.perStudentOptions.label ?? "",
          options: Array.isArray(a.perStudentOptions.options) ? a.perStudentOptions.options : [],
          template: a.perStudentOptions.template ?? "",
        }
      : undefined,
  };
}

// Normalizes a raw entry from news-roles.json.
function toRole(raw: unknown): Role {
  const r = (raw ?? {}) as Partial<Role>;
  return {
    id: r.id ?? "",
    name: r.name ?? "",
    phrase: r.phrase ?? "",
    fields: Array.isArray(r.fields) ? r.fields : [],
  };
}

function toStudent(row: Record<string, string>, fieldDefs: StudentField[]): Student {
  // Migrate legacy single-`name` column into firstName/lastName on the fly.
  // The new schema's columns take precedence when present.
  let firstName = (row.firstName ?? "").trim();
  let lastName = (row.lastName ?? "").trim();
  if (!firstName && !lastName && row.name) {
    const parts = row.name.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  }
  return {
    id: row.id ?? "",
    firstName,
    middle: (row.middle ?? "").trim(),
    lastName,
    pronouns: row.pronouns ?? "",
    emoji: row.emoji ?? "",
    teacherId: row.teacherId ?? "",
    birthday: blankToNull(row.birthday),
    age: numberOrNull(row.age),
    nextIepReview: blankToNull(row.nextIepReview),
    nextTriennial: blankToNull(row.nextTriennial),
    mandate: blankToNull(row.mandate),
    firstDay: blankToNull(row.firstDay),
    lastDay: blankToNull(row.lastDay),
    archived: isTrue(row.archived),
    fields: parseStudentFields(row, fieldDefs),
    defaultPromptingLevel: splitList(row.defaultPromptingLevel),
    defaultPromptingType: splitList(row.defaultPromptingType),
    defaultRedirection: splitList(row.defaultRedirection),
    defaultResponse: splitList(row.defaultResponse),
  };
}

// Splits a pipe-joined CSV cell into a trimmed, non-empty string list.
function splitList(v: string | undefined): string[] {
  return (v ?? "")
    .split(FIELD_VALUE_SEP)
    .map((s) => s.trim())
    .filter(Boolean);
}

const BASE_COLUMN_SET = new Set([...BASE_STUDENT_COLUMNS, "name"]);

// Build the per-student field-value map. Known field defs are typed (toggle →
// boolean via isTrue, select → string[] via the pipe separator). Any remaining
// non-base column is retained as a raw string so orphan/legacy columns (e.g.
// the collapsed needsSpanish/needsBengali) survive a save round-trip.
function parseStudentFields(
  row: Record<string, string>,
  fieldDefs: StudentField[],
): Record<string, string | boolean | string[]> {
  const fields: Record<string, string | boolean | string[]> = {};
  for (const [col, val] of Object.entries(row)) {
    if (!BASE_COLUMN_SET.has(col)) fields[col] = val;
  }
  for (const f of fieldDefs) {
    fields[f.key] =
      f.type === "toggle"
        ? isTrue(row[f.key])
        : (row[f.key] ?? "")
            .split(FIELD_VALUE_SEP)
            .map((s) => s.trim())
            .filter(Boolean);
  }
  return fields;
}

function toStudentField(raw: unknown): StudentField {
  const f = (raw ?? {}) as Partial<StudentField>;
  const type = f.type === "select" ? "select" : "toggle";
  return {
    key: f.key ?? "",
    label: f.label ?? "",
    type,
    ...(type === "select" ? { options: Array.isArray(f.options) ? f.options : [] } : {}),
  };
}

function toGoal(row: Record<string, string>): Goal {
  return {
    id: row.id ?? "",
    studentId: row.studentId ?? "",
    longTermGoal: row.longTermGoal ?? "",
    shortTermGoal: row.shortTermGoal ?? "",
    shortName: row.shortName ?? "",
    measuredVerb: row.measuredVerb ?? "",
    measuredNoun: row.measuredNoun ?? "",
    targetPercent: Number(row.targetPercent) || 0,
    targetLevel: row.targetLevel || "no support",
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
