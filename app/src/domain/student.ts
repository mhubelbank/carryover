export interface Student {
  id: string;
  name: string;
  pronouns: string;
  teacherId: string;
  age: number | null;
  aacDevice: string | null;
  nextIepReview: string | null;
  nextTriennial: string | null;
  mandate: string | null;
  // Teacher-specific quirk columns (e.g. needsBengali). Raw string values,
  // declared per teacher and rendered on the student detail screen.
  fields: Record<string, string>;
}

export type AgeFlag = "ok" | "warn" | "alert";

// NY eligibility: 21 is the final eligible year (warn); 22+ is a likely data
// error or a COVID-era extension worth verifying (alert).
export function ageFlag(age: number | null): AgeFlag {
  if (age == null) return "ok";
  if (age >= 22) return "alert";
  if (age >= 21) return "warn";
  return "ok";
}
