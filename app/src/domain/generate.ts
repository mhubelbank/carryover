import type { Role, Teacher } from "./teacher";
import type { TemplateContext } from "./notes";

// ---------------------------------------------------------------------------
// Option lists (confirmed from her existing TSX files; identical across teachers)
// ---------------------------------------------------------------------------

export const PROMPTING_LEVELS = [
  "no",
  "minimal",
  "moderate",
  "significant",
  "one to one para support",
] as const;

export const PROMPTING_TYPES = ["verbal", "visual", "tactile"] as const;

export const REDIRECTION_LEVELS = ["no", "regular", "occasional", "continuous"] as const;

// Note: "disregulated" is intentionally spelled this way in her data — preserve it.
export const RESPONSE_TYPES = [
  "enthusiastic",
  "engaged",
  "alert",
  "disregulated",
  "unengaged",
  "tired",
  "distracted",
] as const;

export const DOMAINS = ["expressive", "receptive", "pragmatic"] as const;
export type Domain = (typeof DOMAINS)[number];

// Filming cue/facial prompting use the levels minus "no" / "one to one para support".
export const FILMING_PROMPT_LEVELS = ["minimal", "moderate", "significant"] as const;
export const PRAGMATIC_QUALITY_LEVELS = [
  "Consistently",
  "Frequently",
  "Occasionally",
  "Not observed",
] as const;

// Studio-audience pragmatic skills: key → fixed phrase used in the note.
export const STUDIO_AUDIENCE_SKILLS = {
  maintainedAttention: "maintained attention to anchors",
  waitedToSpeak: "waited for appropriate times to speak",
  appropriateBehavior: "demonstrated appropriate audience behavior",
} as const;
export type PragmaticSkillKey = keyof typeof STUDIO_AUDIENCE_SKILLS;

// Fallback "serving as {phrase}" text, used when a role has no configured phrase.
export const ROLE_PHRASES: Record<string, string> = {
  Anchor: "an anchor",
  "Lunch Anchor": "the lunch anchor",
  Reporter: "a reporter",
  Sports: "the sports reporter",
  Weather: "the weather reporter",
  "Studio Audience": "a member of the studio audience",
};

// ---------------------------------------------------------------------------
// Regular mode
// ---------------------------------------------------------------------------

// Session-level activity (chosen once, shared across students). `activityId`
// references the shared catalog; the catalog entry's `requiresSegmentName`
// surfaces `segmentName` and `freeText` surfaces `additionalInfo`.
export interface ActivityDef {
  activityId: string;
  additionalInfo: string;
  segmentName: string;
  domains: string[];
}

// Per-student per-activity inputs (multi-selects already reduced to string[]).
export interface ActivityInput {
  goals: string[]; // resolved shortname strings
  promptingLevel: string[];
  promptingType: string[];
  redirection: string[];
  response: string[];
  additionalNotes: string;
}

// One entry of the `activities` array the regular templates iterate over.
export interface RenderedActivity {
  description: string;
  segmentName: string;
  domains: string;
  goals: string;
  promptingLevel: string;
  promptingType: string;
  redirection: string;
  response: string;
  additionalNotes: string;
}

// Build the `activities` array for {{#each activities}}. `describe` resolves the
// activity's id (+ session inputs) to its final description string via the
// catalog + any rewrite; every multi-select is joined with ", ". Rows with no
// selected activity, or whose description comes back empty (an ad-hoc "Other"
// with no detail), are dropped.
export function buildRegularActivities(
  defs: ActivityDef[],
  inputs: ActivityInput[],
  describe: (def: ActivityDef, index: number) => string,
): RenderedActivity[] {
  const out: RenderedActivity[] = [];
  defs.forEach((def, i) => {
    if (!def.activityId) return;
    const description = describe(def, i).trim();
    if (!description) return;
    const input = inputs[i];
    out.push({
      description,
      segmentName: def.segmentName || "",
      domains: def.domains.join(", "),
      goals: (input?.goals ?? []).join(", "),
      promptingLevel: (input?.promptingLevel ?? []).join(", "),
      promptingType: (input?.promptingType ?? []).join(", "),
      redirection: (input?.redirection ?? []).join(", "),
      response: (input?.response ?? []).join(", "),
      additionalNotes: input?.additionalNotes ?? "",
    });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Filming mode
// ---------------------------------------------------------------------------

export interface PragmaticSkillValue {
  enabled: boolean;
  qualityLevel: string;
  promptLevel: string;
}

export interface FilmingFieldValues {
  // visualCues
  cuesPercentage?: string;
  cuesTarget?: string;
  cuesPrompting?: string;
  // facialExpressions
  facialPercentage?: string;
  facialPrompting?: string;
  // decodingCarryover
  decodingPercentage?: string;
  // pragmatic
  pragmatic?: Partial<Record<PragmaticSkillKey, PragmaticSkillValue>>;
  // compliments
  gaveCompliments?: boolean;
  complimentsPrompting?: string;
  // universal
  rehearsalToBroadcast?: string;
  additionalNotes?: string;
  // Other role
  otherRoleDescription?: string;
}

// The "{phrase}" after "serving as" in the opening sentence. Prefers the role's
// configured phrase; "Other" uses the lowercased free-text description.
export function resolveRolePhrase(role: Role, values: FilmingFieldValues): string {
  if (role.name === "Other") return (values.otherRoleDescription || "other role").toLowerCase();
  if (role.phrase && role.phrase.trim()) return role.phrase.trim();
  return ROLE_PHRASES[role.name] ?? role.name.toLowerCase();
}

// Build the pre-formatted `roleData` string (one performance line per row),
// driven by the role's enabled field components. Wording is verbatim from the
// original morgan-filming-day.tsx / carter-filming-day.tsx.
export function buildRoleData(role: Role, v: FilmingFieldValues): string {
  const has = (key: string) => role.fields.includes(key);
  let out = "";

  if (has("visualCues") && v.cuesPercentage && v.cuesPrompting) {
    out +=
      v.cuesTarget && v.cuesTarget !== "other"
        ? `\nResponded to visual cues to increase ${v.cuesTarget} in approximately ${v.cuesPercentage}% of opportunities`
        : `\nResponded to visual cues in approximately ${v.cuesPercentage}% of opportunities`;
  }
  if (has("facialExpressions") && v.facialPercentage && v.facialPrompting) {
    out += `\nFacial expressions: ${v.facialPercentage}% given ${v.facialPrompting} visual prompting`;
  }
  if (has("decodingCarryover") && v.decodingPercentage) {
    out += `\nDecoding carryover: ${v.decodingPercentage}% without prompting`;
  }
  if (has("pragmatic")) {
    const skills: string[] = [];
    (Object.keys(STUDIO_AUDIENCE_SKILLS) as PragmaticSkillKey[]).forEach((key) => {
      const s = v.pragmatic?.[key];
      if (!s?.enabled) return;
      let line: string = STUDIO_AUDIENCE_SKILLS[key];
      if (s.qualityLevel) line += ` ${s.qualityLevel.toLowerCase()}`;
      if (s.promptLevel) line += ` with ${s.promptLevel} prompting`;
      skills.push(line);
    });
    if (skills.length) out += `\nPragmatic skills addressed: ${skills.join(", ")}`;
  }
  if (has("compliments") && v.gaveCompliments && v.complimentsPrompting) {
    out += `\nGave compliments: ${v.complimentsPrompting}`;
  }

  if (v.rehearsalToBroadcast) out += `\nRehearsal carryover: ${v.rehearsalToBroadcast}`;
  if (v.additionalNotes) out += `\nAdditional notes: ${v.additionalNotes}`;
  return out;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

// Flatten promptOverrides onto the teacher object so templates can read
// {{teacher.draftAppend}} / reviewAppend / streamlineAppend directly.
export function teacherPromptContext(teacher: Teacher): Record<string, unknown> {
  return {
    name: teacher.name,
    draftAppend: teacher.promptOverrides?.draftAppend ?? "",
    reviewAppend: teacher.promptOverrides?.reviewAppend ?? "",
    streamlineAppend: teacher.promptOverrides?.streamlineAppend ?? "",
  };
}

export interface RegularContextArgs {
  studentName: string;
  pronouns: string; // "he/him"
  pronoun: string; // "he"
  individualSession: boolean;
  teacher: Teacher;
  activities: RenderedActivity[];
  additionalContext?: string; // teacher quirks (e.g. Dana Bengali)
}

export function regularContext(a: RegularContextArgs): TemplateContext {
  return {
    student: {
      name: a.studentName,
      pronouns: a.pronouns,
      pronoun: a.pronoun,
      individualSession: a.individualSession,
    },
    teacher: teacherPromptContext(a.teacher),
    activities: a.activities,
    additionalContext: a.additionalContext ?? "",
  };
}

export interface FilmingContextArgs {
  studentName: string;
  pronouns: string;
  teacher: Teacher;
  role: Role;
  rolePhrase: string;
  selectedGoals: string[];
  roleData: string;
  additionalContext?: string;
}

export function filmingContext(a: FilmingContextArgs): TemplateContext {
  return {
    student: { name: a.studentName, pronouns: a.pronouns, role: a.role.name },
    role: { phrase: a.rolePhrase },
    teacher: teacherPromptContext(a.teacher),
    selectedGoals: a.selectedGoals,
    roleData: a.roleData,
    additionalContext: a.additionalContext ?? "",
  };
}

// Absent students bypass the pipeline entirely (no API call).
export function absentNote(studentName: string): string {
  return `${studentName} was absent.`;
}
