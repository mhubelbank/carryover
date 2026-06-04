// Shared progress visuals for a single goal: the glance scorecard plus the
// small Sparkline / Metric primitives and the criterion-met math. Used inline in
// the Goals editor and (for Sparkline/Metric/criterionMetPct) by the Progress
// overview.
import type { GoalProgress, GoalSessionPoint } from "../domain/progress";
import { TRIAL_SUPPORT_LEVELS, TRIAL_SUPPORT_TYPES } from "../domain/trial";
import { Icon } from "./Icon";
import { PROMPT_TYPE_ICON } from "./promptSymbols";

export interface Target {
  percent: number; // 0 = unset
  level: string; // TRIAL_SUPPORT_LEVELS value; "no support" = fully independent
}

// Metric definitions (tooltips) + colors. Accuracy = blue, Independence = green.
export const ACCURACY_DEF = "Correct at any support level ÷ total trials";
export const INDEPENDENCE_DEF = "Correct with no support (fully independent) ÷ total trials";
export const ACCURACY_COLOR = "var(--color-text-info)";
export const INDEPENDENCE_COLOR = "var(--color-text-success)";

// YYYY-MM-DD -> "M/D/YY" without constructing a Date (avoids timezone shifts).
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}/${Number(y?.substring(2))}`;
}

// % of trials correct at the target support level OR BETTER (more independent).
// Falls back to plain independence if the level is unknown.
export function criterionMetPct(p: GoalSessionPoint, level: string): number {
  const levels: readonly string[] = TRIAL_SUPPORT_LEVELS;
  const idx = levels.indexOf(level);
  if (idx < 0 || !p.total) return p.independencePct;
  let met = 0;
  for (let i = 0; i <= idx; i++) met += p.byLevel[levels[i]!] ?? 0;
  return Math.round((met / p.total) * 100);
}

function targetLabel(t: Target): string {
  return t.level === "no support" ? `${t.percent}% independent` : `${t.percent}% at ${t.level} or better`;
}

// The current support a goal still needs, read off the latest session.
function currentSupport(last: GoalSessionPoint): string {
  if (last.successful === 0) return "—";
  const order = ["maximum", "moderate", "minimal"];
  const supported = order.filter((l) => (last.byLevel[l] ?? 0) > 0);
  if (supported.length === 0) return "independent";
  const level = supported.sort((a, b) => (last.byLevel[b] ?? 0) - (last.byLevel[a] ?? 0))[0]!;
  const type = Object.entries(last.byType).sort((a, b) => b[1] - a[1])[0]?.[0];
  return type ? `${level} ${type}` : level;
}

// "Sessions until criterion" hint, from the criterion-met slope. Target must be set.
function masteryHint(pts: GoalSessionPoint[], target: Target): string {
  const series = pts.map((p) => criterionMetPct(p, target.level));
  const cur = series[series.length - 1]!;
  const label = targetLabel(target);
  if (cur >= target.percent) return `At goal — ${label}`;
  if (pts.length < 2) return `Goal: ${label}`;
  const slope = (cur - series[0]!) / (pts.length - 1);
  if (slope <= 0) return `Goal: ${label} — not trending up yet`;
  const n = Math.ceil((target.percent - cur) / slope);
  return `≈ ${n} session${n === 1 ? "" : "s"} from ${label}`;
}

export interface TermInfo {
  label: string;
  firstDay: string;
}
const TERM_MARK = "#8a7fd0"; // new-term divider (violet)
const IEP_MARK = "var(--color-text-danger)"; // IEP review

// Vertical marker positions (between sessions) for events inside the plotted
// range. Skipped when <2 sessions or the event falls outside the range.
function eventMarkers(points: GoalSessionPoint[], dates: string[], color: string): SparkMarker[] {
  const n = points.length;
  if (n < 2) return [];
  const out: SparkMarker[] = [];
  for (const d of dates) {
    if (!d) continue;
    const k = points.filter((p) => p.date < d).length;
    if (k <= 0 || k >= n) continue;
    out.push({ atIndex: k - 0.5, color });
  }
  return out;
}

interface TermBreakdownRow {
  label: string;
  n: number;
  first: number;
  last: number;
}
function perTermBreakdown(points: GoalSessionPoint[], terms: TermInfo[]): TermBreakdownRow[] {
  if (!terms.length) return [];
  const sorted = [...terms].sort((a, b) => (a.firstDay < b.firstDay ? -1 : 1));
  const labelFor = (date: string) => {
    let lab = "Earlier";
    for (const t of sorted) if (t.firstDay && t.firstDay <= date) lab = t.label;
    return lab;
  };
  const groups: { label: string; pts: GoalSessionPoint[] }[] = [];
  for (const p of points) {
    const lab = labelFor(p.date);
    const g = groups[groups.length - 1];
    if (g && g.label === lab) g.pts.push(p);
    else groups.push({ label: lab, pts: [p] });
  }
  return groups.map((g) => ({
    label: g.label,
    n: g.pts.length,
    first: g.pts[0]!.independencePct,
    last: g.pts[g.pts.length - 1]!.independencePct,
  }));
}

// Sum per-prompt-type success counts across a set of session points.
export function sumByType(points: GoalSessionPoint[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of points) for (const [t, n] of Object.entries(p.byType)) out[t] = (out[t] ?? 0) + n;
  return out;
}

// Horizontal bars of how often each prompt type was needed (all five types
// shown for a consistent profile). Returns null when no prompts were used.
export function SupportTypeBars({ byType }: { byType: Record<string, number> }) {
  const total = Object.values(byType).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const max = Math.max(1, ...TRIAL_SUPPORT_TYPES.map((t) => byType[t] ?? 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {TRIAL_SUPPORT_TYPES.map((t) => {
        const c = byType[t] ?? 0;
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 84, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, opacity: c ? 1 : 0.5 }}>
              {PROMPT_TYPE_ICON[t] && <Icon name={PROMPT_TYPE_ICON[t]} size={13} />}
              {t}
            </span>
            <div
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                background: "var(--color-background-tertiary)",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${(c / max) * 100}%`, height: "100%", background: "var(--color-text-info)", opacity: 0.7 }} />
            </div>
            <span style={{ width: 24, flexShrink: 0, textAlign: "right", color: "var(--color-text-secondary)" }}>
              {c}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function KeyItem({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span style={{ width: 0, height: 12, borderLeft: `2px dashed ${color}` }} />
      {label}
    </span>
  );
}

export function GoalScorecard({
  progress,
  target,
  terms = [],
  iepDates = [],
}: {
  progress: GoalProgress;
  target: Target;
  terms?: TermInfo[];
  iepDates?: string[];
}) {
  const pts = progress.points;
  const last = pts[pts.length - 1]!;
  const prev = pts[pts.length - 2]; // previous session, for the delta
  const single = pts.length === 1;
  const showCriterion = target.percent > 0 && target.level !== "no support";
  const markers = [
    ...eventMarkers(pts, terms.map((t) => t.firstDay), TERM_MARK),
    ...eventMarkers(pts, iepDates, IEP_MARK),
  ];
  const hasTermMark = markers.some((m) => m.color === TERM_MARK);
  const hasIepMark = markers.some((m) => m.color === IEP_MARK);
  const breakdown = perTermBreakdown(pts, terms);
  const byType = sumByType(pts);
  const hasTypes = Object.values(byType).reduce((s, n) => s + n, 0) > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 16px", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          {pts.length} session{pts.length === 1 ? "" : "s"} · Last used {shortDate(last.date)}
        </span>
        {(hasTermMark || hasIepMark) && (
          <span style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--color-text-secondary)" }}>
            {hasTermMark && <KeyItem color={TERM_MARK} label="New term" />}
            {hasIepMark && <KeyItem color={IEP_MARK} label="IEP review" />}
          </span>
        )}
      </div>
      {/* Metrics (left) and support-types profile (right), wrapping on narrow widths.
          Metric column hugs its content so the bars sit right beside it, not across a gap. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 36px", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "0 0 auto" }}>
          <Metric
            name="Accuracy"
            color={ACCURACY_COLOR}
            hint={ACCURACY_DEF}
            values={pts.map((p) => p.accuracyPct)}
            latest={last.accuracyPct}
            delta={last.accuracyPct - (prev?.accuracyPct ?? last.accuracyPct)}
            single={single}
            markers={markers}
          />
          <Metric
            name="Independence"
            color={INDEPENDENCE_COLOR}
            hint={INDEPENDENCE_DEF}
            values={pts.map((p) => p.independencePct)}
            latest={last.independencePct}
            delta={last.independencePct - (prev?.independencePct ?? last.independencePct)}
            single={single}
            markers={markers}
          />
          {showCriterion && (
            <Metric
              name={`At ${target.level}+`}
              color="var(--color-text-warning)"
              values={pts.map((p) => criterionMetPct(p, target.level))}
              latest={criterionMetPct(last, target.level)}
              delta={criterionMetPct(last, target.level) - (prev ? criterionMetPct(prev, target.level) : criterionMetPct(last, target.level))}
              single={single}
              markers={markers}
            />
          )}
        </div>
        {hasTypes && (
          <div style={{ flex: "1 1 220px", minWidth: 200, maxWidth: 320 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
              Support types needed
            </div>
            <SupportTypeBars byType={byType} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px", fontSize: 13 }}>
        <span style={{ color: "var(--color-text-secondary)" }}>
          Current support: <strong style={{ color: "var(--color-text-primary)" }}>{currentSupport(last)}</strong>
        </span>
        {target.percent > 0 ? (
          <span style={{ color: "var(--color-text-secondary)" }}>{masteryHint(pts, target)}</span>
        ) : (
          <span style={{ color: "var(--color-text-tertiary)" }}>
            Set a mastery target above to track progress to criterion.
          </span>
        )}
      </div>
      {breakdown.length > 1 && (
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
          <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--color-text-primary)" }}>By term</div>
          {breakdown.map((r, i) => (
            <div key={i}>
              {r.label}: {r.n} session{r.n === 1 ? "" : "s"} · {r.first}→{r.last}% independent
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Metric({
  name,
  color,
  values,
  latest,
  delta,
  single,
  markers = [],
  hint,
}: {
  name: string;
  color: string;
  values: number[];
  latest: number;
  delta: number;
  single: boolean;
  markers?: SparkMarker[];
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 120 }}>
        <div
          style={{ fontSize: 12, color: "var(--color-text-secondary)", cursor: hint ? "help" : undefined }}
          title={hint}
        >
          {name}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 500 }}>{latest}%</span>
          {!single && delta !== 0 && (
            <span
              title="Change since the previous session (percentage points)"
              style={{
                fontSize: 12,
                cursor: "help",
                color: delta > 0 ? "var(--color-text-success)" : "var(--color-text-danger)",
              }}
            >
              {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} pts
            </span>
          )}
        </div>
      </div>
      <Sparkline values={values} color={color} markers={markers} />
    </div>
  );
}

// Small status pill from a metric series + whether it's met its target.
export function StatusChip({ values, atGoal }: { values: number[]; atGoal: boolean }) {
  let label: string;
  let bg: string;
  let fg: string;
  if (atGoal) {
    label = "At goal";
    bg = "var(--color-background-success)";
    fg = "var(--color-text-success)";
  } else if (values.length < 2) {
    label = "New";
    bg = "var(--color-background-secondary)";
    fg = "var(--color-text-secondary)";
  } else {
    const d = values[values.length - 1]! - values[0]!;
    if (d > 0) {
      label = "Improving";
      bg = "var(--color-background-info)";
      fg = "var(--color-text-info)";
    } else if (d < 0) {
      label = "Needs attention";
      bg = "var(--color-background-danger)";
      fg = "var(--color-text-danger)";
    } else {
      label = "Flat";
      bg = "var(--color-background-secondary)";
      fg = "var(--color-text-secondary)";
    }
  }
  return (
    <span
      style={{
        textAlign: "center",
        flexShrink: 0,
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: "var(--border-radius-md)",
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

export interface SparkMarker {
  atIndex: number; // fractional session index (e.g. k - 0.5 = between sessions)
  color: string;
}

export function Sparkline({
  values,
  color,
  w = 200,
  h = 36,
  markers = [],
}: {
  values: number[];
  color: string;
  w?: number;
  h?: number;
  markers?: SparkMarker[];
}) {
  const pad = 4;
  const n = values.length;
  const x = (i: number) => (n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad));
  const y = (v: number) => h - pad - (v / 100) * (h - 2 * pad);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", flex: "0 0 auto" }} aria-hidden>
      <line x1={pad} y1={y(0)} x2={w - pad} y2={y(0)} stroke="var(--color-border-tertiary)" strokeWidth={0.5} />
      {markers.map((m, i) => (
        <line
          key={`m${i}`}
          x1={x(m.atIndex)}
          x2={x(m.atIndex)}
          y1={pad - 2}
          y2={h - pad + 2}
          stroke={m.color}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      ))}
      {n > 1 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2} fill={color} />
      ))}
    </svg>
  );
}
