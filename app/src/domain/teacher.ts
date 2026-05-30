export type Mode = "regular" | "filming-day";

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

export const TEACHER_COLORS: Record<ColorKey, TeacherColor> = {
  purple: { label: "Purple", bg: "#CECBF6", text: "#26215C" },
  blue: { label: "Blue", bg: "#B5D4F4", text: "#0C447C" },
  teal: { label: "Teal", bg: "#9FE1CB", text: "#0F5641" },
  green: { label: "Green", bg: "#C0DD97", text: "#27500A" },
  amber: { label: "Amber", bg: "#FAC775", text: "#412402" },
  coral: { label: "Coral", bg: "#F5C4B3", text: "#5A2310" },
  pink: { label: "Pink", bg: "#F4C0D1", text: "#4B1528" },
  "purple-deep": { label: "Purple deep", bg: "#AFA9EC", text: "#26215C" },
  "teal-deep": { label: "Teal deep", bg: "#5DCAA5", text: "#0F5641" },
  "amber-deep": { label: "Amber deep", bg: "#EF9F27", text: "#412402" },
};

// Palette order for the color picker (10 options).
export const COLOR_KEYS = Object.keys(TEACHER_COLORS) as ColorKey[];

export function teacherColor(key: string | undefined): TeacherColor {
  if (key && key in TEACHER_COLORS) return TEACHER_COLORS[key as ColorKey];
  return TEACHER_COLORS.blue;
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
}

// A shared-catalog filming-day role (data/filming-roles.json), referenced by
// teachers via `filmingRoleIds`. The news-show roles (Anchor, Reporter, …) are a
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
//   1. fields + promptInjection (e.g. Joanne's Bengali) — UI form fields whose
//      values feed a template appended to additionalContext.
//   2. postProcess (e.g. Nina's Spanish) — no UI, deterministic string append
//      to the final note. Bypasses the LLM.
//   3. activityDescriptionTemplate (e.g. Nina's journal) — rewrites the
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
  // Ids into the shared filming-role catalog (data/filming-roles.json).
  filmingRoleIds: string[];
  sessionCaptures: SessionCapture[];
  // Archived teachers stay in the file (their students' history still
  // references their id) but are hidden from active workflows: caseload
  // dropdowns, the Today session list, the Generate teacher picker, and
  // collision/uniqueness checks treat them as out-of-pool.
  archived: boolean;
  promptOverrides?: Record<string, string>;
}
