// Per-student progress report ("report card"): assembles a date-ranged summary of
// a student's goals (numbers from the pure progress analytics) and generates a
// short professional narrative per goal via the same LLM pipeline notes use.
//
// Privacy mirrors notes: nothing here is written to the data repo. The numeric
// half is pure/deterministic (testable); the narrative half is the only LLM part
// and is cached locally (see clients/reportCache.ts), never persisted server-side.
import { callModel, llmErrorStatus, type SystemBlock } from "../clients/llm";
import type { Provider } from "../clients/models";
import type { DataClient } from "../clients/github";
import { cleanClaudeResponse, renderTemplate, type TemplateContext } from "./notes";
import type { Student } from "./student";
import { fullName } from "./student";
import type { Goal } from "./goal";
import { groupByLongTerm } from "./goal";
import type { SessionMetadata } from "./session";
import {
  studentGoalProgress,
  studentQualSupport,
  overallTrend,
  type GoalSessionPoint,
  type QualSupportPoint,
} from "./progress";
import { TRIAL_SUPPORT_LEVELS, TRIAL_SUPPORT_TYPES } from "./trial";

// ---------------------------------------------------------------------------
// Report data model (pure)
// ---------------------------------------------------------------------------

// A metric's value at the start vs. the end of the reporting period.
export interface MetricDelta {
  start: number; // first session in range
  current: number; // most recent session in range
  delta: number; // current − start
}

export interface ReportGoalSummary {
  goal: Goal;
  sessionCount: number; // sessions in range with data for this goal
  // Trial-based metrics — null when the goal was worked only qualitatively (no trials).
  accuracy: MetricDelta | null;
  independence: MetricDelta | null;
  criterionMet: MetricDelta | null; // at target level-or-better; null if no target set
  points: GoalSessionPoint[]; // trial points in range, for the charts
  // Which prompt cues the student relied on (when supported), and how the
  // most-relied-on cue shifted across the period. Null for qual goals or when no
  // cues were needed (fully independent). Descriptive — not a headline metric.
  support: SupportProfile | null;
  // Qualitative support trend when there are no trials (independence proxy from
  // the prompting level used). Null when the goal has trial data instead.
  qual: { support: MetricDelta; points: QualSupportPoint[] } | null;
}

export interface SupportProfile {
  typesRanked: string[]; // cue types used, most-relied-on first
  counts: Record<string, number>; // success count per cue type (fed to the narrative, not shown)
  dominant: string | null; // most-relied-on cue across the period
  baselineDominant: string | null; // dominant cue in the first session with data
  currentDominant: string | null; // dominant cue in the most recent session
}

export interface ReportGroup {
  longTermGoal: string;
  goals: ReportGoalSummary[];
}

export interface StudentReport {
  studentId: string;
  rangeStart: string; // YYYY-MM-DD, inclusive
  rangeEnd: string; // YYYY-MM-DD, inclusive
  sessionCount: number; // distinct session dates in range with data for this student
  // Pooled (trial-weighted) accuracy/independence across all goals; null if no trials.
  overall: { accuracy: MetricDelta | null; independence: MetricDelta | null } | null;
  groups: ReportGroup[]; // every active goal, grouped by long-term goal
}

function md(values: number[]): MetricDelta | null {
  if (values.length === 0) return null;
  const start = values[0]!;
  const current = values[values.length - 1]!;
  return { start, current, delta: current - start };
}

// % of a session's trials correct at `level` support OR BETTER (more independent).
// Local copy of the GoalScorecard math so this domain module stays UI-free.
function critPct(p: GoalSessionPoint, level: string): number {
  const levels: readonly string[] = TRIAL_SUPPORT_LEVELS;
  const idx = levels.indexOf(level);
  if (idx < 0 || !p.total) return p.independencePct;
  let met = 0;
  for (let i = 0; i <= idx; i++) met += p.byLevel[levels[i]!] ?? 0;
  return Math.round((met / p.total) * 100);
}

// The most-relied-on cue type in one session (highest success count), or null
// when no cues were used (all-independent session).
function dominantType(byType: Record<string, number>): string | null {
  let best: string | null = null;
  let bestN = 0;
  for (const t of TRIAL_SUPPORT_TYPES) {
    const n = byType[t] ?? 0;
    if (n > bestN) {
      bestN = n;
      best = t;
    }
  }
  return best;
}

// Which cue types the student leaned on across the period, ranked, plus how the
// dominant cue shifted from the first to the most recent session. Null when no
// cues were needed at all (fully independent).
function supportProfile(points: GoalSessionPoint[]): SupportProfile | null {
  if (points.length === 0) return null;
  const total: Record<string, number> = {};
  for (const p of points) {
    for (const t of TRIAL_SUPPORT_TYPES) {
      const n = p.byType[t] ?? 0;
      if (n) total[t] = (total[t] ?? 0) + n;
    }
  }
  const typesRanked = TRIAL_SUPPORT_TYPES.filter((t) => (total[t] ?? 0) > 0).sort(
    (a, b) => (total[b] ?? 0) - (total[a] ?? 0),
  );
  if (typesRanked.length === 0) return null; // all independent — no cues to profile
  return {
    typesRanked,
    counts: total,
    dominant: typesRanked[0] ?? null,
    baselineDominant: dominantType(points[0]!.byType),
    currentDominant: dominantType(points[points.length - 1]!.byType),
  };
}

// Build a per-student report over [rangeStart, rangeEnd] (inclusive). Every active
// goal is included (a progress report addresses each IEP goal, even unaddressed
// ones); goals with no data in range have null metrics and a 0 session count.
export function buildStudentReport(
  student: Student,
  goals: Goal[],
  sessions: SessionMetadata[],
  rangeStart: string,
  rangeEnd: string,
): StudentReport {
  const inRange = sessions.filter((s) => s.date >= rangeStart && s.date <= rangeEnd);
  const studentGoals = goals.filter((g) => g.studentId === student.id && !g.archived);
  const prog = studentGoalProgress(inRange, student.id);
  const qual = studentQualSupport(inRange, student.id);

  // Distinct session dates where this student has any non-absent data.
  const dates = new Set<string>();
  for (const s of inRange) {
    const e = s.students.find((x) => x.studentId === student.id);
    if (e && !e.absent && (e.trials?.length || e.quals?.length)) dates.add(s.date);
  }

  const overallPts = overallTrend(prog);
  const overall =
    overallPts.length > 0
      ? {
          accuracy: md(overallPts.map((p) => p.accuracyPct)),
          independence: md(overallPts.map((p) => p.independencePct)),
        }
      : null;

  const summarize = (goal: Goal): ReportGoalSummary => {
    const pts = prog.get(goal.id)?.points ?? [];
    const qpts = qual.get(goal.id) ?? [];
    const hasTarget = goal.targetPercent > 0 && !!goal.targetLevel;
    return {
      goal,
      sessionCount: pts.length || qpts.length,
      accuracy: pts.length ? md(pts.map((p) => p.accuracyPct)) : null,
      independence: pts.length ? md(pts.map((p) => p.independencePct)) : null,
      criterionMet: pts.length && hasTarget ? md(pts.map((p) => critPct(p, goal.targetLevel))) : null,
      points: pts,
      support: pts.length ? supportProfile(pts) : null,
      qual:
        pts.length === 0 && qpts.length > 0
          ? { support: md(qpts.map((p) => p.supportPct))!, points: qpts }
          : null,
    };
  };

  const groups = groupByLongTerm(studentGoals).map((g) => ({
    longTermGoal: g.longTermGoal,
    goals: g.goals.map(summarize),
  }));

  return {
    studentId: student.id,
    rangeStart,
    rangeEnd,
    sessionCount: dates.size,
    overall,
    groups,
  };
}

// ---------------------------------------------------------------------------
// Plain-text rendering (Copy button)
// ---------------------------------------------------------------------------

// YYYY-MM-DD -> "M/D/YY" without a Date (timezone-safe).
function shortDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}/${Number(y?.substring(2))}`;
}

function deltaStr(m: MetricDelta | null): string {
  if (!m) return "—";
  return m.start === m.current ? `${m.current}%` : `${m.start}% → ${m.current}%`;
}

// A goal's mastery-target phrase ("80% at minimal or better"), or "" if unset.
function targetLabel(goal: Goal): string {
  if (!(goal.targetPercent > 0 && goal.targetLevel)) return "";
  return goal.targetLevel === "no support"
    ? `${goal.targetPercent}% independent`
    : `${goal.targetPercent}% at ${goal.targetLevel} or better`;
}

export type RatingTone = "met" | "on-track" | "slow" | "none";
export interface ReportRating {
  label: string;
  tone: RatingTone;
}

// Per-goal progress verdict — the heart of an IEP progress report. Met when the
// goal's criterion is reached; otherwise On track (improving) vs Progressing
// slowly (flat/declining); Not yet addressed when nothing was logged. Goals
// without trial counts (qual only) or without a target are judged on trend.
export function goalRating(s: ReportGoalSummary): ReportRating {
  if (s.sessionCount === 0) return { label: "Not yet addressed", tone: "none" };
  if (s.qual) {
    return s.qual.support.delta > 0
      ? { label: "On track", tone: "on-track" }
      : { label: "Progressing slowly", tone: "slow" };
  }
  if (s.criterionMet && s.goal.targetPercent > 0) {
    if (s.criterionMet.current >= s.goal.targetPercent) return { label: "Met", tone: "met" };
    return s.criterionMet.delta > 0
      ? { label: "On track", tone: "on-track" }
      : { label: "Progressing slowly", tone: "slow" };
  }
  if (s.accuracy) {
    return s.accuracy.delta > 0
      ? { label: "On track", tone: "on-track" }
      : { label: "Progressing slowly", tone: "slow" };
  }
  return { label: "Progressing slowly", tone: "slow" };
}

// The "Baseline → Current (Target)" line — for a goal with a target this tracks
// criterion-met %; without a target, accuracy %; for qual-only goals, the support
// proxy. "" when the goal has no data this period.
export function goalBaselineLine(s: ReportGoalSummary): string {
  if (s.sessionCount === 0) return "";
  if (s.qual) {
    return `Baseline ${s.qual.support.start}% → Current ${s.qual.support.current}% support (from prompting)`;
  }
  if (s.criterionMet && s.goal.targetPercent > 0) {
    return `Baseline ${s.criterionMet.start}% → Current ${s.criterionMet.current}% (Target ${targetLabel(s.goal)})`;
  }
  if (s.accuracy) {
    return `Baseline ${s.accuracy.start}% → Current ${s.accuracy.current}% accuracy`;
  }
  return "";
}

// "Support used: verbal, visual" — the cue types relied on this period, most
// first. "" when there were no cues (fully independent) or no trial data.
export function goalSupportLine(s: ReportGoalSummary): string {
  if (!s.support) return "";
  return `Support used: ${s.support.typesRanked.join(", ")}`;
}

// Plain-text report for the clipboard. Charts are omitted (text-only); narratives
// come from a generated/cached ReportNarratives.
export function reportText(
  student: Student,
  report: StudentReport,
  narratives: ReportNarratives,
  periodLabel: string,
): string {
  const lines: string[] = [];
  lines.push(`${fullName(student)} — Speech-Language Progress Report`);
  // Open-ended (all-history) ranges use sentinel bounds — show no dates for them.
  const openEnded = report.rangeStart <= "0001-01-01" || report.rangeEnd >= "9999-12-31";
  const range = openEnded ? "" : `${shortDate(report.rangeStart)}–${shortDate(report.rangeEnd)} · `;
  lines.push(
    `${periodLabel} · ${range}${report.sessionCount} session${report.sessionCount === 1 ? "" : "s"}`,
  );
  lines.push("");
  // If nothing was logged this period, say so once instead of repeating it for
  // every goal.
  const anyData = report.groups.some((g) => g.goals.some((s) => s.sessionCount > 0));
  if (!anyData) {
    lines.push(
      `No trials or prompting were logged for ${student.firstName} during this reporting period.`,
    );
    return lines.join("\n").trimEnd() + "\n";
  }
  if (narratives.summary.trim()) {
    lines.push(narratives.summary.trim());
    lines.push("");
  }
  for (const group of report.groups) {
    lines.push(`LONG-TERM GOAL: ${group.longTermGoal}`);
    for (const s of group.goals) {
      const label = s.goal.shortTermGoal?.trim() || s.goal.shortName || "Goal";
      lines.push(`  • ${label}  [${goalRating(s).label}]`);
      const baseline = goalBaselineLine(s);
      if (baseline) lines.push(`    ${baseline}`);
      const support = goalSupportLine(s);
      if (support) lines.push(`    ${support}`);
      const narrative = narratives.goals[s.goal.id]?.trim();
      if (narrative) lines.push(`    ${narrative}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

// ---------------------------------------------------------------------------
// Narrative generation (LLM)
// ---------------------------------------------------------------------------

export interface ReportNarratives {
  summary: string;
  goals: Record<string, string>; // goalId -> paragraph
}

export interface ReportPrompts {
  goal: string;
  summary: string;
}

// System prompt for every report call — the anti-invention discipline, adapted
// from NOTE_SYSTEM for narrative progress reporting.
export const REPORT_SYSTEM =
  "You write professional SLP IEP progress-report narratives for a school speech-language " +
  "pathologist. Use ONLY the quantitative data provided — never invent behaviors, numbers, " +
  "activities, or specifics that are not in the data. Refer to the student by name and use " +
  "exactly the pronouns given; never infer them from the name. Write plain professional prose " +
  "(no headings, no bullet points, no preamble or sign-off) — just the paragraph itself.";

// Defaults baked into the app so the feature works without a prompt push; an SLP
// reviews every report before use, so a built-in default is safe here (unlike
// clinical notes, which fail rather than fake). Override by committing
// data/prompts/report-goal.md / report-summary.md to the data branch.
export const REPORT_GOAL_PROMPT = `Write a 2–4 sentence IEP progress-report paragraph for {{name}} (use {{pronouns}} pronouns).

Short-term goal: "{{shortTermGoal}}"
Long-term goal: {{longTermGoal}}
{{periodLine}}

Quantitative data for this reporting period — base the paragraph ONLY on these:
{{dataLines}}

Describe the trajectory (improving, steady, or variable) and {{name}}'s current level of support relative to the goal. Do not state any number, behavior, or activity not listed above.`;

export const REPORT_SUMMARY_PROMPT = `Write a brief 2–3 sentence opening summary for {{name}}'s speech-language progress report (use {{pronouns}} pronouns).

{{periodLine}}
Across all goals worked this reporting period:
{{overallLines}}

Summarize {{name}}'s overall progress at a high level. Use ONLY the information above; do not invent any specific behavior, activity, or number.`;

const PROMPT_DIR = "data/prompts";

// Load report templates, preferring data-branch overrides, falling back to the
// in-code defaults. Never throws — a missing/failed fetch just uses the default.
export async function loadReportPrompts(client: DataClient): Promise<ReportPrompts> {
  const read = async (name: string, fallback: string): Promise<string> => {
    try {
      const file = await client.readFile(`${PROMPT_DIR}/${name}`);
      return file?.text?.trim() ? file.text : fallback;
    } catch {
      return fallback;
    }
  };
  const [goal, summary] = await Promise.all([
    read("report-goal.md", REPORT_GOAL_PROMPT),
    read("report-summary.md", REPORT_SUMMARY_PROMPT),
  ]);
  return { goal, summary };
}

function periodLine(report: StudentReport): string {
  const sessions = `${report.sessionCount} session${report.sessionCount === 1 ? "" : "s"} with data`;
  // All-history reports use sentinel bounds; describe the span in words rather
  // than feeding the model nonsensical dates (1/1/1–12/31/9999).
  const openEnded = report.rangeStart <= "0001-01-01" || report.rangeEnd >= "9999-12-31";
  if (openEnded) return `Reporting period: all sessions recorded to date (${sessions}).`;
  return `Reporting period: ${shortDate(report.rangeStart)}–${shortDate(report.rangeEnd)} (${sessions}).`;
}

// The per-goal data block fed to the prompt — pre-rendered as text so the template
// needs no conditionals (robust against the Handlebars subset).
function goalDataLines(s: ReportGoalSummary): string {
  const lines: string[] = [];
  if (s.qual) {
    lines.push(
      `- Support level (independence proxy from the prompting used; higher = less support): ${deltaStr(s.qual.support)}. No trial counts were taken for this goal.`,
    );
  } else {
    if (s.accuracy) lines.push(`- Accuracy (correct at any support ÷ trials): ${deltaStr(s.accuracy)}.`);
    if (s.independence) lines.push(`- Independence (correct with no support ÷ trials): ${deltaStr(s.independence)}.`);
    if (s.criterionMet) {
      const t = s.goal;
      const tl = t.targetLevel === "no support" ? `${t.targetPercent}% independent` : `${t.targetPercent}% at ${t.targetLevel} or better`;
      lines.push(`- Met criterion (target ${tl}): ${deltaStr(s.criterionMet)}.`);
    }
    if (s.support) {
      const cued = s.support.typesRanked.map((t) => `${t} (${s.support!.counts[t] ?? 0})`).join(", ");
      lines.push(`- Cues relied on when supported, most to least (success counts): ${cued}.`);
      if (
        s.support.baselineDominant &&
        s.support.currentDominant &&
        s.support.baselineDominant !== s.support.currentDominant
      ) {
        lines.push(
          `- The most-relied-on cue shifted from ${s.support.baselineDominant} to ${s.support.currentDominant} over the period.`,
        );
      }
    }
  }
  lines.push(`- Sessions with data this period: ${s.sessionCount}.`);
  return lines.join("\n");
}

export function reportGoalContext(s: ReportGoalSummary, student: Student, report: StudentReport): TemplateContext {
  return {
    name: student.firstName,
    pronouns: student.pronouns || "they/them",
    shortTermGoal: s.goal.shortTermGoal?.trim() || s.goal.shortName || "this goal",
    longTermGoal: s.goal.longTermGoal || "—",
    periodLine: periodLine(report),
    dataLines: goalDataLines(s),
  };
}

export function reportSummaryContext(report: StudentReport, student: Student): TemplateContext {
  const lines: string[] = [];
  if (report.overall?.accuracy) lines.push(`- Overall accuracy across goals: ${deltaStr(report.overall.accuracy)}.`);
  if (report.overall?.independence) lines.push(`- Overall independence across goals: ${deltaStr(report.overall.independence)}.`);
  const goalCount = report.groups.reduce((n, g) => n + g.goals.filter((x) => x.sessionCount > 0).length, 0);
  lines.push(`- Goals addressed this period: ${goalCount}.`);
  return {
    name: student.firstName,
    pronouns: student.pronouns || "they/them",
    periodLine: periodLine(report),
    overallLines: lines.join("\n"),
  };
}

export interface ReportModel {
  provider: Provider;
  model: string;
}

const BACKOFF_MS = [800, 2500];

async function callOnce(
  apiKey: string,
  model: ReportModel,
  system: string | SystemBlock[],
  prompt: string,
  maxTokens: number,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    try {
      const res = await callModel(model.provider, apiKey, {
        model: model.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      return cleanClaudeResponse(res.text);
    } catch (err) {
      lastErr = err;
      const status = llmErrorStatus(err);
      const retryable = status === undefined || status === 429 || (status >= 500 && status < 600);
      const wait = BACKOFF_MS[attempt];
      if (!retryable || wait === undefined) break;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("report model call failed");
}

// Run `fn` over items with at most `limit` in flight at once (mirrors the notes
// pipeline's concurrency cap), preserving input order in the result.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

export interface GenerateReportOptions {
  model: ReportModel;
  maxTokens?: number;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

// Generate per-goal narratives (parallel, capped) plus one overall summary.
// Only goals with data in range are narrated; empty goals are left to fixed text.
export async function generateReport(
  apiKey: string,
  prompts: ReportPrompts,
  report: StudentReport,
  student: Student,
  opts: GenerateReportOptions,
): Promise<ReportNarratives> {
  const maxTokens = opts.maxTokens ?? 400;
  const toNarrate = report.groups.flatMap((g) => g.goals).filter((s) => s.sessionCount > 0);
  const total = toNarrate.length + (report.overall ? 1 : 0);
  let done = 0;
  const tick = () => opts.onProgress?.(++done, total);

  const goalEntries = await mapPool(toNarrate, opts.concurrency ?? 4, async (s) => {
    const text = await callOnce(
      apiKey,
      opts.model,
      REPORT_SYSTEM,
      renderTemplate(prompts.goal, reportGoalContext(s, student, report)),
      maxTokens,
    );
    tick();
    return [s.goal.id, text] as const;
  });

  let summary = "";
  if (report.overall) {
    summary = await callOnce(
      apiKey,
      opts.model,
      REPORT_SYSTEM,
      renderTemplate(prompts.summary, reportSummaryContext(report, student)),
      maxTokens,
    );
    tick();
  }

  return { summary, goals: Object.fromEntries(goalEntries) };
}

// Deterministic, data-grounded narrative for demo mode (no key, no LLM). Mirrors
// Generate's canned-note path so the feature is explorable without credentials.
export function cannedNarratives(report: StudentReport, student: Student): ReportNarratives {
  const name = student.firstName;
  const trend = (m: MetricDelta | null): string =>
    !m ? "" : m.delta > 4 ? "improved" : m.delta < -4 ? "declined" : "held steady";
  const goals: Record<string, string> = {};
  for (const s of report.groups.flatMap((g) => g.goals)) {
    if (s.sessionCount === 0) continue;
    if (s.qual) {
      goals[s.goal.id] =
        `Over ${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"} this period, ${name}'s independence on this goal ${trend(s.qual.support)} (${deltaStr(s.qual.support)} support proxy from the prompting used). Trial counts were not recorded for this goal.`;
    } else if (s.accuracy) {
      const crit = s.criterionMet ? ` Performance toward criterion moved ${deltaStr(s.criterionMet)}.` : "";
      goals[s.goal.id] =
        `Across ${s.sessionCount} session${s.sessionCount === 1 ? "" : "s"}, ${name}'s accuracy ${trend(s.accuracy)} (${deltaStr(s.accuracy)}) and independence ${trend(s.independence)} (${deltaStr(s.independence)}).${crit}`;
    }
  }
  const summary = report.overall?.accuracy
    ? `This reporting period, ${name} participated in ${report.sessionCount} session${report.sessionCount === 1 ? "" : "s"}. Overall accuracy ${trend(report.overall.accuracy)} (${deltaStr(report.overall.accuracy)}) and independence ${trend(report.overall.independence)} across targeted goals.`
    : "";
  return { summary, goals };
}
