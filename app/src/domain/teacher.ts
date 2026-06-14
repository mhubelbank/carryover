export type Mode = "regular" | "news-day";

export type ColorKey =
  | "purple"
  | "blue"
  | "teal"
  | "green"
  | "amber"
  | "coral"
  | "pink"
  | "purple-deep"
  | "teal-deep"
  | "amber-deep";

export interface TeacherColor {
  label: string;
  // Pill background and a readable foreground for text on that background.
  bg: string;
  text: string;
}

// Colors reference theme-aware CSS tokens (see styles/tokens.css) so dark mode
// renders darker, translucent fills instead of the light-mode pastels.
export const TEACHER_COLORS: Record<ColorKey, TeacherColor> = {
  purple: { label: "Purple", bg: "var(--teacher-purple-bg)", text: "var(--teacher-purple-text)" },
  blue: { label: "Blue", bg: "var(--teacher-blue-bg)", text: "var(--teacher-blue-text)" },
  teal: { label: "Teal", bg: "var(--teacher-teal-bg)", text: "var(--teacher-teal-text)" },
  green: { label: "Green", bg: "var(--teacher-green-bg)", text: "var(--teacher-green-text)" },
  amber: { label: "Amber", bg: "var(--teacher-amber-bg)", text: "var(--teacher-amber-text)" },
  coral: { label: "Coral", bg: "var(--teacher-coral-bg)", text: "var(--teacher-coral-text)" },
  pink: { label: "Pink", bg: "var(--teacher-pink-bg)", text: "var(--teacher-pink-text)" },
  "purple-deep": { label: "Purple deep", bg: "var(--teacher-purple-deep-bg)", text: "var(--teacher-purple-deep-text)" },
  "teal-deep": { label: "Teal deep", bg: "var(--teacher-teal-deep-bg)", text: "var(--teacher-teal-deep-text)" },
  "amber-deep": { label: "Amber deep", bg: "var(--teacher-amber-deep-bg)", text: "var(--teacher-amber-deep-text)" },
};

// Palette order for the color picker (10 options).
export const COLOR_KEYS = Object.keys(TEACHER_COLORS) as ColorKey[];

export function teacherColor(key: string | undefined): TeacherColor {
  if (key && key in TEACHER_COLORS) return TEACHER_COLORS[key as ColorKey];
  return TEACHER_COLORS.blue;
}

// Next sequential teacher id (`t_NNN`) — numeric, not name-derived, so teacher
// names never appear in IDs (or session filenames) and same-named teachers can't
// collide. Max existing + 1 over the live roster (mirrors nextStudentId).
export function nextTeacherId(teachers: { id: string }[]): string {
  let max = 0;
  for (const t of teachers) {
    const m = /^t_(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, parseInt(m[1] ?? "0", 10));
  }
  return `t_${String(max + 1).padStart(3, "0")}`;
}

// A shared-catalog activity (data/activities.json), referenced by teachers via
// `activityIds`. The news-production curriculum is shared across teachers, so it
// lives in one catalog rather than duplicated per teacher.
export interface Activity {
  id: string;
  name: string;
  // Surfaces a "Segment name" input next to the activity in the Generate form.
  requiresSegmentName?: boolean;
  // Surfaces an "Additional info" free-text input.
  freeText?: boolean;
  // For the reserved "other" entry: the free text REPLACES the name as the
  // activity description (instead of `name + " " + info`).
  freeTextIsDescription?: boolean;
  // Overrides the description when building the prompt. Interpolates
  // `{student.<attr>}` via renderCaptureTemplate (e.g. the journal entry's
  // "{student.journalMethod}"). Applied only when `requiresAttribute` is absent
  // or the student has that attribute; otherwise the plain `name` is used.
  descriptionTemplate?: string;
  requiresAttribute?: string;
  // A per-student multiselect rendered on each student's card in Generate (e.g.
  // the pragmatic-skills checklist). Each student picks their own subset; the
  // chosen values rewrite this activity's description via `template`, where
  // `{options}` is the comma-joined selection and `{info}` the Additional-info
  // text. When nothing is selected, the default description is used.
  perStudentOptions?: {
    label: string;
    options: string[];
    template: string;
  };
}

// A shared-catalog news-day role (data/news-roles.json), referenced by
// teachers via `newsRoleIds`. The news-show roles (Anchor, Reporter, …) are a
// shared vocabulary; each teacher uses a subset.
export interface Role {
  id: string;
  name: string;
  phrase: string;
  // Keys of the conditional field-components enabled for this role.
  fields: string[];
}

// A per-session UI field collected inside a session capture. Rendered in the
// Generate form when the capture is active for the student.
export interface SessionCaptureField {
  name: string;
  type: "bool" | "text" | "multiselect";
  label?: string;
  placeholder?: string;
  // For `multiselect`: the selectable values, rendered as a checkbox group.
  // The field's state is the chosen subset as a string[]; render it into a
  // template with a join filter, e.g. `{skills | join: ", "}`.
  options?: string[];
  // Condition controlling whether this field renders. Bare names resolve
  // against the current capture's field values; dotted paths (e.g.
  // `student.needsBengali`) resolve against the wider context.
  showIf?: string;
}

// Declarative per-teacher session-time behavior. Three patterns:
//   1. fields + promptInjection (e.g. Dana's Bengali) — UI form fields whose
//      values feed a template appended to additionalContext.
//   2. postProcess (e.g. Robin's Spanish) — no UI, deterministic string append
//      to the final note. Bypasses the LLM.
//   3. activityDescriptionTemplate (e.g. Robin's journal) — rewrites the
//      activity description string before it reaches the prompt.
export interface SessionCapture {
  // Stable key used to store this capture's form state per student.
  name: string;
  // Top-level condition gating whether this capture applies for a given
  // student / activity. Empty means always-on.
  showIf?: string;
  fields?: SessionCaptureField[];
  promptInjection?: {
    // Condition (within the capture's field state) gating injection.
    when?: string;
    template: string;
  };
  postProcess?: {
    // Independent condition (typically student.X). Used outside the form.
    when?: string;
    appendToFinalNote: string;
  };
  activityDescriptionTemplate?: string;
}

export interface Teacher {
  id: string;
  name: string;
  color: ColorKey;
  modes: Mode[];
  // Ids into the shared activity catalog (data/activities.json).
  activityIds: string[];
  // Ids into the shared news-role catalog (data/news-roles.json).
  newsRoleIds: string[];
  sessionCaptures: SessionCapture[];
  // Archived teachers stay in the file (their students' history still
  // references their id) but are hidden from active workflows: caseload
  // dropdowns, the Today session list, the Generate teacher picker, and
  // collision/uniqueness checks treat them as out-of-pool.
  archived: boolean;
  promptOverrides?: Record<string, string>;
}
