import type { Mode } from "./teacher";
import type { TrialEntry } from "./trial";

export interface SessionStudentEntry {
  studentId: string;
  goalIds: string[];
  mode: Mode;
  // Marked absent in Generate for this session. Absent students still get a row
  // (so Today/Schedule can show the absence) but their note is just "X was absent."
  absent?: boolean;
  // Per-goal trial measurements captured this session (each carries its goalId
  // for longitudinal progress data). Note text is still not stored. Absent/empty
  // when no trials were taken.
  trials?: TrialEntry[];
  // Per-goal QUALITATIVE support for activities logged WITHOUT trials — the
  // most-supportive prompting level used, as an independence proxy. Lets non-trial
  // sessions still feed the progress charts and report cards. One entry per goal.
  quals?: { goalId: string; promptLevel: string }[];
}

export interface SessionMetadata {
  // YYYY-MM-DD; together with teacherId this is the session-file identity.
  date: string;
  teacherId: string;
  students: SessionStudentEntry[];
}

// Number of distinct sessions in which each goal id was targeted. Powers the
// "Used in N sessions" counts on the Goals view.
export function goalUsageCounts(sessions: SessionMetadata[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const seen = new Set<string>();
    for (const entry of session.students) {
      for (const goalId of entry.goalIds) {
        if (seen.has(goalId)) continue;
        seen.add(goalId);
        counts.set(goalId, (counts.get(goalId) ?? 0) + 1);
      }
    }
  }
  return counts;
}
