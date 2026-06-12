// Anonymized seed dataset for Demo mode — entirely fictional students, teachers,
// and goals (no real PII). Written into the localStorage sandbox (LocalFsClient)
// via the same write helpers the app uses, so the demo data is in the exact file
// formats loadTermData expects. The term window is intentionally wide so the demo
// always reads as "active" whenever it's viewed.
import type { DataClient } from "../clients/github";
import { clearDemoFs } from "../clients/localFsClient";
import {
  writeActivities,
  writeGoals,
  writeNewsRoles,
  writeSchedule,
  writeStudents,
  writeStudentFields,
  writeTeachers,
  writeTerm,
  writeTermHistory,
} from "../domain/data";
import { RESERVED_OTHER_ID } from "../domain/activity";
import type { Student } from "../domain/student";
import type { Teacher, Activity, Role } from "../domain/teacher";
import type { Goal } from "../domain/goal";
import type { ScheduleEntry, Weekday } from "../domain/schedule";
import type { StudentField } from "../domain/studentField";
import type { Term } from "../domain/term";

const TERM: Term = {
  termType: "school-year",
  firstDay: "2024-09-02",
  lastDay: "2030-06-26",
  label: "Demo Term",
};

const STUDENT_FIELDS: StudentField[] = [
  { key: "homeLanguage", label: "Home language", type: "select", options: ["English", "Spanish", "Bengali", "Mandarin"] },
  { key: "usesAac", label: "Uses AAC device", type: "toggle" },
];

const ACTIVITIES: Activity[] = [
  { id: "a_reading", name: "Reading comprehension" },
  { id: "a_artic", name: "Articulation drill" },
  { id: "a_social", name: "Social skills group" },
  { id: "a_news", name: "News segment", requiresSegmentName: true },
  { id: RESERVED_OTHER_ID, name: "Other", freeText: true, freeTextIsDescription: true },
];

const NEWS_ROLES: Role[] = [
  { id: "r_anchor", name: "Anchor", phrase: "anchored the broadcast", fields: [] },
  { id: "r_reporter", name: "Reporter", phrase: "reported a segment", fields: [] },
  { id: "r_weather", name: "Weather", phrase: "presented the weather", fields: [] },
];

const TEACHERS: Teacher[] = [
  {
    id: "t_001",
    name: "Ms. Rivera",
    color: "teal",
    modes: ["regular"],
    activityIds: ["a_reading", "a_artic", "a_social"],
    newsRoleIds: [],
    sessionCaptures: [],
    archived: false,
  },
  {
    id: "t_002",
    name: "Mr. Chen",
    color: "amber",
    modes: ["regular", "news-day"],
    activityIds: ["a_reading", "a_social", "a_news"],
    newsRoleIds: ["r_anchor", "r_reporter", "r_weather"],
    sessionCaptures: [],
    archived: false,
  },
  {
    id: "t_003",
    name: "Ms. Okafor",
    color: "coral",
    modes: ["regular"],
    activityIds: ["a_artic", "a_social"],
    newsRoleIds: [],
    sessionCaptures: [],
    archived: false,
  },
];

function student(
  id: string,
  firstName: string,
  lastName: string,
  pronouns: string,
  teacherId: string,
  birthday: string,
  mandate: string,
  fields: Student["fields"] = {},
): Student {
  return {
    id,
    firstName,
    middle: "",
    lastName,
    pronouns,
    emoji: "",
    teacherId,
    birthday,
    age: null,
    nextIepReview: null,
    nextTriennial: null,
    mandate,
    firstDay: null,
    lastDay: null,
    archived: false,
    fields,
    defaultPromptingLevel: [],
    defaultPromptingType: [],
    defaultRedirection: [],
    defaultResponse: [],
  };
}

const STUDENTS: Student[] = [
  student("s_001", "Maya", "Thompson", "she/her", "t_001", "2013-04-18", "2:30:2", { homeLanguage: ["English"] }),
  student("s_002", "Diego", "Ramos", "he/him", "t_001", "2012-11-02", "2:30:3", { homeLanguage: ["Spanish"] }),
  student("s_003", "Aisha", "Khan", "she/her", "t_002", "2011-07-25", "1:45:2", { homeLanguage: ["Bengali"], usesAac: true }),
  student("s_004", "Liam", "O'Brien", "they/them", "t_002", "2014-01-09", "2:30:2", { homeLanguage: ["English"] }),
  student("s_005", "Sofia", "Russo", "she/her", "t_003", "2013-09-30", "1:45:3", { homeLanguage: ["English"] }),
  student("s_006", "Noah", "Bennett", "he/him", "t_003", "2012-03-14", "2:30:2", { homeLanguage: ["English"], usesAac: true }),
];

function goal(
  id: string,
  studentId: string,
  longTermGoal: string,
  shortTermGoal: string,
  shortName: string,
  measuredVerb: string,
  measuredNoun: string,
): Goal {
  return {
    id,
    studentId,
    longTermGoal,
    shortTermGoal,
    shortName,
    measuredVerb,
    measuredNoun,
    targetPercent: 80,
    targetLevel: "minimal",
    archived: false,
  };
}

const GOALS: Goal[] = [
  goal("g_001", "s_001", "comprehending grade-level texts", "answer WH questions about a short passage", "WH questions", "answer", "wh questions"),
  goal("g_002", "s_001", "comprehending grade-level texts", "identify the main idea of a passage", "main idea", "identify", "the main idea"),
  goal("g_003", "s_002", "producing target speech sounds", "produce /r/ in the initial position of words", "/r/ initial", "produce", "initial /r/"),
  goal("g_004", "s_003", "communicating across settings", "request preferred items on a speech-generating device", "requesting", "request", "preferred items"),
  goal("g_005", "s_004", "participating in structured conversations", "make on-topic comments during a group activity", "on-topic comments", "make", "on-topic comments"),
  goal("g_006", "s_005", "producing target speech sounds", "produce /s/ blends in sentences", "/s/ blends", "produce", "/s/ blends"),
  goal("g_007", "s_006", "communicating across settings", "initiate and terminate interactions with peers", "initiating", "initiate", "interactions"),
];

// A weekly template: who each teacher sees on which day/slot.
const SLOT_A = "9:00-9:30";
const SLOT_B = "10:15-10:45";
const SLOT_C = "1:10-1:40";
function sched(teacherId: string, dayOfWeek: Weekday, timeSlot: string, studentId: string): ScheduleEntry {
  return { teacherId, dayOfWeek, timeSlot, studentId };
}
const SCHEDULE: ScheduleEntry[] = [
  // Monday
  sched("t_001", "Monday", SLOT_A, "s_001"),
  sched("t_001", "Monday", SLOT_A, "s_002"),
  sched("t_003", "Monday", SLOT_C, "s_005"),
  // Tuesday
  sched("t_002", "Tuesday", SLOT_B, "s_003"),
  sched("t_002", "Tuesday", SLOT_B, "s_004"),
  sched("t_003", "Tuesday", SLOT_C, "s_006"),
  // Wednesday
  sched("t_001", "Wednesday", SLOT_A, "s_001"),
  sched("t_003", "Wednesday", SLOT_C, "s_005"),
  sched("t_003", "Wednesday", SLOT_C, "s_006"),
  // Thursday
  sched("t_002", "Thursday", SLOT_B, "s_003"),
  sched("t_002", "Thursday", SLOT_B, "s_004"),
  sched("t_001", "Thursday", SLOT_A, "s_002"),
  // Friday (news day for Mr. Chen)
  sched("t_002", "Friday", SLOT_A, "s_003"),
  sched("t_002", "Friday", SLOT_A, "s_004"),
  sched("t_001", "Friday", SLOT_B, "s_001"),
];

async function writeSeed(client: DataClient): Promise<void> {
  await writeStudentFields(client, STUDENT_FIELDS, undefined);
  await writeActivities(client, ACTIVITIES, undefined);
  await writeNewsRoles(client, NEWS_ROLES, undefined);
  await writeTeachers(client, TEACHERS, undefined);
  await writeStudents(client, STUDENTS, STUDENT_FIELDS, undefined);
  await writeGoals(client, GOALS, undefined);
  await writeSchedule(client, SCHEDULE, undefined);
  await writeTerm(client, TERM, undefined);
  await writeTermHistory(client, [], undefined);
}

// Seed the sandbox only if it's empty (idempotent — preserves a visitor's edits
// across reloads).
export async function seedDemoFs(client: DataClient): Promise<void> {
  if (await client.readFile("data/term.json")) return;
  await writeSeed(client);
}

// Wipe the sandbox and re-seed it (the "Reset demo" action).
export async function resetDemoFs(client: DataClient): Promise<void> {
  clearDemoFs();
  await writeSeed(client);
}
