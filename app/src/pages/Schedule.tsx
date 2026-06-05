import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { SaveBar } from "../components/SaveBar";
import { ScheduleGrid } from "../components/ScheduleGrid";
import { useTerm } from "../context/TermContext";
import {
  addDays,
  formatWeekRange,
  mondayOf,
  parseDate,
  startOfDay,
  toISODate,
  toWeekday,
} from "../domain/dates";
import {
  deleteWeekSchedule,
  loadSessions,
  loadWeekSchedule,
  writeWeekSchedule,
} from "../domain/data";
import { WEEKDAYS, type ScheduleEntry } from "../domain/schedule";
import { dayEvents } from "../domain/events";

interface Props {
  onNavigate: (page: NavPage) => void;
  onOpenStudent: (studentId: string, view?: "detail" | "goals") => void;
}

// Past-week snapshots when saving a Usual change are bounded to this many
// weeks back from the "Apply from" date. Beyond that, older weeks inherit the
// new Usual — keeps save latency + data-branch noise bounded since retroactive
// note generation that far back is rare.
const USUAL_LOOKBACK_WEEKS = 4;

export function Schedule({ onNavigate, onOpenStudent }: Props) {
  const { state, client, teacherById, studentById, saveSchedule, saveTerm } = useTerm();
  const [draft, setDraft] = useState<ScheduleEntry[]>(() =>
    state.status === "ready" ? state.data.schedule.map(cloneEntry) : [],
  );
  const [baseline, setBaseline] = useState<ScheduleEntry[]>(() =>
    state.status === "ready" ? state.data.schedule.map(cloneEntry) : [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Effective-from date for a Usual-schedule change. Defaults to today; past
  // weeks (before this Monday) get snapshotted with the OLD Usual so the new
  // template doesn't apply retroactively. Only consulted when saving Usual.
  const [usualEffectiveDate, setUsualEffectiveDate] = useState(() =>
    toISODate(startOfDay(new Date())),
  );

  // Which schedule is being edited: null = the usual template; otherwise the ISO
  // Monday of a specific week (its deviation file). weekSha tracks that file's
  // blob for safe overwrite/delete; isDeviated is whether the file exists yet.
  // Defaults to the current week so she lands on "today's view" instead of the
  // template. The Usual schedule is one tab-click away when she needs it.
  const [weekKey, setWeekKey] = useState<string | null>(() =>
    toISODate(mondayOf(toWeekday(startOfDay(new Date())))),
  );
  const [weekSha, setWeekSha] = useState<string | undefined>(undefined);
  const [loadingWeek, setLoadingWeek] = useState(false);
  // Bumped on discard/reset to remount ScheduleGrid (clears its transient UI:
  // open cell, add-slot inputs, empty scratch blocks). Week changes remount it
  // via weekKey in the same key.
  const [uiNonce, setUiNonce] = useState(0);
  // Students marked absent in a generated session, keyed `${date}|${teacherId}`,
  // so week-mode cells can flag the absence (mirrors Today).
  const [absentByKey, setAbsentByKey] = useState<Map<string, Set<string>>>(() => new Map());

  // Student set per cell in the USUAL template — used to flag a week's blocks
  // that differ from usual.
  const templateCells = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (state.status !== "ready") return m;
    for (const e of state.data.schedule) {
      const k = `${e.dayOfWeek}|${e.timeSlot}`;
      let set = m.get(k);
      if (!set) {
        set = new Set();
        m.set(k, set);
      }
      set.add(e.studentId);
    }
    return m;
  }, [state]);

  // Load the selected week's deviation file. For the usual view (or a week that
  // hasn't diverged) the draft is just the template.
  useEffect(() => {
    if (state.status !== "ready") return;
    const template = state.data.schedule;
    if (weekKey === null) {
      setDraft(template.map(cloneEntry));
      setBaseline(template.map(cloneEntry));
      setWeekSha(undefined);
      setLoadingWeek(false);
      return;
    }
    if (!client) return;
    let cancelled = false;
    setLoadingWeek(true);
    loadWeekSchedule(client, weekKey)
      .then((res) => {
        if (cancelled) return;
        const entries = res ? res.entries : template;
        setDraft(entries.map(cloneEntry));
        setBaseline(entries.map(cloneEntry));
        setWeekSha(res?.sha);
        setLoadingWeek(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load week");
        setLoadingWeek(false);
      });
    return () => {
      cancelled = true;
    };
  }, [weekKey, client, state]);

  // Load generated-session absences once (keyed date|teacher) for week-cell flags.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadSessions(client)
      .then((all) => {
        if (cancelled) return;
        const m = new Map<string, Set<string>>();
        for (const s of all) {
          m.set(`${s.date}|${s.teacherId}`, new Set(s.students.filter((e) => e.absent).map((e) => e.studentId)));
        }
        setAbsentByKey(m);
      })
      .catch(() => {
        if (!cancelled) setAbsentByKey(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (state.status !== "ready") return null;
  const { term, teachers, students, schedule: templateSchedule } = state.data;

  const dirty = normalize(draft) !== normalize(baseline);
  // Saved-state deviation from the usual template. Drives the "Customized this
  // week" / "Same as usual" label so it reflects content equality rather than
  // mere file existence (a week-file may exist but contain template-equivalent
  // data after an add-then-remove cycle).
  const templateNorm = normalize(templateSchedule);
  const customizedSaved = weekKey !== null && normalize(baseline) !== templateNorm;
  const totalBlocks = new Set(draft.map((e) => `${e.dayOfWeek}|${e.timeSlot}`)).size;

  // Week navigation, bounded to the term.
  const todayMonday = mondayOf(toWeekday(startOfDay(new Date())));
  const firstDay = parseDate(term.firstDay);
  const lastDay = parseDate(term.lastDay);

  // Toggle a day's "No school" closure (shared term.closures, same as Today).
  // Saved immediately and independently of the schedule draft.
  const toggleClosure = (date: Date) => {
    const iso = toISODate(date);
    const current = term.closures ?? [];
    const closures = current.includes(iso)
      ? current.filter((d) => d !== iso)
      : [...current, iso];
    void saveTerm({ ...term, closures });
  };

  const minMonday = firstDay ? mondayOf(firstDay) : null;
  const maxMonday = lastDay ? mondayOf(lastDay) : null;
  const weekDate = weekKey ? parseDate(weekKey) : null;
  const prevDisabled =
    !weekDate || (minMonday !== null && addDays(weekDate, -7).getTime() < minMonday.getTime());
  const nextDisabled =
    !weekDate || (maxMonday !== null && addDays(weekDate, 7).getTime() > maxMonday.getTime());

  // Calendar-event markers per day-column (week mode only): IEP review dates,
  // first day, last day. Rendered as clickable chips above the time grid that
  // navigate to the student's detail page.
  const weeklyEvents = WEEKDAYS.map((_, i) =>
    weekDate ? dayEvents(students, toISODate(addDays(weekDate, i))) : [],
  );
  function stepWeek(dir: 1 | -1) {
    if (!weekDate) return;
    setWeekKey(toISODate(addDays(weekDate, dir * 7)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (weekKey === null) {
        // Usual save: snapshot every past week (Mondays strictly before the
        // effective Monday) that doesn't already have a deviation file. Each
        // snapshot uses the OLD Usual (`baseline`), so retroactive note
        // generation reflects what the schedule actually was. Then write the
        // new Usual. Weeks she's already customized are skipped (her
        // deviations win). Serialized to avoid ref-conflicts on the branch.
        if (!client) throw new Error("Not connected to the data repo");
        const effDate = parseDate(usualEffectiveDate);
        if (effDate && firstDay) {
          const firstMon = mondayOf(firstDay);
          const effMon = mondayOf(effDate);
          // Cap the lookback so an end-of-year Usual change doesn't write a
          // commit per week back to September. Older weeks inherit the new
          // Usual; the lookback covers her realistic retroactive-note window.
          const earliestMon = addDays(effMon, -7 * USUAL_LOOKBACK_WEEKS);
          const startMon =
            firstMon.getTime() > earliestMon.getTime() ? firstMon : earliestMon;
          const dir = await client.listDir("data/schedule");
          const existing = new Set(
            dir
              .filter((e) => e.type === "file" && e.name.endsWith(".csv"))
              .map((e) => e.name.replace(/\.csv$/, "")),
          );
          let cur = startMon;
          while (cur.getTime() < effMon.getTime()) {
            const key = toISODate(cur);
            if (!existing.has(key)) {
              await writeWeekSchedule(client, key, baseline, undefined);
            }
            cur = addDays(cur, 7);
          }
        }
        await saveSchedule(draft);
      } else {
        if (!client) throw new Error("Not connected to the data repo");
        // If the week's content has converged back to the usual template,
        // delete the deviation file instead of saving a redundant snapshot. This
        // keeps "Customized this week" honest after add-then-remove cycles and
        // avoids leaving template-equivalent files on the data branch.
        if (normalize(draft) === normalize(templateSchedule)) {
          if (weekSha) await deleteWeekSchedule(client, weekKey, weekSha);
          setWeekSha(undefined);
        } else {
          const newSha = await writeWeekSchedule(client, weekKey, draft, weekSha);
          setWeekSha(newSha);
        }
      }
      setBaseline(draft.map(cloneEntry));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToUsual() {
    if (weekKey === null || !weekSha || !client) return;
    setSaving(true);
    setError(null);
    try {
      await deleteWeekSchedule(client, weekKey, weekSha);
      setDraft(templateSchedule.map(cloneEntry));
      setBaseline(templateSchedule.map(cloneEntry));
      setUiNonce((n) => n + 1);
      setWeekSha(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(baseline.map(cloneEntry));
    setUiNonce((n) => n + 1);
  }

  return (
    <div className="shell">
      <Nav current="schedule" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Schedule</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {term.label} · {totalBlocks} block{totalBlocks === 1 ? "" : "s"}
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)",
            overflow: "hidden",
          }}
        >
          <button
            className="button button--small"
            onClick={() => setWeekKey(null)}
            style={{
              border: "none",
              borderRadius: 0,
              background: weekKey === null ? "var(--color-background-secondary)" : "transparent",
            }}
          >
            Usual schedule
          </button>
          <button
            className="button button--small"
            onClick={() => setWeekKey(toISODate(todayMonday))}
            style={{
              border: "none",
              borderRadius: 0,
              background: weekKey !== null ? "var(--color-background-secondary)" : "transparent",
            }}
          >
            By week
          </button>
        </div>

        {weekKey !== null && weekDate && (
          <>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                color: customizedSaved
                  ? "var(--color-text-warning)"
                  : "var(--color-text-tertiary)",
              }}
            >
              {loadingWeek ? (
                "Loading…"
              ) : customizedSaved ? (
                <>
                  <Icon name="pencil" size={12} /> Customized this week
                </>
              ) : (
                "Same as usual"
              )}
            </span>
            {customizedSaved && (
              <button
                className="button button--small button--danger-text"
                onClick={handleResetToUsual}
                disabled={saving}
              >
                Reset to usual
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <span style={{ fontSize: 13, minWidth: 92, textAlign: "right" }}>
                {formatWeekRange(weekDate)}
              </span>
              <button
                className="button button--small"
                onClick={() => stepWeek(-1)}
                disabled={prevDisabled}
                aria-label="Previous week"
              >
                <Icon name="chevron-left" size={14} />
              </button>
              <button
                className="button button--small"
                onClick={() => setWeekKey(toISODate(todayMonday))}
                disabled={weekKey === toISODate(todayMonday)}
              >
                This week
              </button>
              <button
                className="button button--small"
                onClick={() => stepWeek(1)}
                disabled={nextDisabled}
                aria-label="Next week"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      <ScheduleGrid
        key={`${weekKey ?? "usual"}:${uiNonce}`}
        draft={draft}
        onChange={setDraft}
        teachers={teachers}
        students={students}
        studentById={studentById}
        teacherById={teacherById}
        weekDate={weekDate}
        firstDay={firstDay}
        lastDay={lastDay}
        closures={term.closures}
        onToggleClosure={toggleClosure}
        absentByKey={absentByKey}
        templateCells={templateCells}
        weeklyEvents={weeklyEvents}
        onOpenStudent={onOpenStudent}
        templateStripes={weekKey === null}
      />

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {dirty && (
        <SaveBar
          message="Unsaved changes"
          saving={saving}
          onDiscard={handleDiscard}
          onSave={handleSave}
          extra={
            weekKey === null ? (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 13,
                  color: "var(--color-text-secondary)",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
                title={`The last ${USUAL_LOOKBACK_WEEKS} weeks before this date keep the old schedule (snapshotted). New Usual applies from this date forward; earlier weeks inherit the new Usual.`}
              >
                <span style={{ whiteSpace: "nowrap" }}>Apply from</span>
                <input
                  className="input"
                  type="date"
                  value={usualEffectiveDate}
                  onChange={(e) => setUsualEffectiveDate(e.target.value)}
                  style={{ height: 28, fontSize: 13, padding: "2px 6px", width: 140 }}
                />
              </label>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

// Order-independent fingerprint of the schedule for dirty detection.
// Order-independent across cells, but order-SENSITIVE within a cell: each
// entry carries its position within its (day, slot) so reordering students in a
// cell (the ↑/↓ controls) registers as a real change for dirty detection.
function normalize(entries: ScheduleEntry[]): string {
  const pos = new Map<string, number>();
  const keyed = entries.map((e) => {
    const cell = `${e.dayOfWeek}|${e.timeSlot}`;
    const p = pos.get(cell) ?? 0;
    pos.set(cell, p + 1);
    return `${cell}|${p}|${e.studentId}|${e.teacherId}`;
  });
  return JSON.stringify(keyed.sort());
}

function cloneEntry(e: ScheduleEntry): ScheduleEntry {
  return { ...e };
}
