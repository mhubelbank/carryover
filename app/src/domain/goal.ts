export interface Goal {
  id: string;
  studentId: string;
  longTermGoal: string;
  // Full short-term goal sentence — fed to the note generator. Empty for goals
  // entered before this was tracked; callers fall back to `shortName`.
  shortTermGoal: string;
  // Terse label (e.g. "WH questions") shown as the goal's checkbox in Generate.
  shortName: string;
  archived: boolean;
}

export interface LongTermGroup {
  longTermGoal: string;
  goals: Goal[];
}

// Group a student's short-term goals under their long-term goal text,
// preserving first-seen order.
export function groupByLongTerm(goals: Goal[]): LongTermGroup[] {
  const groups: LongTermGroup[] = [];
  const index = new Map<string, LongTermGroup>();
  for (const goal of goals) {
    let group = index.get(goal.longTermGoal);
    if (!group) {
      group = { longTermGoal: goal.longTermGoal, goals: [] };
      index.set(goal.longTermGoal, group);
      groups.push(group);
    }
    group.goals.push(goal);
  }
  return groups;
}
