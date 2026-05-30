import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import {
  addDays,
  formatShort,
  formatWeekRange,
  mondayOf,
  parseDate,
  startOfDay,
  toISODate,
  toWeekday,
} from "../domain/dates";
import {
  deleteWeekSchedule,
  loadWeekSchedule,
  writeWeekSchedule,
} from "../domain/data";
import {
  WEEKDAYS,
  parseTimeInput,
  slotEndMinutes,
  slotStartMinutes,
  type ScheduleEntry,
  type Weekday,
} from "../domain/schedule";
import { fullName, type Student } from "../domain/student";
import { teacherColor, type Teacher } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
}

const BASE_PX_PER_MIN = 2;
const MAX_PX_PER_MIN = 10;
const HEADER_PX = 30;
// Added to the tallest measured block so the uniform cell has a little breathing
// room (button padding + border + a few px).
const CELL_PAD_PX = 12;
const DEFAULT_CELL_PX = 46;

export function Schedule({ onNavigate }: Props) {
  const { state, client, teacherById, studentById, saveSchedule } = useTerm();
  const [draft, setDraft] = useState<ScheduleEntry[]>(() =>
    state.status === "ready" ? state.data.schedule.map(cloneEntry) : [],
  );
  const [baseline, setBaseline] = useState<ScheduleEntry[]>(() =>
    state.status === "ready" ? state.data.schedule.map(cloneEntry) : [],
  );
  // Per-day blocks added in the editor that have no students yet — kept only in
  // UI state (schedule.csv stores entries, so an empty block has nothing to
  // persist; it reappears as soon as a student is added to it).
  const [extraSlots, setExtraSlots] = useState<Partial<Record<Weekday, string[]>>>({});
  const [editing, setEditing] = useState<{ day: Weekday; slot: string } | null>(null);
  const [addingFor, setAddingFor] = useState<Weekday | null>(null);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which schedule is being edited: null = the usual template; otherwise the ISO
  // Monday of a specific week (its deviation file). weekSha tracks that file's
  // blob for safe overwrite/delete; isDeviated is whether the file exists yet.
  const [weekKey, setWeekKey] = useState<string | null>(null);
  const [weekSha, setWeekSha] = useState<string | undefined>(undefined);
  const [isDeviated, setIsDeviated] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);

  // Natural rendered height of each block's content, keyed by `${day}|${slot}`.
  const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  // The uniform cell height — tall enough for the busiest block — and a tick that
  // forces re-measurement on viewport resize (pill wrapping is width-dependent).
  const [cellHeight, setCellHeight] = useState(DEFAULT_CELL_PX);
  const [resizeTick, setResizeTick] = useState(0);

  // (day|slot) -> studentIds.
  const cells = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of draft) {
      const key = `${entry.dayOfWeek}|${entry.timeSlot}`;
      const list = map.get(key) ?? [];
      list.push(entry.studentId);
      map.set(key, list);
    }
    return map;
  }, [draft]);

  // Each day has its own chronological list of time blocks; they drift apart
  // through the day rather than lining up across columns.
  const slotsByDay = useMemo(() => {
    const map = new Map<Weekday, string[]>();
    for (const day of WEEKDAYS) {
      const fromEntries = draft.filter((e) => e.dayOfWeek === day).map((e) => e.timeSlot);
      const extra = extraSlots[day] ?? [];
      const unique = [...new Set([...fromEntries, ...extra])];
      map.set(day, unique.sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b)));
    }
    return map;
  }, [draft, extraSlots]);

  // Smallest gap between consecutive block starts within any single day. The
  // uniform cell must fit inside this gap, or blocks would overlap.
  const minGap = useMemo(() => {
    let min = Infinity;
    for (const day of WEEKDAYS) {
      const slots = slotsByDay.get(day) ?? [];
      for (let i = 0; i < slots.length - 1; i++) {
        const gap = slotStartMinutes(slots[i + 1]!) - slotStartMinutes(slots[i]!);
        if (gap > 0 && gap < min) min = gap;
      }
    }
    return min;
  }, [slotsByDay]);

  // Measure the tallest block, so every cell can reserve that height.
  useLayoutEffect(() => {
    let tallest = 0;
    for (const day of WEEKDAYS) {
      for (const slot of slotsByDay.get(day) ?? []) {
        const el = contentRefs.current.get(`${day}|${slot}`);
        if (el) tallest = Math.max(tallest, el.offsetHeight);
      }
    }
    const next = tallest > 0 ? tallest + CELL_PAD_PX : DEFAULT_CELL_PX;
    setCellHeight((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
  }, [slotsByDay, cells, resizeTick]);

  useEffect(() => {
    const onResize = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
      setExtraSlots({});
      setWeekSha(undefined);
      setIsDeviated(false);
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
        setExtraSlots({});
        setWeekSha(res?.sha);
        setIsDeviated(!!res);
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

  // Stretch the time axis so the uniform cell fits in the tightest gap. Longer
  // blocks then render proportionally taller than that floor.
  const scale = useMemo(() => {
    if (!Number.isFinite(minGap)) return BASE_PX_PER_MIN;
    return Math.min(MAX_PX_PER_MIN, Math.max(BASE_PX_PER_MIN, cellHeight / minGap));
  }, [cellHeight, minGap]);

  const axis = useMemo(() => {
    const allSlots = WEEKDAYS.flatMap((d) => slotsByDay.get(d) ?? []);
    let startMin = 8 * 60;
    let endMin = 13 * 60;
    if (allSlots.length > 0) {
      startMin = Math.min(...allSlots.map(slotStartMinutes));
      endMin = Math.max(...allSlots.map(slotEndMinutes));
    }
    // Canvas spans the earliest start / latest end, snapped out to the half hour.
    const gridStart = Math.floor(startMin / 30) * 30;
    const gridEnd = Math.ceil(endMin / 30) * 30;
    // Label whole hours that fall within the canvas.
    const hours: number[] = [];
    for (let h = Math.ceil(gridStart / 60); h <= Math.floor(gridEnd / 60); h++) hours.push(h);
    return { gridStart, gridEnd, hours };
  }, [slotsByDay]);

  if (state.status !== "ready") return null;
  const { term, teachers, students, schedule: templateSchedule } = state.data;

  const dirty = normalize(draft) !== normalize(baseline);
  const totalBlocks = WEEKDAYS.reduce((n, d) => n + (slotsByDay.get(d)?.length ?? 0), 0);
  // Pad the bottom so a stretched last block can't collide with the Add control.
  const bodyHeight = (axis.gridEnd - axis.gridStart) * scale + cellHeight;

  // Week navigation, bounded to the term.
  const todayMonday = mondayOf(toWeekday(startOfDay(new Date())));
  const firstDay = parseDate(term.firstDay);
  const lastDay = parseDate(term.lastDay);
  const minMonday = firstDay ? mondayOf(firstDay) : null;
  const maxMonday = lastDay ? mondayOf(lastDay) : null;
  const weekDate = weekKey ? parseDate(weekKey) : null;
  const prevDisabled =
    !weekDate || (minMonday !== null && addDays(weekDate, -7).getTime() < minMonday.getTime());
  const nextDisabled =
    !weekDate || (maxMonday !== null && addDays(weekDate, 7).getTime() > maxMonday.getTime());

  const addStart = parseTimeInput(newStart);
  const addEnd = parseTimeInput(newEnd);
  const addOverlaps =
    !!addStart &&
    !!addEnd &&
    addEnd.minutes > addStart.minutes &&
    addingFor !== null &&
    overlapsExisting(addingFor, addStart.minutes, addEnd.minutes);
  const addValid =
    !!addStart && !!addEnd && addEnd.minutes > addStart.minutes && !addOverlaps;
  const addAttempted = newStart.trim() !== "" && newEnd.trim() !== "";

  function toggleStudent(day: Weekday, slot: string, student: Student, on: boolean) {
    setDraft((d) => {
      const present = d.some(
        (e) => e.dayOfWeek === day && e.timeSlot === slot && e.studentId === student.id,
      );
      if (on) {
        if (present) return d;
        return [
          ...d,
          { teacherId: student.teacherId, dayOfWeek: day, timeSlot: slot, studentId: student.id },
        ];
      }
      return d.filter(
        (e) => !(e.dayOfWeek === day && e.timeSlot === slot && e.studentId === student.id),
      );
    });
  }

  function startAdd(day: Weekday) {
    setAddingFor(day);
    setNewStart("");
    setNewEnd("");
  }

  // Two blocks overlap when their ranges share more than a boundary point;
  // blocks that merely touch (one ends exactly when the next starts) are fine.
  function overlapsExisting(day: Weekday, startMin: number, endMin: number): boolean {
    return (slotsByDay.get(day) ?? []).some(
      (s) => startMin < slotEndMinutes(s) && slotStartMinutes(s) < endMin,
    );
  }

  function commitNewBlock(day: Weekday) {
    const start = parseTimeInput(newStart);
    const end = parseTimeInput(newEnd);
    if (!start || !end || end.minutes <= start.minutes) return;
    if (overlapsExisting(day, start.minutes, end.minutes)) return;
    const slot = `${start.label}-${end.label}`;
    const existing = slotsByDay.get(day) ?? [];
    if (!existing.includes(slot)) {
      setExtraSlots((s) => ({ ...s, [day]: [...(s[day] ?? []), slot] }));
    }
    setAddingFor(null);
    setNewStart("");
    setNewEnd("");
    setEditing({ day, slot });
  }

  function removeSlot(day: Weekday, slot: string) {
    setDraft((d) => d.filter((e) => !(e.dayOfWeek === day && e.timeSlot === slot)));
    setExtraSlots((s) => ({ ...s, [day]: (s[day] ?? []).filter((x) => x !== slot) }));
    setEditing(null);
  }

  function stepWeek(dir: 1 | -1) {
    if (!weekDate) return;
    setWeekKey(toISODate(addDays(weekDate, dir * 7)));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (weekKey === null) {
        await saveSchedule(draft);
      } else {
        if (!client) throw new Error("Not connected to the data repo");
        const newSha = await writeWeekSchedule(client, weekKey, draft, weekSha);
        setWeekSha(newSha);
        setIsDeviated(true);
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
      setExtraSlots({});
      setWeekSha(undefined);
      setIsDeviated(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDraft(baseline.map(cloneEntry));
    setExtraSlots({});
    setAddingFor(null);
    setNewStart("");
    setNewEnd("");
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
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              className="button button--small"
              onClick={() => stepWeek(-1)}
              disabled={prevDisabled}
              aria-label="Previous week"
            >
              <Icon name="chevron-left" size={14} />
            </button>
            <span style={{ fontSize: 13, minWidth: 92, textAlign: "center" }}>
              {formatWeekRange(weekDate)}
            </span>
            <button
              className="button button--small"
              onClick={() => stepWeek(1)}
              disabled={nextDisabled}
              aria-label="Next week"
            >
              <Icon name="chevron-right" size={14} />
            </button>
            <span
              style={{
                fontSize: 12,
                color: isDeviated ? "var(--color-text-warning)" : "var(--color-text-tertiary)",
              }}
            >
              {loadingWeek ? "Loading…" : isDeviated ? "Customized this week" : "Same as usual"}
            </span>
            {isDeviated && (
              <button
                className="button button--small button--danger-text"
                onClick={handleResetToUsual}
                disabled={saving}
              >
                Reset to usual
              </button>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: "1rem",
          alignItems: "center",
          fontSize: 12,
          color: "var(--color-text-secondary)",
        }}
      >
        <span>Legend:</span>
        {teachers.map((teacher) => (
          <span key={teacher.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: teacherColor(teacher.color).bg,
              }}
            />
            {teacher.name}
          </span>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* Hour gutter */}
        <div style={{ width: 46, flexShrink: 0 }}>
          <div style={{ height: HEADER_PX }} />
          <div style={{ position: "relative", height: bodyHeight }}>
            {axis.hours.map((h) => (
              <div
                key={h}
                style={{
                  position: "absolute",
                  top: (h * 60 - axis.gridStart) * scale,
                  right: 8,
                  transform: "translateY(-50%)",
                  fontSize: 11,
                  color: "var(--color-text-tertiary)",
                }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>
        </div>

        {/* Day columns */}
        {WEEKDAYS.map((day, dayIndex) => {
          const slots = slotsByDay.get(day) ?? [];
          const columnDate = weekDate ? addDays(weekDate, dayIndex) : null;
          const outOfTerm =
            columnDate !== null &&
            ((firstDay !== null && columnDate.getTime() < firstDay.getTime()) ||
              (lastDay !== null && columnDate.getTime() > lastDay.getTime()));
          return (
            <div key={day} style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  height: HEADER_PX,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1.1,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: outOfTerm
                      ? "var(--color-text-tertiary)"
                      : "var(--color-text-secondary)",
                  }}
                >
                  {day}
                </span>
                {columnDate && (
                  <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>
                    {formatShort(columnDate)}
                  </span>
                )}
              </div>

              <div
                style={{
                  position: "relative",
                  height: bodyHeight,
                  borderLeft: "0.5px solid var(--color-border-tertiary)",
                  opacity: outOfTerm ? 0.4 : 1,
                }}
              >
                {outOfTerm && (
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 0,
                      right: 0,
                      textAlign: "center",
                      fontSize: 11,
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    Outside term
                  </div>
                )}
                {/* Hour gridlines */}
                {axis.hours.map((h) => (
                  <div
                    key={h}
                    style={{
                      position: "absolute",
                      top: (h * 60 - axis.gridStart) * scale,
                      left: 0,
                      right: 0,
                      borderTop: "0.5px solid var(--color-border-tertiary)",
                      opacity: 0.5,
                    }}
                  />
                ))}

                {!outOfTerm && slots.map((slot) => {
                  const top = (slotStartMinutes(slot) - axis.gridStart) * scale;
                  const durationPx = (slotEndMinutes(slot) - slotStartMinutes(slot)) * scale;
                  const minHeight = Math.max(cellHeight, durationPx);
                  const studentIds = cells.get(`${day}|${slot}`) ?? [];
                  const deviates =
                    weekKey !== null &&
                    !sameStudents(templateCells.get(`${day}|${slot}`), studentIds);
                  return (
                    <button
                      key={slot}
                      className="schedule-block"
                      onClick={() => setEditing({ day, slot })}
                      style={{
                        position: "absolute",
                        top,
                        left: 3,
                        right: 3,
                        minHeight,
                        textAlign: "left",
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: "var(--border-radius-md)",
                        background: "var(--color-background-primary)",
                        padding: "4px 6px",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "stretch",
                        justifyContent: "flex-start",
                      }}
                    >
                      <div
                        ref={(node) => {
                          const key = `${day}|${slot}`;
                          if (node) contentRefs.current.set(key, node);
                          else contentRefs.current.delete(key);
                        }}
                        style={{ display: "flex", flexDirection: "column", gap: 3 }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 10,
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          {slot}
                          {deviates && (
                            <span
                              title="Changed from usual"
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: "var(--color-text-warning)",
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </span>
                        {studentIds.length === 0 ? (
                          <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                            Add students
                          </span>
                        ) : (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {studentIds.map((studentId, i) => {
                              const student = studentById.get(studentId);
                              const teacher = student
                                ? teacherById.get(student.teacherId)
                                : undefined;
                              const color = teacherColor(teacher?.color);
                              return (
                                <span
                                  key={`${studentId}-${i}`}
                                  style={{
                                    fontSize: 11,
                                    padding: "1px 6px",
                                    background: color.bg,
                                    color: color.text,
                                    borderRadius: "var(--border-radius-md)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {student ? fullName(student) : "Unknown"}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 8 }}>
                {!outOfTerm &&
                  (addingFor === day ? (
                  <div
                    style={{
                      border: "0.5px solid var(--color-border-tertiary)",
                      borderRadius: "var(--border-radius-md)",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input
                        className="input"
                        autoFocus
                        style={{ minWidth: 0, flex: 1, padding: "4px 5px", fontSize: 12 }}
                        placeholder="8:44"
                        value={newStart}
                        onChange={(e) => setNewStart(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitNewBlock(day);
                          if (e.key === "Escape") setAddingFor(null);
                        }}
                      />
                      <span style={{ color: "var(--color-text-tertiary)" }}>-</span>
                      <input
                        className="input"
                        style={{ minWidth: 0, flex: 1, padding: "4px 5px", fontSize: 12 }}
                        placeholder="9:14"
                        value={newEnd}
                        onChange={(e) => setNewEnd(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitNewBlock(day);
                          if (e.key === "Escape") setAddingFor(null);
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="button button--small button--primary"
                        style={{ flex: 1 }}
                        onClick={() => commitNewBlock(day)}
                        disabled={!addValid}
                      >
                        Add
                      </button>
                      <button className="button button--small" onClick={() => setAddingFor(null)}>
                        ✕
                      </button>
                    </div>
                    {addAttempted && !addValid && (
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-warning)" }}>
                        {!addStart || !addEnd
                          ? "Use times like 9:15 or 12."
                          : addEnd.minutes <= addStart.minutes
                            ? "End must be after start."
                            : "Overlaps an existing block."}
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    className="button button--ghost button--small"
                    onClick={() => startAdd(day)}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <Icon name="plus" size={13} />
                    Add block
                  </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      {dirty && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "12px 16px",
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-md)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
            Unsaved changes
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button button--small" onClick={handleDiscard} disabled={saving}>
              Discard
            </button>
            <button
              className="button button--small button--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {editing && (
        <CellEditor
          day={editing.day}
          slot={editing.slot}
          students={students}
          teacherById={teacherById}
          selectedIds={new Set(cells.get(`${editing.day}|${editing.slot}`) ?? [])}
          onToggle={(student, on) => toggleStudent(editing.day, editing.slot, student, on)}
          onDelete={() => removeSlot(editing.day, editing.slot)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function CellEditor({
  day,
  slot,
  students,
  teacherById,
  selectedIds,
  onToggle,
  onDelete,
  onClose,
}: {
  day: Weekday;
  slot: string;
  students: Student[];
  teacherById: Map<string, Teacher>;
  selectedIds: Set<string>;
  onToggle: (student: Student, on: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = [...students]
    .filter((s) => (q === "" ? true : fullName(s).toLowerCase().includes(q)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: 380,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          margin: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{day}</h3>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
              {slot} · {selectedIds.size} student{selectedIds.size === 1 ? "" : "s"}
            </p>
          </div>
          <button
            className="button button--ghost button--small"
            onClick={onClose}
            style={{ padding: 4, color: "var(--color-text-secondary)", lineHeight: 0 }}
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-text-tertiary)",
              lineHeight: 0,
            }}
          >
            <Icon name="search" size={14} />
          </span>
          <input
            className="input"
            autoFocus
            style={{ paddingLeft: 32 }}
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column" }}>
          {filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "8px 0" }}>
              No students match.
            </p>
          ) : (
            filtered.map((student) => {
              const teacher = teacherById.get(student.teacherId);
              const color = teacherColor(teacher?.color);
              const checked = selectedIds.has(student.id);
              return (
                <label
                  key={student.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 4px",
                    fontSize: 14,
                    cursor: "pointer",
                    borderTop: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onToggle(student, e.target.checked)}
                  />
                  <span
                    style={{ width: 8, height: 8, borderRadius: 2, background: color.bg, flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{fullName(student)}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                    {teacher?.name ?? "—"}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button--small button--danger-text" onClick={onDelete}>
            Delete time slot
          </button>
          <button
            className="button button--small button--primary"
            style={{ flex: 1 }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// "8:00" style label for a whole-hour tick on the 12-hour school clock.
function formatHour(h: number): string {
  const hour12 = h > 12 ? h - 12 : h;
  return `${hour12}:00`;
}

// Whether a week cell's students match the usual template's for that cell.
function sameStudents(template: Set<string> | undefined, week: string[]): boolean {
  const tmpl = template ?? EMPTY_SET;
  if (tmpl.size !== week.length) return false;
  for (const id of week) if (!tmpl.has(id)) return false;
  return true;
}

const EMPTY_SET: Set<string> = new Set();

// Order-independent fingerprint of the schedule for dirty detection.
function normalize(entries: ScheduleEntry[]): string {
  return JSON.stringify(
    entries.map((e) => `${e.dayOfWeek}|${e.timeSlot}|${e.studentId}|${e.teacherId}`).sort(),
  );
}

function cloneEntry(e: ScheduleEntry): ScheduleEntry {
  return { ...e };
}
