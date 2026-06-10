import { DEFAULT_MODEL } from "../clients/anthropic";
import { callModel } from "../clients/llm";
import type { Provider } from "../clients/models";

export interface SuggestGoalLabelsInput {
  longTermGoal: string;
  shortTerms: string[];
  // Current shortnames being revised (set on regenerate). Given to the model so
  // it produces something genuinely different rather than re-deriving the same
  // label — without this, "use different wording" has nothing to differ from.
  current?: string[];
  feedback?: string;
}

// What one short-term goal resolves to: a terse checkbox label plus the Trials
// count phrase split into a base-form verb and its object (the note pipeline
// conjugates the verb).
export interface GoalLabels {
  shortName: string;
  measuredVerb: string;
  measuredNoun: string;
}

// ~6 curated anchors drawn from her real data — these define the style
// baseline: terse 2–5 word action labels, plus the BASE-form verb + object that
// slot (conjugated by the note pipeline) into "{Name} correctly ___ 6/10".
// Hardcoded (no live roster context in v1) for simplicity and a stable style;
// revisit if her vocabulary drifts.
const ANCHORS: { st: string; shortname: string; verb: string; noun: string }[] = [
  { st: "Student will identify the main topic of a short passage with no more than one prompt.", shortname: "identify main topic", verb: "identify", noun: "main topics" },
  { st: "Student will answer who, what, and where questions about a familiar story.", shortname: "answer WH questions", verb: "answer", noun: "wh questions" },
  { st: "Student will sequence 3–4 picture cards to retell an event in order.", shortname: "sequence picture cards", verb: "sequence", noun: "picture cards" },
  { st: "Student will produce utterances of 1–3 words to request preferred items.", shortname: "MLU 1-3 words", verb: "produce", noun: "1–3 word utterances" },
  { st: "Student will identify how a character is feeling using picture supports.", shortname: "identify feelings", verb: "identify", noun: "character feelings" },
  { st: "Student will use a learned coping strategy when frustrated, with a prompt.", shortname: "use coping strategy", verb: "use", noun: "coping strategies" },
  // Sibling pair: same MEANS ("use multimodal communication"), different FUNCTION.
  // Measure the function (it's what differs), not the shared means; drop the
  // parenthetical examples and the prompt condition.
  { st: "Student will use multimodal communication (e.g., a speech-generating device, gestures, verbal approximations, communication boards) to initiate and terminate interactions, given one verbal or visual prompt.", shortname: "initiate/terminate interactions", verb: "initiate and terminate", noun: "interactions" },
  { st: "Student will use multimodal communication (e.g., a speech-generating device, gestures, verbal approximations) to make a comment, given one verbal or visual prompt.", shortname: "make comments", verb: "make", noun: "comments" },
];

const SYSTEM =
  'You label special-education speech-language short-term goals. For each goal you write three things: ' +
  'a "shortName" — a 2–5 word lowercase skill label, an action phrase, never a full sentence; a ' +
  '"measuredVerb" — the BASE (present) form of the verb for the target behavior (e.g. "answer", ' +
  '"sequence", "make"); a short compound is fine when the goal names two ("initiate and terminate"); ' +
  'the note pipeline conjugates it for tense, so give the bare base form, never past tense; ' +
  'and a "measuredNoun" — that verb\'s object, a CONCISE bare-plural or mass noun phrase (about 1–4 ' +
  'words) with NO leading article ("the"/"a"), because the sentence counts repeated trials: write ' +
  '"types of functional text", never "the type of functional text". ' +
  'Together verb + noun must name the OBSERVABLE TARGET BEHAVIOR being counted. When a goal reads ' +
  '"use/with [a means or modality] to [do FUNCTION]", measure the FUNCTION, not the means — the ' +
  'function is what varies between goals: "use multimodal communication to make a comment" → verb ' +
  '"make", noun "comments"; "...to initiate and terminate interactions" → verb "initiate and ' +
  'terminate", noun "interactions". DROP non-essential modifiers: parenthetical examples ("(e.g., ' +
  '...)"), prompts, conditions ("given one verbal prompt"), and settings. ' +
  'Goals in a batch often share a stem; each goal\'s verb + noun MUST be distinct and capture what ' +
  'makes that goal different from its siblings. Verb + noun must read correctly once the verb is ' +
  'conjugated to past in "{Name} correctly ___ 6/10" (base "answer" → "correctly answered wh ' +
  'questions 6/10"). Everything lowercase, no trailing punctuation. ' +
  "Base all three only on that goal's own text. Output only what is asked for.";

// One Claude call per paste: given a long-term goal (context) and its short-term
// goals, returns one {shortName, measuredAction} per short-term goal, in order.
// Falls back to a derived label per item if the response can't be parsed, so the
// UI stays usable.
export async function suggestGoalLabels(
  apiKey: string,
  input: SuggestGoalLabelsInput,
  provider: Provider = "anthropic",
  model: string = DEFAULT_MODEL,
): Promise<GoalLabels[]> {
  const demos = ANCHORS.map(
    (a) => `"${a.st}" -> shortName: "${a.shortname}", measuredVerb: "${a.verb}", measuredNoun: "${a.noun}"`,
  ).join("\n");
  const revising = input.current !== undefined;
  const numbered = input.shortTerms
    .map((s, i) => {
      const cur = input.current?.[i];
      return cur ? `${i + 1}. ${s}\n   current shortName: "${cur}" (produce a different one)` : `${i + 1}. ${s}`;
    })
    .join("\n");
  const prompt = [
    `Style examples (short-term goal text -> labels):\n${demos}`,
    `Long-term goal (context only, do not label it):\n${input.longTermGoal.trim() || "(none given)"}`,
    revising
      ? `Revise the labels for each short-term goal below — return a NEW shortName that differs from the current one:\n${numbered}`
      : `Write labels for each of these short-term goals:\n${numbered}`,
    input.feedback ? `Apply this feedback to the shortNames: ${input.feedback}` : "",
    `Return ONLY a JSON array of exactly ${input.shortTerms.length} objects, one per short-term goal in ` +
      `order, each shaped {"shortName": "...", "measuredVerb": "...", "measuredNoun": "..."}. Each ` +
      `shortName must be distinct and derived from its own goal text. No prose, no code fence.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await callModel(provider, apiKey, {
    model,
    max_tokens: 900,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  return parseGoalLabels(res.text, input.shortTerms);
}

function parseGoalLabels(text: string, shortTerms: string[]): GoalLabels[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const arr: unknown = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) {
        return shortTerms.map((st, i) => {
          const o = arr[i] as { shortName?: unknown; measuredVerb?: unknown; measuredNoun?: unknown } | undefined;
          const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
          return {
            shortName: str(o?.shortName) || fallbackShortname(st),
            measuredVerb: str(o?.measuredVerb),
            measuredNoun: str(o?.measuredNoun),
          };
        });
      }
    } catch {
      // Unparseable — fall through to per-item fallback.
    }
  }
  return shortTerms.map((st) => ({ shortName: fallbackShortname(st), measuredVerb: "", measuredNoun: "" }));
}

function fallbackShortname(shortTerm: string): string {
  return shortTerm.trim().toLowerCase().split(/\s+/).slice(0, 5).join(" ");
}
