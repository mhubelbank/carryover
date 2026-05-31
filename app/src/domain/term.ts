export type TermType = "school-year" | "summer";

export interface Term {
  termType: TermType;
  firstDay: string;
  lastDay: string;
  label: string;
  // ISO dates (YYYY-MM-DD) within the term with no school (holidays, snow days),
  // marked manually from Today. Absent = none.
  closures?: string[];
}

// Auto-label a term from its type and dates: "School Year 2026–2027" (or a
// single year if the dates don't span a boundary) / "Summer 2026".
export function termLabel(termType: TermType, firstDay: string, lastDay: string): string {
  const startYear = firstDay.slice(0, 4);
  const endYear = lastDay.slice(0, 4);
  if (termType === "summer") return startYear ? `Summer ${startYear}` : "Summer";
  if (startYear && endYear && startYear !== endYear) {
    return `School Year ${startYear}–${endYear}`;
  }
  return startYear ? `School Year ${startYear}` : "School Year";
}
