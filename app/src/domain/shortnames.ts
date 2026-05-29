import { callAnthropic, DEFAULT_MODEL } from "../clients/anthropic";

export interface SuggestShortnamesInput {
  longTermGoal: string;
  shortTerms: string[];
  // Current shortnames being revised (set on regenerate). Given to the model so
  // it produces something genuinely different rather than re-deriving the same
  // label — without this, "use different wording" has nothing to differ from.
  current?: string[];
  feedback?: string;
}

// ~6 curated anchors drawn from her real data — these define the style
// baseline: terse 2–5 word action labels. Hardcoded (no live roster context in
// v1) for simplicity and a stable style; revisit if her vocabulary drifts.
const ANCHORS: { st: string; shortname: string }[] = [
  { st: "Student will identify the main topic of a short passage with no more than one prompt.", shortname: "identify main topic" },
  { st: "Student will answer who, what, and where questions about a familiar story.", shortname: "answer WH questions" },
  { st: "Student will sequence 3–4 picture cards to retell an event in order.", shortname: "sequence picture cards" },
  { st: "Student will produce utterances of 1–3 words to request preferred items.", shortname: "MLU 1-3 words" },
  { st: "Student will identify how a character is feeling using picture supports.", shortname: "identify feelings" },
  { st: "Student will use a learned coping strategy when frustrated, with a prompt.", shortname: "use coping strategy" },
];

const SYSTEM =
  'You write terse "shortnames" for special-education speech-language short-term goals. ' +
  "A shortname is a 2–5 word lowercase skill label — an action phrase, never a full sentence. " +
  "Base each shortname only on its own short-term goal text. Output only what is asked for.";

// One Claude call per paste: given a long-term goal (context) and its short-term
// goals, returns one shortname per short-term goal, in order. Falls back to a
// derived label per item if the response can't be parsed, so the UI stays usable.
export async function suggestShortnames(
  apiKey: string,
  input: SuggestShortnamesInput,
): Promise<string[]> {
  const demos = ANCHORS.map((a) => `"${a.st}" -> ${a.shortname}`).join("\n");
  const revising = input.current !== undefined;
  const numbered = input.shortTerms
    .map((s, i) => {
      const cur = input.current?.[i];
      return cur ? `${i + 1}. ${s}\n   current shortname: "${cur}" (produce a different one)` : `${i + 1}. ${s}`;
    })
    .join("\n");
  const prompt = [
    `Style examples (short-term goal text -> shortname):\n${demos}`,
    `Long-term goal (context only, do not label it):\n${input.longTermGoal.trim() || "(none given)"}`,
    revising
      ? `Revise the shortname for each short-term goal below — return a NEW shortname that differs from the current one:\n${numbered}`
      : `Write a shortname for each of these short-term goals:\n${numbered}`,
    input.feedback ? `Apply this feedback to the shortnames: ${input.feedback}` : "",
    `Return ONLY a JSON array of exactly ${input.shortTerms.length} shortname strings, one per ` +
      `short-term goal in order. Each must be distinct and derived from its own goal text. ` +
      `No prose, no code fence.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await callAnthropic(apiKey, {
    model: DEFAULT_MODEL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.map((c) => c.text).join("");
  return parseShortnames(text, input.shortTerms);
}

function parseShortnames(text: string, shortTerms: string[]): string[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    try {
      const arr: unknown = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr)) {
        return shortTerms.map((st, i) => {
          const v = arr[i];
          return typeof v === "string" && v.trim() ? v.trim() : fallbackShortname(st);
        });
      }
    } catch {
      // Unparseable — fall through to per-item fallback.
    }
  }
  return shortTerms.map(fallbackShortname);
}

function fallbackShortname(shortTerm: string): string {
  return shortTerm.trim().toLowerCase().split(/\s+/).slice(0, 5).join(" ");
}
