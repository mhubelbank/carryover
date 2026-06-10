// Acronyms that should always render upper-case in note text, however they were
// typed (e.g. a goal's measured noun "wh questions" → "WH questions"). Add more
// here as needed (MLU, AAC, …). Matched as whole tokens, so words that merely
// contain the letters ("what", "while") are left alone.
const ACRONYMS = ["WH"];

const ACRONYM_RE = new RegExp(`\\b(${ACRONYMS.join("|")})\\b`, "gi");

export function normalizeAcronyms(text: string): string {
  return text.replace(ACRONYM_RE, (m) => m.toUpperCase());
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
