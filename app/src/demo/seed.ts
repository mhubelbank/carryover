// Anonymized seed dataset for Demo mode — entirely fictional students, teachers,
// and goals (no real PII), modeled on the real carryover-data term (5 teachers,
// multi-student classroom sessions, a morning schedule) with the names changed.
// Dates (birthdays, IEP reviews, the progress sessions) are computed relative to
// "today" at seed time so the demo always looks current.
import type { DataClient } from "../clients/github";
import { clearDemoFs } from "../clients/localFsClient";
import { storage, StorageKeys } from "../clients/storage";
import {
  writeActivities,
  writeGoals,
  writeNewsRoles,
  writeSchedule,
  writeSessionMetadata,
  writeStudents,
  writeStudentFields,
  writeTeachers,
  writeTerm,
  writeTermHistory,
} from "../domain/data";
import { RESERVED_OTHER_ID } from "../domain/activity";
import { addDays, startOfDay, toISODate } from "../domain/dates";
import type { Student } from "../domain/student";
import type { Teacher, Activity, Role, ColorKey, Mode } from "../domain/teacher";
import type { Goal } from "../domain/goal";
import type { ScheduleEntry, Weekday } from "../domain/schedule";
import { WEEKDAYS } from "../domain/schedule";
import type { StudentField } from "../domain/studentField";
import type { Term } from "../domain/term";
import type { SessionMetadata } from "../domain/session";
import type { IepReview } from "../domain/iep";

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const monthDay = (d: Date) => toISODate(d).slice(5); // "MM-DD"

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

function teacher(id: string, name: string, color: ColorKey, modes: Mode[], activityIds: string[]): Teacher {
  return {
    id,
    name,
    color,
    modes,
    activityIds,
    newsRoleIds: modes.includes("news-day") ? ["r_anchor", "r_reporter", "r_weather"] : [],
    sessionCaptures: [],
    archived: false,
  };
}

const TEACHERS: Teacher[] = [
  teacher("t_001", "Ms. Rivera", "teal", ["regular"], ["a_reading", "a_artic", "a_social"]),
  teacher("t_002", "Mr. Chen", "amber", ["regular", "news-day"], ["a_reading", "a_social", "a_news"]),
  teacher("t_003", "Ms. Okafor", "coral", ["regular"], ["a_artic", "a_social"]),
  teacher("t_004", "Mr. Alvarez", "blue", ["regular"], ["a_reading", "a_artic", "a_social"]),
  teacher("t_005", "Ms. Bauer", "green", ["regular"], ["a_reading", "a_social"]),
];

// 20 students, 4 per teacher (t_001 gets s_001–004, etc.).
const STUDENT_NAMES: [string, string, string][] = [
  ["Marlando", "Thompson", "he/him"],
  ["Diego", "Ramos", "he/him"],
  ["Aisha", "Khan", "she/her"],
  ["Liam", "O'Brien", "they/them"],
  ["Sofia", "Russo", "she/her"],
  ["Noah", "Bennett", "he/him"],
  ["Priya", "Nair", "she/her"],
  ["Marcus", "Webb", "he/him"],
  ["Elena", "Petrova", "she/her"],
  ["Andre", "Joseph", "he/him"],
  ["Hana", "Sato", "she/her"],
  ["Caleb", "Foster", "he/him"],
  ["Zara", "Ahmed", "she/her"],
  ["Owen", "Murphy", "they/them"],
  ["Lucia", "Mendez", "she/her"],
  ["Isaiah", "Brooks", "he/him"],
  ["Nina", "Kowalski", "she/her"],
  ["Theo", "Bauer", "he/him"],
  ["Amara", "Diallo", "she/her"],
  ["Felix", "Wong", "he/him"],
];

const LANGS = ["English", "English", "English", "Spanish", "Bengali", "Mandarin"];
const MANDATES = ["2:30:2", "2:30:3", "1:45:2", "1:45:3", "3:30:2"];

interface BuiltStudents {
  students: Student[];
  iepHistory: { studentId: string; review: IepReview }[];
}

// Build the 20 students with dates anchored to today: s_001 has an IEP review and
// a birthday TODAY; the rest get a random birthday and IEP within ±30 days. An IEP
// that landed in the past is treated as already completed — its next review is
// pushed a year out (so it doesn't nag as overdue) and a history entry is recorded.
function buildStudents(): BuiltStudents {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const iepHistory: { studentId: string; review: IepReview }[] = [];

  const students = STUDENT_NAMES.map(([firstName, lastName, pronouns], i) => {
    const id = `s_${String(i + 1).padStart(3, "0")}`;
    const teacherId = `t_${String(Math.floor(i / 4) + 1).padStart(3, "0")}`;
    const fields: Student["fields"] = { homeLanguage: [LANGS[i % LANGS.length]!] };
    if (i % 5 === 0) fields.usesAac = true;

    let birthday: string;
    let nextIepReview: string | null;
    if (i === 0) {
      // The featured student — IEP review and birthday both today.
      birthday = `${year - 10}-${monthDay(today)}`;
      nextIepReview = toISODate(today);
    } else {
      const age = randInt(7, 16);
      birthday = `${year - age}-${monthDay(addDays(today, randInt(-30, 30)))}`;
      const iepDate = addDays(today, randInt(-30, 30));
      if (iepDate.getTime() >= today.getTime()) {
        nextIepReview = toISODate(iepDate);
      } else {
        // Already reviewed — record it and schedule the next one a year out.
        iepHistory.push({
          studentId: id,
          review: { date: toISODate(iepDate), nothingChanged: true, note: "Annual review completed; goals continued." },
        });
        nextIepReview = toISODate(addDays(iepDate, 365));
      }
    }

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
      nextIepReview,
      nextTriennial: null,
      mandate: MANDATES[i % MANDATES.length]!,
      firstDay: null,
      lastDay: null,
      archived: false,
      fields,
      defaultPromptingLevel: [],
      defaultPromptingType: [],
      defaultRedirection: [],
      defaultResponse: [],
    } satisfies Student;
  });

  return { students, iepHistory };
}

// A pool of realistic short-term goals; each student gets two.
const GOAL_POOL: Omit<Goal, "id" | "studentId" | "archived">[] = [
  { longTermGoal: "comprehending grade-level texts", shortTermGoal: "answer WH questions about a short passage", shortName: "WH questions", measuredVerb: "answer", measuredNoun: "wh questions", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "comprehending grade-level texts", shortTermGoal: "identify the main idea of a passage", shortName: "main idea", measuredVerb: "identify", measuredNoun: "the main idea", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "producing target speech sounds", shortTermGoal: "produce /r/ in the initial position of words", shortName: "/r/ initial", measuredVerb: "produce", measuredNoun: "initial /r/", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "producing target speech sounds", shortTermGoal: "produce /s/ blends in sentences", shortName: "/s/ blends", measuredVerb: "produce", measuredNoun: "/s/ blends", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "communicating across settings", shortTermGoal: "request preferred items on a communication device", shortName: "requesting", measuredVerb: "request", measuredNoun: "preferred items", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "participating in structured conversations", shortTermGoal: "make on-topic comments during a group activity", shortName: "on-topic comments", measuredVerb: "make", measuredNoun: "on-topic comments", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "participating in structured conversations", shortTermGoal: "take turns appropriately in a conversation", shortName: "turn-taking", measuredVerb: "take", measuredNoun: "conversational turns", targetPercent: 80, targetLevel: "minimal" },
  { longTermGoal: "building expressive vocabulary", shortTermGoal: "name items within a category", shortName: "categories", measuredVerb: "name", measuredNoun: "category items", targetPercent: 80, targetLevel: "minimal" },
];

function buildGoals(students: Student[]): Goal[] {
  const goals: Goal[] = [];
  students.forEach((s, i) => {
    for (const n of [0, 1]) {
      const tpl = GOAL_POOL[(i + n * 3) % GOAL_POOL.length]!;
      goals.push({ id: `g_${s.id}_${n + 1}`, studentId: s.id, archived: false, ...tpl });
    }
  });
  return goals;
}

// Five morning slots between 8:30 and 12. Tue/Thu run 15 minutes later than
// Mon/Wed/Fri, so the week isn't an identical grid every day.
const SLOTS = ["8:30 – 9:00", "9:00 – 9:30", "9:45 – 10:15", "10:30 – 11:00", "11:15 – 11:45"];
const SLOTS_LATE = ["8:45 – 9:15", "9:15 – 9:45", "10:00 – 10:30", "10:45 – 11:15", "11:30 – 12:00"];
const slotsForDay = (d: number) => (d === 1 || d === 3 ? SLOTS_LATE : SLOTS);

// A weekly template: each day has 5 sessions (one per slot). The teacher in each
// slot rotates by weekday (a Latin square), so it's never the same teacher in the
// same slot two days running; each session sees a rotating subset of that teacher's
// students.
function buildSchedule(students: Student[]): ScheduleEntry[] {
  const byTeacher = new Map<string, string[]>();
  for (const s of students) {
    const list = byTeacher.get(s.teacherId) ?? [];
    list.push(s.id);
    byTeacher.set(s.teacherId, list);
  }
  const entries: ScheduleEntry[] = [];
  WEEKDAYS.forEach((dayOfWeek: Weekday, d) => {
    slotsForDay(d).forEach((timeSlot, s) => {
      const teacherId = TEACHERS[(s + d) % TEACHERS.length]!.id;
      const roster = byTeacher.get(teacherId) ?? [];
      // 3 of the teacher's students, rotating which by weekday.
      for (const off of [0, 1, 2]) {
        const studentId = roster[(d + off) % roster.length];
        if (studentId) entries.push({ teacherId, dayOfWeek, timeSlot, studentId });
      }
    });
  });
  return entries;
}

// Recent weekly sessions (last 8 weeks) with a rising accuracy/independence trend,
// so EVERY student's Progress view has data to chart. Grouped one file per (week,
// teacher) — each holds that teacher's whole class — so per-student sessions on the
// same date/teacher don't overwrite each other.
function buildProgressSessions(students: Student[], goals: Goal[]): SessionMetadata[] {
  const today = startOfDay(new Date());
  const byTeacher = new Map<string, Student[]>();
  for (const s of students) {
    const list = byTeacher.get(s.teacherId) ?? [];
    list.push(s);
    byTeacher.set(s.teacherId, list);
  }
  const out: SessionMetadata[] = [];
  for (let i = 0; i < 8; i++) {
    const date = toISODate(addDays(today, -7 * (8 - i)));
    for (const [teacherId, roster] of byTeacher) {
      const entries: SessionMetadata["students"] = [];
      for (const s of roster) {
        const goal = goals.find((g) => g.studentId === s.id);
        if (!goal) continue;
        // A per-student offset so the class isn't an identical curve.
        const base = s.id.charCodeAt(s.id.length - 1) % 3;
        const total = 10;
        const noSupport = Math.min(2 + i + base, 9);
        const successful = Math.min(5 + i + base, total);
        const minimal = Math.max(0, successful - noSupport);
        entries.push({
          studentId: s.id,
          goalIds: [goal.id],
          mode: "regular",
          trials: [
            {
              goalId: goal.id,
              verb: goal.measuredVerb,
              noun: goal.measuredNoun,
              total: String(total),
              rows: [
                { level: "no support", types: [], count: String(noSupport) },
                { level: "minimal", types: ["verbal"], count: String(minimal) },
              ],
              failed: "",
            },
          ],
        });
      }
      if (entries.length) out.push({ date, teacherId, students: entries });
    }
  }
  return out;
}

// Minimal first-run-tour schedule: the one sample student, seen every weekday.
function buildMinimalSchedule(student: Student): ScheduleEntry[] {
  return WEEKDAYS.map((dayOfWeek: Weekday, d) => ({
    teacherId: student.teacherId,
    dayOfWeek,
    timeSlot: slotsForDay(d)[0]!,
    studentId: student.id,
  }));
}

async function writeSeed(client: DataClient, minimal: boolean): Promise<void> {
  const built = buildStudents();
  // Minimal = just the featured student (IEP + birthday today, full progress).
  const students = minimal ? built.students.slice(0, 1) : built.students;
  const teachers = minimal ? TEACHERS.slice(0, 1) : TEACHERS;
  const iepHistory = built.iepHistory.filter((h) => students.some((s) => s.id === h.studentId));
  const goals = buildGoals(students);
  const schedule = minimal ? buildMinimalSchedule(students[0]!) : buildSchedule(students);

  await writeStudentFields(client, STUDENT_FIELDS, undefined);
  await writeActivities(client, ACTIVITIES, undefined);
  await writeNewsRoles(client, NEWS_ROLES, undefined);
  await writeTeachers(client, teachers, undefined);
  await writeStudents(client, students, STUDENT_FIELDS, undefined);
  await writeGoals(client, goals, undefined);
  await writeSchedule(client, schedule, undefined);
  await writeTerm(client, TERM, undefined);
  await writeTermHistory(client, [], undefined);
  for (const session of buildProgressSessions(students, goals)) {
    await writeSessionMetadata(client, session, undefined);
  }
  for (const { studentId, review } of iepHistory) {
    await client.writeFile(`data/iep-history/${studentId}.jsonl`, `${JSON.stringify(review)}\n`, "data: iep history", undefined);
  }
}

const isMinimal = () => storage.get(StorageKeys.demoMinimal) === "1";

// Seed the sandbox. The full demo is idempotent (preserves a visitor's edits
// across reloads); the minimal first-run-tour demo is always re-seeded fresh
// (it's transient — entered for the tour, exited when it ends).
export async function seedDemoFs(client: DataClient): Promise<void> {
  const minimal = isMinimal();
  if (minimal) {
    clearDemoFs();
    await writeSeed(client, true);
    return;
  }
  if (await client.readFile("data/term.json")) return;
  await writeSeed(client, false);
}

// Wipe the sandbox and re-seed it (the "Reset demo" action).
export async function resetDemoFs(client: DataClient): Promise<void> {
  clearDemoFs();
  await writeSeed(client, isMinimal());
}
