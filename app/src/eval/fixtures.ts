// Representative generation inputs for the quality eval. Built with the same
// domain functions the app uses (regularContext + buildRegularActivities), so
// the contexts faithfully match production — without dragging in Generate.tsx.
import { buildRegularActivities, regularContext, type ActivityDef, type ActivityInput } from "../domain/generate";
import type { TrialData, TrialEntry, TrialSupportRow } from "../domain/trial";
import type { Teacher } from "../domain/teacher";
import type { TemplateContext } from "../domain/notes";

export interface Fixture {
  name: string;
  studentName: string;
  ctx: TemplateContext;
  trialNumbers: string[]; // must appear verbatim in the note
  fullGoalTexts: string[]; // must NOT be pasted verbatim
  usesRedirection: boolean;
  maxTokens: number;
}

const teacher = {
  id: "t1",
  name: "Lefkie",
  color: "purple",
  modes: ["regular"],
  activityIds: [],
  newsRoleIds: [],
  sessionCaptures: [],
  archived: false,
} as Teacher;

const row = (level: string, types: string[], count: string): TrialSupportRow => ({ level, types, count });
const entry = (verb: string, noun: string, total: string, rows: TrialSupportRow[]): TrialEntry => ({
  goalId: `${verb}-${noun}`,
  verb,
  noun,
  total,
  rows,
  failed: "",
});
const trials = (entries: TrialEntry[]): TrialData => ({ enabled: true, method: "summary", entries });
const noTrials: TrialData = { enabled: false, method: "summary", entries: [] };

const def: ActivityDef = { activityId: "a1", additionalInfo: "", segmentName: "", domains: ["receptive"] };

const baseInput = (over: Partial<ActivityInput>): ActivityInput => ({
  goals: [],
  goalDetails: [],
  promptingLevel: [],
  promptingType: [],
  redirection: [],
  response: ["engaged"],
  additionalNotes: "",
  captures: {},
  options: [],
  trials: noTrials,
  ...over,
});

function ctxFor(studentName: string, pronoun: string, input: ActivityInput, description: string): TemplateContext {
  const activities = buildRegularActivities([def], [input], () => description, studentName, pronoun);
  return regularContext({
    studentName,
    pronouns: `${pronoun}/${pronoun}`,
    pronoun,
    individualSession: false,
    teacher,
    activities,
    additionalContext: "",
  });
}

const WH_GOAL =
  "Given a familiar story, the student will answer who, what, and where questions with no more than one prompt.";
const SEQ_GOAL = "The student will sequence 3–4 picture cards to retell an event in the correct order.";

export const FIXTURES: Fixture[] = [
  {
    name: "trials · single goal · redirection",
    studentName: "Joel",
    trialNumbers: ["6/10", "4/10"],
    fullGoalTexts: [WH_GOAL],
    usesRedirection: true,
    maxTokens: 1500,
    ctx: ctxFor(
      "Joel",
      "he",
      baseInput({
        goals: ["answer WH questions"],
        goalDetails: [WH_GOAL],
        redirection: ["regular"],
        trials: trials([entry("answered", "wh questions", "10", [row("minimal", ["verbal"], "6")])]),
      }),
      "Joel read a short passage and answered comprehension questions about it.",
    ),
  },
  {
    name: "checklist · prompting + redirection",
    studentName: "Mia",
    trialNumbers: [],
    fullGoalTexts: [WH_GOAL],
    usesRedirection: true,
    maxTokens: 1500,
    ctx: ctxFor(
      "Mia",
      "she",
      baseInput({
        goals: ["answer WH questions"],
        goalDetails: [WH_GOAL],
        promptingLevel: ["minimal"],
        promptingType: ["verbal"],
        redirection: ["regular"],
      }),
      "Mia read a short passage and answered comprehension questions about it.",
    ),
  },
  {
    name: "trials · two goals",
    studentName: "Aaron",
    trialNumbers: ["6/10", "4/10", "4/5", "1/5"],
    fullGoalTexts: [WH_GOAL, SEQ_GOAL],
    usesRedirection: false,
    maxTokens: 1500,
    ctx: ctxFor(
      "Aaron",
      "he",
      baseInput({
        goals: ["answer WH questions", "sequence picture cards"],
        goalDetails: [WH_GOAL, SEQ_GOAL],
        trials: trials([
          entry("answered", "wh questions", "10", [row("minimal", ["verbal"], "6")]),
          entry("sequenced", "picture cards", "5", [row("no support", [], "4")]),
        ]),
      }),
      "Aaron answered questions about a passage, then sequenced picture cards to retell it.",
    ),
  },
];
