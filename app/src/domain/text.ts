// Acronyms that should always render upper-case in note text, however they were
// typed (e.g. a goal's measured noun "wh questions" → "WH questions"). Add more
// here as needed (MLU, AAC, …). Matched as whole tokens, so words that merely
// contain the letters ("what", "while") are left alone.
const ACRONYMS = ["WH"];

const ACRONYM_RE = new RegExp(`\\b(${ACRONYMS.join("|")})\\b`, "gi");

export function normalizeAcronyms(text: string): string {
  return text.replace(ACRONYM_RE, (m) => m.toUpperCase());
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
