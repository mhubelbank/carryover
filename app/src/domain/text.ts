// Acronyms that should always render upper-case in note text, however they were
// typed (e.g. a goal's measured noun "wh questions" → "WH questions"). Add more
// here as needed (MLU, AAC, …). Matched as whole tokens, so words that merely
// contain the letters ("what", "while") are left alone.
const ACRONYMS = ["WH"];

const ACRONYM_RE = new RegExp(`\\b(${ACRONYMS.join("|")})\\b`, "gi");

export function normalizeAcronyms(text: string): string {
  return text.replace(ACRONYM_RE, (m) => m.toUpperCase());
}
