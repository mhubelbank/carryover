// Acronyms that should always render upper-case in note text, however they were
// typed (e.g. a goal's measured noun "wh questions" → "WH questions"). Add more
// here as needed (MLU, AAC, …). Matched as whole tokens, so words that merely
// contain the letters ("what", "while") are left alone.
const ACRONYMS = ["WH"];

const ACRONYM_RE = new RegExp(`\\b(${ACRONYMS.join("|")})\\b`, "gi");

export function normalizeAcronyms(text: string): string {
  return text.replace(ACRONYM_RE, (m) => m.toUpperCase());
}

// Common clinical-term misspellings (the SLP's typo or a model slip) corrected in
// the final note as whole words, preserving leading capitalization. Keep this map
// tight — only unambiguous corrections of a real clinical term.
const CLINICAL_SPELLING: Record<string, string> = {
  disregulated: "dysregulated",
  dysregular: "dysregulated",
  disregulation: "dysregulation",
  disregulate: "dysregulate",
};

export function fixClinicalSpelling(text: string): string {
  return text.replace(/\b[A-Za-z]+\b/g, (m) => {
    const fix = CLINICAL_SPELLING[m.toLowerCase()];
    if (!fix) return m;
    return /^[A-Z]/.test(m) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
  });
}

// Support terms (prompting levels/types and redirection levels) the session
// specified that don't appear in the final note — i.e. a pass dropped them. "no"
// levels are skipped (a note legitimately omits "no prompting"). A warning, not a
// fix: these are exact session facts, so a missing one means clinical data was lost.
export function missingSupportTerms(note: string, terms: string[]): string[] {
  const lower = note.toLowerCase();
  const wanted = [...new Set(terms.map((t) => t.trim().toLowerCase()).filter((t) => t && t !== "no"))];
  return wanted.filter((t) => !new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower));
}

// True when the streamline pass dropped clinical detail the review pass had — a
// "redirection to task" clause vanished, or all prompting disappeared. The
// streamline is only meant to lightly clean prose, so a lost clause is a
// regression and the caller should keep the (clean) review note instead. Counts,
// not exact text, so a legitimate combine ("verbal and visual prompting") doesn't
// trip it — only an actual disappearance does.
export function streamlineLostClinicalDetail(reviewed: string, streamlined: string): boolean {
  const redirections = (s: string) => (s.match(/redirection to task/gi) ?? []).length;
  const hasPrompting = (s: string) => /\bprompting\b/i.test(s);
  if (redirections(streamlined) < redirections(reviewed)) return true;
  if (hasPrompting(reviewed) && !hasPrompting(streamlined)) return true;
  return false;
}

// First-person / self-correction language that a third-person clinical note never
// contains — its presence means the model leaked its thinking into the output
// (e.g. "Wait, I need to re-read the original…" then re-emitting the note).
const SELF_CORRECTION = /\b(wait,|let me\b|i need to\b|i'll\b|i should\b|on second thought|re-read the (original|note))/i;

// Meta-commentary a clinical note never contains: the model leaked its own
// reasoning/self-critique instead of emitting only the note. Broader than
// SELF_CORRECTION (which targets first-person "wait, I need to…") — this also
// catches an "issues to fix" preamble, a bare "Wait —" (em/en dash, the form
// SELF_CORRECTION's "wait," misses), an "I must/should not …" meta-instruction,
// an "as an AI/assistant" disclaimer, and a "here is the revised note" preamble.
const LEAK_MARKERS: RegExp[] = [
  /\bissues?\b[^.\n]{0,40}\bneed(?:s|ed)?\b[^.\n]{0,40}\bfix/i,
  /\bI (?:must|should) not\b/i,
  /\bWait\b\s*[—–]/,
  /\bas an? (?:AI|assistant|language model)\b/i,
  /\bhere(?:'s| is) (?:the |a |my )?(?:revised|corrected|rewritten|updated|final) (?:note|version)\b/i,
];

// True when the text contains leaked model reasoning/meta-commentary (see
// LEAK_MARKERS). Used both to drive recovery and to flag a note for review when
// recovery can't fully clean it.
export function hasLeakedReasoning(text: string): boolean {
  return LEAK_MARKERS.some((re) => re.test(text));
}

// Recover the clean note from a response where the model leaked its reasoning.
// Leaking models typically emit the note, critique it, then re-emit one or more
// revised versions separated by horizontal rules ("---"). Strategy: split on those
// rules and keep the LAST leak-free, note-like segment (the model's final intended
// version). If there's no separator, fall back to the longest run of consecutive
// leak-free sentences. No-op when no leak marker is present; never returns empty
// (returns the original text if nothing recovers, so the note is never lost — a
// residual leak is then surfaced by hasLeakedReasoning in the warnings).
export function stripLeakedReasoning(text: string): string {
  if (!hasLeakedReasoning(text)) return text;
  const noteLike = (s: string) =>
    s.length > 0 && !hasLeakedReasoning(s) && /[.!?]/.test(s) && s.split(/\s+/).length >= 8;
  const segments = text
    .split(/\s*-{3,}\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const cleanSegments = segments.filter(noteLike);
  if (cleanSegments.length) return cleanSegments[cleanSegments.length - 1]!;
  // No clean "---"-delimited segment — keep the longest run of consecutive
  // leak-free sentences (the note, with interspersed meta sentences dropped).
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let best: string[] = [];
  let run: string[] = [];
  for (const s of sentences) {
    if (hasLeakedReasoning(s)) {
      if (run.length > best.length) best = run;
      run = [];
    } else {
      run.push(s);
    }
  }
  if (run.length > best.length) best = run;
  const recovered = best.join(" ").trim();
  return recovered.split(/\s+/).length >= 8 ? recovered : text;
}

// A note whose first sentence is "<Name> <He|She|They> <verb>…" — the activity
// opener was dropped and the subject doubled (e.g. "Tess She correctly identified
// …"). A flag, not a fix: the missing opener can't be reconstructed.
export function hasDroppedOpener(text: string): boolean {
  return /^\s*[A-Z][a-z]+\s+(?:He|She|They)\b/.test(text.trim());
}

// The student's response/affect must be its own sentence, not fused onto the
// action with a concessive ("…redirection to task, though she was dysregulated"),
// which wrongly implies success despite the state. Split any ", though/although
// [pronoun] …" fusion into a standalone sentence. Targeted to subject pronouns so
// it never mangles a legitimate "though with prompting" or temporal "while".
export function splitConcessive(text: string): string {
  return text.replace(
    /,\s+(?:even though|though|although)\s+(he|she|they)\b/gi,
    (_m, p: string) => `. ${p.charAt(0).toUpperCase()}${p.slice(1).toLowerCase()}`,
  );
}

// Salvage a note when the model leaked a self-correction mid-output and usually
// re-emitted the corrected note. Only activates when that marker is present, so a
// normal note passes through untouched. Drops the meta sentences; if the note was
// emitted twice (its opening sentence repeats verbatim), keeps the last copy.
export function dropSelfCorrection(note: string): string {
  if (!SELF_CORRECTION.test(note)) return note;
  const sentences = note.split(/(?<=[.!?])\s+/).filter((s) => s.trim() && !SELF_CORRECTION.test(s));
  let out = sentences.join(" ").trim();
  const first = sentences[0]?.trim();
  if (first && first.length > 12) {
    const last = out.lastIndexOf(first);
    if (last > 0) out = out.slice(last).trim();
  }
  return out || note;
}

const MASCULINE = ["he", "him", "his", "himself"];
const FEMININE = ["she", "her", "hers", "herself"];

// Deterministic pronoun-fidelity check. Given the student's pronoun set, returns
// any clearly wrong-gender pronouns that appear in the note (deduped, lowercased)
// so the UI can flag a likely mismatch — the failure mode where a "they" student
// is written as "he". Conservative on purpose: it never flags "they/them" (which
// can legitimately refer to classmates or staff in group/news-day notes), only
// cross-gender singular pronouns. Empty array = looks consistent.
export function pronounMismatches(note: string, pronouns: string): string[] {
  const p = pronouns.toLowerCase();
  let banned: string[];
  // Order matters: "she" contains "he", so test feminine/they before masculine.
  if (p.includes("they") || p.includes("them")) banned = [...MASCULINE, ...FEMININE];
  else if (p.includes("she") || p.includes("her")) banned = MASCULINE;
  else if (p.includes("he") || p.includes("him")) banned = FEMININE;
  else return [];
  return banned.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(note));
}
