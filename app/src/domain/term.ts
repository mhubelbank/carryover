export type TermType = "school-year" | "summer";

export interface Term {
  termType: TermType;
  firstDay: string;
  lastDay: string;
  label: string;
}
