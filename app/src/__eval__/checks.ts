// Deterministic checks scored against a generated note. Each encodes a rule
// Emily cares about, so prompt changes can be regression-tested. "na" = the
// check doesn't apply to this fixture.
import type { Fixture } from "./fixtures";

export type Status = "pass" | "fail" | "na";
export interface CheckResult {
  status: Status;
  detail?: string;
}
export interface Check {
  id: string;
  label: string;
  run: (note: string, fx: Fixture) => CheckResult;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export const CHECKS: Check[] = [
  {
    id: "trial-counts",
    label: "trial counts preserved verbatim",
    run: (note, fx) => {
      if (fx.trialNumbers.length === 0) return { status: "na" };
      const missing = fx.trialNumbers.filter((n) => !note.includes(n));
      return missing.length === 0
        ? { status: "pass" }
        : { status: "fail", detail: `missing counts: ${missing.join(", ")}` };
    },
  },
  {
    id: "no-goal-dump",
    label: "doesn't paste the full goal sentence",
    run: (note, fx) => {
      if (fx.fullGoalTexts.length === 0) return { status: "na" };
      const body = squash(note);
      const dumped = fx.fullGoalTexts.filter((g) => body.includes(squash(g)));
      return dumped.length === 0
        ? { status: "pass" }
        : { status: "fail", detail: `verbatim goal text in note (${dumped.length})` };
    },
  },
  {
    id: "no-leading-label",
    label: "no name/Note: label at the start",
    run: (note, fx) => {
      const head = note.trim();
      const bad = /^(note|student)\s*:/i.test(head) || head.toLowerCase().startsWith(`${fx.studentName.toLowerCase()}:`);
      return bad ? { status: "fail", detail: `starts with "${head.slice(0, 24)}…"` } : { status: "pass" };
    },
  },
  {
    id: "no-artifacts",
    label: "no markdown/AI/marker artifacts",
    run: (note) => {
      const m = note.match(/\[\[|```|^#\s|as an ai|logic issue/im);
      return m ? { status: "fail", detail: `found "${m[0]}"` } : { status: "pass" };
    },
  },
  {
    id: "redirection-to-task",
    label: 'redirection phrased "to task"',
    run: (note, fx) => {
      if (!fx.usesRedirection) return { status: "na" };
      return /to task/i.test(note) ? { status: "pass" } : { status: "fail", detail: '"redirection" without "to task"' };
    },
  },
];
