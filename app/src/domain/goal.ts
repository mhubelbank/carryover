export interface Goal {
  id: string;
  studentId: string;
  longTermGoal: string;
  // Full short-term goal sentence — fed to the note generator. Empty for goals
  // entered before this was tracked; callers fall back to `shortName`.
  shortTermGoal: string;
  // Terse label (e.g. "WH questions") shown as the goal's checkbox in Generate.
  shortName: string;
  // The Trials count phrase, split into a past-tense verb ("answered") and its
  // object ("wh questions"); joined they slot into "{Name} correctly ___ 6/10".
  // Empty for goals from before this was tracked; Trials falls back to shortName.
  measuredVerb: string;
  measuredNoun: string;
  // Mastery criterion for the Progress view: "{targetPercent}% correct at
  // {targetLevel} support or better". 0 = no target → no threshold evaluation.
  // `targetLevel` is a TRIAL_SUPPORT_LEVELS value ("no support" = fully
  // independent); only meaningful when targetPercent > 0.
  targetPercent: number;
  targetLevel: string;
  archived: boolean;
}

// The joined Trials count phrase ("answered wh questions"), or "" if unset.
export function goalMeasuredAction(goal: Pick<Goal, "measuredVerb" | "measuredNoun">): string {
  return [goal.measuredVerb, goal.measuredNoun].map((s) => s.trim()).filter(Boolean).join(" ");
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
