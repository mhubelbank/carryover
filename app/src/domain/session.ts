import type { Mode } from "./teacher";

export interface SessionStudentEntry {
  studentId: string;
  goalIds: string[];
  mode: Mode;
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
