import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadSessions } from "../domain/data";
import { toISODate, startOfDay } from "../domain/dates";
import { fullName } from "../domain/student";
import type { SessionMetadata } from "../domain/session";
import {
  buildStudentReport,
  generateReport,
  loadReportPrompts,
  reportText,
  goalRating,
  goalBaselineLine,
  goalSupportLine,
  cannedNarratives,
  type ReportRating,
  type ReportNarratives,
  type ReportGoalSummary,
  type StudentReport,
} from "../domain/report";
import { getReport, saveReport, reportCacheKey } from "../clients/reportCache";
import { resolvePipeline } from "../clients/models";
import { getPipelineId } from "../clients/modelPref";
import { formatLlmError } from "../clients/llm";

const ALL_START = "0001-01-01";
const ALL_END = "9999-12-31";
type Preset = "term" | "all" | "custom";

// YYYY-MM-DD -> "M/D/YY" without a Date (timezone-safe).
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${Number(y?.slice(2))}`;
};

// Per-student progress report: a printable document (charts + LLM narrative,
// grouped by long-term goal) over a chosen date range. Reached from a student's
// detail page. Narrative is cached locally; nothing is written to the data repo.
export function ProgressReport({
  studentId,
  onBack,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, studentById, teacherById, client } = useTerm();
  const { keys, demoMode } = useAuth();
  const pipeline = resolvePipeline(getPipelineId());
  const providerKey = pipeline.provider === "openai" ? keys?.openaiApiKey : keys?.anthropicApiKey;
  const hasModelKey = providerKey != null && providerKey.length > 0;
  const useCanned = demoMode && !hasModelKey;

  const data = state.status === "ready" ? state.data : null;
  const student = studentById.get(studentId);
  const term = data?.term ?? null;

  const [sessions, setSessions] = useState<SessionMetadata[]>([]);
  const [preset, setPreset] = useState<Preset>("term");
  const [rangeStart, setRangeStart] = useState(term?.firstDay ?? "");
  const [rangeEnd, setRangeEnd] = useState(
    term?.finishedOn ?? term?.lastDay ?? toISODate(startOfDay(new Date())),
  );
  const [narratives, setNarratives] = useState<ReportNarratives | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadSessions(client)
      .then((s) => {
        if (!cancelled) setSessions(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Effective range for the chosen preset.
  const [effStart, effEnd] =
    preset === "all" ? [ALL_START, ALL_END] : [rangeStart, rangeEnd];

  const report: StudentReport | null = useMemo(
    () =>
      student ? buildStudentReport(student, data?.goals ?? [], sessions, effStart, effEnd) : null,
    [student, data?.goals, sessions, effStart, effEnd],
  );

  const cacheKey = reportCacheKey(studentId, effStart, effEnd);

  // Restore a cached narrative for the current range (or clear when the range
  // changes to one without a cached report). Custom is treated as a fresh,
  // explicit selection: we never auto-restore for it (its default dates equal
  // the term's, which would otherwise surface the term's report unbidden), so
  // the actions only appear after the user generates for the custom range.
  useEffect(() => {
    let cancelled = false;
    setNarratives(null);
    setPhase("idle");
    setError(null);
    if (preset === "custom") return;
    getReport(cacheKey)
      .then((c) => {
        if (cancelled || !c) return;
        setNarratives({ summary: c.summary, goals: c.goals });
        setPhase("done");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cacheKey, preset]);

  const periodLabel =
    preset === "all" ? "All recorded history" : preset === "term" && term ? term.label : "Custom range";

  const hasData = !!report && report.groups.some((g) => g.goals.some((s) => s.sessionCount > 0));
  const canGenerate = hasData && (hasModelKey || useCanned) && (useCanned || !!client);

  async function generate() {
    if (!report || !student) return;
    setPhase("running");
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      let result: ReportNarratives;
      if (useCanned) {
        await new Promise((r) => setTimeout(r, 500));
        result = cannedNarratives(report, student);
      } else {
        const prompts = await loadReportPrompts(client!);
        result = await generateReport(providerKey!, prompts, report, student, {
          model: { provider: pipeline.provider, model: pipeline.draft.model },
          onProgress: (done, total) => setProgress({ done, total }),
        });
      }
      setNarratives(result);
      setPhase("done");
      await saveReport({
        id: cacheKey,
        studentId,
        rangeStart: effStart,
        rangeEnd: effEnd,
        summary: result.summary,
        goals: result.goals,
        generatedAt: Date.now(),
      }).catch(() => {});
    } catch (e) {
      setError(formatLlmError(e));
      setPhase("idle");
    }
  }

  async function copy() {
    if (!report || !student || !narratives) return;
    try {
      await navigator.clipboard.writeText(reportText(student, report, narratives, periodLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  }

  if (!data || !student || !report) return null;
  const teacher = teacherById.get(student.teacherId);
  const generatedGoals = report.groups.reduce(
    (n, g) => n + g.goals.filter((s) => s.sessionCount > 0).length,
    0,
  );

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div className="no-print" style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← Goals &amp; progress
        </button>
      </div>

      {/* Controls — hidden when printing. */}
      <div className="no-print card" style={{ marginBottom: "1.25rem" }}>
        {/* Header row: period picker (left, wraps internally) + actions pinned
            top-right (never wraps below). */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Reporting period</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["term", "all", "custom"] as Preset[]).map((p) => (
                <button
                  key={p}
                  className={`button button--small${preset === p ? " button--primary" : ""}`}
                  onClick={() => setPreset(p)}
                >
                  {p === "term" ? "This term" : p === "all" ? "All history" : "Custom"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {phase === "done" && (
              <>
                <button className="button button--small" onClick={() => void copy()}>
                  <Icon name="copy" size={14} />
                  {copied ? "Copied" : "Copy"}
                </button>
                <button className="button button--small" onClick={() => window.print()}>
                  <Icon name="printer" size={14} />
                  Print / Save PDF
                </button>
              </>
            )}
            <button
              className="button button--small button--primary"
              onClick={() => void generate()}
              disabled={!canGenerate || phase === "running"}
              title={
                !hasData
                  ? "No session data recorded in this range yet"
                  : !hasModelKey && !useCanned
                    ? `Add your ${pipeline.provider === "openai" ? "OpenAI" : "Anthropic"} key in Settings`
                    : undefined
              }
            >
              <Icon name="sparkles" size={14} />
              {phase === "running"
                ? progress.total
                  ? `Writing… ${progress.done}/${progress.total}`
                  : "Writing…"
                : narratives
                  ? "Regenerate"
                  : "Generate report"}
            </button>
          </div>
        </div>
        {/* Custom date range — on its own row, below the picker. */}
        {preset === "custom" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
            <input
              className="input"
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              style={{ height: 32, width: 150 }}
            />
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>to</span>
            <input
              className="input"
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              style={{ height: 32, width: 150 }}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="no-print" role="alert" style={{ fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}
      {useCanned && (
        <p className="no-print" style={{ fontSize: 12, margin: "0px 0px 10px 10px", color: "var(--color-text-secondary)" }}>
          Demo mode: narratives use template logic only, no LLM calls.
        </p>
      )}
      {!hasData && (
        <p className="no-print" style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          No trials or prompting have been logged for {student.firstName} in this period. Log session
          data (or widen the range) to generate a report.
        </p>
      )}

      {/* The printable document. */}
      <div
        className="report-doc"
        style={{
          border: "1px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "28px 32px",
        }}
      >
        <div
          style={{
            marginBottom: "1.5rem",
            paddingBottom: 14,
            borderBottom: "2px solid var(--color-border-tertiary)",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
            {fullName(student)} — Progress Report
          </h1>
          <p style={{ margin: "6px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {periodLabel}
            {/* Show the actual span for term/custom (so "Custom range" isn't ambiguous);
                skip for "All history", whose sentinel bounds aren't real dates. */}
            {preset !== "all" ? ` · ${fmtDate(effStart)} – ${fmtDate(effEnd)}` : ""} ·{" "}
            {report.sessionCount} session{report.sessionCount === 1 ? "" : "s"}
            {teacher ? ` · ${teacher.name}` : ""}
          </p>
        </div>

        {generatedGoals === 0 ? (
          // Nothing logged this period — say it once, not once per goal.
          <p
            style={{
              fontSize: 14,
              color: "var(--color-text-secondary)",
              textAlign: "center",
              padding: "20px 0",
              margin: 0,
            }}
          >
            No trials or prompting were logged for {student.firstName} during this reporting period —
            there's nothing to report yet.
          </p>
        ) : (
          <>
            {narratives?.summary?.trim() && (
              <p
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  margin: "0 0 1.75rem 0",
                  padding: "12px 16px",
                  borderLeft: "3px solid var(--color-text-tertiary)",
                  background: "var(--color-background-secondary)",
                  borderRadius: "0 var(--border-radius-md) var(--border-radius-md) 0",
                }}
              >
                {narratives.summary.trim()}
              </p>
            )}

            {report.groups.map((group) => (
              <div key={group.longTermGoal} className="report-group" style={{ marginBottom: "1.75rem" }}>
                <h2
                  style={{
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-tertiary)",
                    margin: "0 0 10px 0",
                  }}
                >
                  {group.longTermGoal || "Goals"}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {group.goals.map((s) => (
                    <GoalSection
                      key={s.goal.id}
                      summary={s}
                      narrative={narratives?.goals[s.goal.id]}
                      generated={phase === "done"}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function GoalSection({
  summary,
  narrative,
  generated,
}: {
  summary: ReportGoalSummary;
  narrative: string | undefined;
  generated: boolean;
}) {
  const { goal } = summary;
  const label = goal.shortTermGoal?.trim() || goal.shortName || "Goal";
  const rating = goalRating(summary);
  const baseline = goalBaselineLine(summary);
  const support = goalSupportLine(summary);
  const noData = summary.sessionCount === 0;
  // No-data goals say it via the rating chip — no extra narrative line.
  const text = noData
    ? ""
    : narrative?.trim() || (generated ? "" : "Generate the report to add a narrative.");
  return (
    <div
      className="report-goal"
      style={{
        border: "1px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        padding: "14px 16px",
        breakInside: "avoid",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        <RatingChip rating={rating} />
      </div>
      {baseline && (
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 5 }}>{baseline}</div>
      )}
      {support && (
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary)", marginTop: 2 }}>{support}</div>
      )}
      {text && (
        <p
          style={{
            marginTop: 12,
            marginBottom: 0,
            padding: "10px 12px",
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {text}
        </p>
      )}
    </div>
  );
}

// The per-goal progress verdict pill.
function RatingChip({ rating }: { rating: ReportRating }) {
  const tone: Record<ReportRating["tone"], { bg: string; fg: string }> = {
    met: { bg: "var(--color-background-success)", fg: "var(--color-text-success)" },
    "on-track": { bg: "var(--color-background-info)", fg: "var(--color-text-info)" },
    slow: { bg: "var(--color-background-warning)", fg: "var(--color-text-warning)" },
    none: { bg: "var(--color-background-secondary)", fg: "var(--color-text-secondary)" },
  };
  const c = tone[rating.tone];
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 12,
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: "var(--border-radius-md)",
        background: c.bg,
        color: c.fg,
        whiteSpace: "nowrap",
      }}
    >
      {rating.label}
    </span>
  );
}
