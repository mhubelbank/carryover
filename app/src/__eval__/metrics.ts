// Deterministic quality metrics for batch-eval notes, so a multi-model run
// reports RATES (pronoun slips, over-enumerated/overlong closings, "addressed"
// filler) instead of needing a manual read of every note. Heuristic by design —
// these flag notes for review, they are not hard gates.
import { pronounMismatches } from "../domain/text";

// "-ing" words that are not skill gerunds, so they don't inflate the closing
// gerund count ("during a routine", "following a morning assessment").
const NON_GERUNDS = new Set([
  "during",
  "morning",
  "evening",
  "following",
  "nothing",
  "something",
  "anything",
]);

// A closing past this many words, or naming more than this many gerunds, is
// treated as over-stuffed (the 1.3 over-enumeration failure). The gerund limit is
// 4 (flags 5+), not 3: a healthy closing legitimately carries ~2 woven skill
// gerunds plus 1–2 structural ones (advancing/comprehending/participating), and
// flagging at >3 produced mostly false positives on concise ~20-word closings.
const CLOSING_WORD_LIMIT = 34;
const CLOSING_GERUND_LIMIT = 4;

export interface NoteFlags {
  pronoun: string[]; // wrong-gender pronouns found (empty = consistent)
  closingWords: number;
  closingGerunds: number;
  bloatedClosing: boolean; // over-enumerated or overlong final sentence
  filler: boolean; // "addressed/this work addressed" goal-naming filler
}

function lastSentence(note: string): string {
  const parts = note.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function noteFlags(note: string, pronouns: string): NoteFlags {
  const closing = lastSentence(note);
  const closingWords = closing.split(/\s+/).filter(Boolean).length;
  const gerunds = (closing.toLowerCase().match(/\b[a-z]+ing\b/g) ?? []).filter((w) => !NON_GERUNDS.has(w));
  return {
    pronoun: pronounMismatches(note, pronouns),
    closingWords,
    closingGerunds: gerunds.length,
    bloatedClosing: gerunds.length > CLOSING_GERUND_LIMIT || closingWords > CLOSING_WORD_LIMIT,
    // The goals should be woven as functional purposes ("as he answered…"), so a
    // bare "addressed [goals]" construction reads as filler.
    filler: /\baddress(ed|es|ing)\b/i.test(note),
  };
}
