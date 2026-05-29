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
