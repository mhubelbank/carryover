import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { EventChip } from "./EventChip";
import { addDays, formatShort, toISODate } from "../domain/dates";
import type { CalendarEvent } from "../domain/events";
import {
  WEEKDAYS,
  parseTimeInput,
  slotEndMinutes,
  slotStartMinutes,
  type ScheduleEntry,
  type Weekday,
} from "../domain/schedule";
import { fullName, isActiveOn, type Student } from "../domain/student";
import { teacherColor, type Teacher } from "../domain/teacher";

const BASE_PX_PER_MIN = 2;
const MAX_PX_PER_MIN = 10;
const HEADER_PX = 30;
// Added to the tallest measured block so the uniform cell has a little breathing
// room (button padding + border + a few px).
const CELL_PAD_PX = 12;
const DEFAULT_CELL_PX = 46;
// Per-event height in the calendar-event row above each day's time grid.
const EVENT_LINE_PX = 22;

// The weekly time-grid editor: a per-day timeline of slots, each editable via a
// modal (assign/reorder/remove students, delete the slot), plus per-day add-slot
// controls. Controlled — owns only transient UI state (which cell is open, the
// add-slot inputs, empty-slot scratch blocks, measured cell height); the schedule
// itself lives in `draft`, and edits flow out through `onChange`.
//
// Week-mode extras are all optional, so the new-term wizard can use it as a plain
// template editor by omitting them: with no `weekDate` there are no dates, events,
// dimming, absences, or "customized this week" markers.
export interface ScheduleGridProps {
  draft: ScheduleEntry[];
  onChange: (next: ScheduleEntry[]) => void;
  teachers: Teacher[];
  students: Student[];
  studentById: Map<string, Student>;
  teacherById: Map<string, Teacher>;
  // The Monday of the week being edited; null/omitted = dateless template mode.
  weekDate?: Date | null;
  firstDay?: Date | null;
  lastDay?: Date | null;
  closures?: string[];
  onToggleClosure?: (date: Date) => void;
  // Generated-session absences, keyed `${date}|${teacherId}`.
  absentByKey?: Map<string, Set<string>>;
  // Usual-template cell membership, keyed `${day}|${slot}`, for the "customized
  // this week" marker.
  templateCells?: Map<string, Set<string>>;
  // Calendar-event chips per weekday column (index 0 = Monday).
  weeklyEvents?: CalendarEvent[][];
  onOpenStudent?: (studentId: string) => void;
  // Open Today on a specific day (the day-column headers become buttons). Only in
  // week mode (a dateless template column has no date to open).
  onOpenDay?: (iso: string) => void;
  // Faint diagonal stripes marking the dateless "Usual" template.
  templateStripes?: boolean;
}

export function ScheduleGrid({
  draft,
  onChange,
  teachers,
  students,
  studentById,
  teacherById,
  weekDate = null,
  firstDay = null,
  lastDay = null,
  closures = [],
  onToggleClosure,
  absentByKey,
  templateCells,
  weeklyEvents,
  onOpenStudent,
  onOpenDay,
  templateStripes = false,
}: ScheduleGridProps) {
  const weekMode = weekDate != null;
  const [extraSlots, setExtraSlots] = useState<Partial<Record<Weekday, string[]>>>({});
  const [editing, setEditing] = useState<{ day: Weekday; slot: string } | null>(null);
  const [addingFor, setAddingFor] = useState<Weekday | null>(null);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const contentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [cellHeight, setCellHeight] = useState(DEFAULT_CELL_PX);
  const [resizeTick, setResizeTick] = useState(0);

  // (day|slot) -> studentIds.
  const cells = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of draft) {
      if (!entry.studentId) continue; // empty-slot marker: keeps the slot, no pill
      const key = `${entry.dayOfWeek}|${entry.timeSlot}`;
      const list = map.get(key) ?? [];
      list.push(entry.studentId);
      map.set(key, list);
    }
    return map;
  }, [draft]);

  // Each day has its own chronological list of time blocks.
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

  // Smallest gap between consecutive block starts within any single day, so the
  // uniform cell can be sized to fit inside it.
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
    const gridStart = Math.floor(startMin / 30) * 30;
    const gridEnd = Math.ceil(endMin / 30) * 30;
    const hours: number[] = [];
    for (let h = Math.ceil(gridStart / 60); h <= Math.floor(gridEnd / 60); h++) hours.push(h);
    return { gridStart, gridEnd, hours };
  }, [slotsByDay]);

  // Pad the bottom so a stretched last block can't collide with the Add control.
  const bodyHeight = (axis.gridEnd - axis.gridStart) * scale + cellHeight;

  // Calendar-event overlay sizing (week mode only). The row above the body
  // carries only the overflow beyond the natural clearance above the first slot.
  const events = weeklyEvents ?? [];
  const maxEventsPerDay = Math.max(0, ...events.map((e) => e.length));
  const earliestSlotMin = Math.min(
    Infinity,
    ...WEEKDAYS.flatMap((d) => (slotsByDay.get(d) ?? []).map((s) => slotStartMinutes(s))),
  );
  const clearancePx = Number.isFinite(earliestSlotMin)
    ? (earliestSlotMin - axis.gridStart) * scale
    : Infinity;
  const neededOverlayPx = maxEventsPerDay * EVENT_LINE_PX + 4;
  const eventsTopShift = maxEventsPerDay > 0 ? Math.max(0, neededOverlayPx + 4 - clearancePx) : 0;

  const addStart = parseTimeInput(newStart);
  const addEnd = parseTimeInput(newEnd);
  const addOverlaps =
    !!addStart &&
    !!addEnd &&
    addEnd.minutes > addStart.minutes &&
    addingFor !== null &&
    overlapsExisting(addingFor, addStart.minutes, addEnd.minutes);
  const addValid = !!addStart && !!addEnd && addEnd.minutes > addStart.minutes && !addOverlaps;
  const addAttempted = newStart.trim() !== "" && newEnd.trim() !== "";

  function toggleStudent(day: Weekday, slot: string, student: Student, on: boolean) {
    const present = draft.some(
      (e) => e.dayOfWeek === day && e.timeSlot === slot && e.studentId === student.id,
    );
    if (on) {
      if (present) return;
      onChange([
        ...draft,
        { teacherId: student.teacherId, dayOfWeek: day, timeSlot: slot, studentId: student.id },
      ]);
    } else {
      onChange(
        draft.filter(
          (e) => !(e.dayOfWeek === day && e.timeSlot === slot && e.studentId === student.id),
        ),
      );
    }
  }

  function startAdd(day: Weekday) {
    setAddingFor(day);
    setNewStart("");
    setNewEnd("");
  }

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

  // Swap a student with its neighbor inside one cell's entry list. Entry order in
  // schedule.csv is preserved, so this drives pill order and paste order.
  function moveStudentInCell(day: Weekday, slot: string, studentId: string, dir: -1 | 1) {
    const inCell = draft.filter((e) => e.dayOfWeek === day && e.timeSlot === slot);
    const others = draft.filter((e) => !(e.dayOfWeek === day && e.timeSlot === slot));
    const i = inCell.findIndex((e) => e.studentId === studentId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= inCell.length) return;
    [inCell[i], inCell[j]] = [inCell[j]!, inCell[i]!];
    onChange([...others, ...inCell]);
  }

  function sortCellByLastName(day: Weekday, slot: string) {
    const inCell = draft.filter((e) => e.dayOfWeek === day && e.timeSlot === slot);
    const others = draft.filter((e) => !(e.dayOfWeek === day && e.timeSlot === slot));
    inCell.sort((a, b) => {
      const sa = studentById.get(a.studentId);
      const sb = studentById.get(b.studentId);
      const la = (sa?.lastName ?? "").toLowerCase();
      const lb = (sb?.lastName ?? "").toLowerCase();
      if (la !== lb) return la.localeCompare(lb);
      return (sa?.firstName ?? "").toLowerCase().localeCompare((sb?.firstName ?? "").toLowerCase());
    });
    onChange([...others, ...inCell]);
  }

  function removeSlot(day: Weekday, slot: string) {
    onChange(draft.filter((e) => !(e.dayOfWeek === day && e.timeSlot === slot)));
    setExtraSlots((s) => ({ ...s, [day]: (s[day] ?? []).filter((x) => x !== slot) }));
    setEditing(null);
  }

  // A slot is teacher-specific: its teacher is recorded on the empty marker, or
  // (for an already-populated slot) inferred from its first student.
  function slotTeacher(day: Weekday, slot: string): string {
    const inCell = draft.filter((e) => e.dayOfWeek === day && e.timeSlot === slot);
    const marker = inCell.find((e) => !e.studentId && e.teacherId);
    if (marker) return marker.teacherId;
    return inCell.find((e) => e.studentId)?.teacherId ?? "";
  }

  // Set the slot's teacher by replacing its marker (students kept). Drives which
  // teacher's students the cell editor lists first.
  function setSlotTeacher(day: Weekday, slot: string, teacherId: string) {
    const others = draft.filter((e) => !(e.dayOfWeek === day && e.timeSlot === slot && !e.studentId));
    onChange([...others, { teacherId, dayOfWeek: day, timeSlot: slot, studentId: "" }]);
  }

  return (
    <>
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

      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          backgroundImage: templateStripes
            ? "repeating-linear-gradient(45deg, var(--color-stripe), var(--color-stripe) 6px, transparent 6px, transparent 12px)"
            : undefined,
          borderRadius: "var(--border-radius-md)",
        }}
      >
        {/* Hour gutter */}
        <div style={{ width: 46, flexShrink: 0 }}>
          <div style={{ height: HEADER_PX }} />
          {eventsTopShift > 0 && <div style={{ height: eventsTopShift }} />}
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
          const isClosed =
            columnDate !== null && !outOfTerm && closures.includes(toISODate(columnDate));
          const dimmed = outOfTerm || isClosed;
          return (
            <div key={day} style={{ flex: 1, minWidth: 0 }}>
              {(() => {
                // In week mode the header is a button that opens Today on that day;
                // in dateless template mode it's a plain label (no date to open).
                const openable = !!(columnDate && onOpenDay);
                const inner = (
                  <>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: dimmed
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
                  </>
                );
                const baseStyle: CSSProperties = {
                  height: HEADER_PX,
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 1.1,
                };
                return openable ? (
                  <button
                    onClick={() => onOpenDay!(toISODate(columnDate!))}
                    title={`Open ${formatShort(columnDate!)} in Today`}
                    style={{
                      ...baseStyle,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: 0,
                      borderRadius: "var(--border-radius-md)",
                    }}
                  >
                    {inner}
                  </button>
                ) : (
                  <div style={baseStyle}>{inner}</div>
                );
              })()}

              {maxEventsPerDay > 0 && (
                <div
                  style={{
                    height: eventsTopShift,
                    position: "relative",
                    zIndex: 5,
                    overflow: "visible",
                    borderLeft: "0.5px solid var(--color-border-tertiary)",
                  }}
                >
                  {!outOfTerm &&
                    (events[dayIndex] ?? []).map((event, i) => (
                      <div
                        key={`${event.kind}-${event.studentId}-${i}`}
                        style={{ position: "absolute", top: i * EVENT_LINE_PX, left: 4, right: 4 }}
                      >
                        <EventChip
                          event={event}
                          onClick={() => onOpenStudent?.(event.studentId)}
                          height={EVENT_LINE_PX - 2}
                        />
                      </div>
                    ))}
                </div>
              )}

              <div
                style={{
                  position: "relative",
                  height: bodyHeight,
                  borderLeft: "0.5px solid var(--color-border-tertiary)",
                  opacity: dimmed ? 0.4 : 1,
                }}
              >
                {dimmed && (
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
                    {outOfTerm ? "Outside term" : "No school"}
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

                {!dimmed &&
                  slots.map((slot) => {
                    const top = (slotStartMinutes(slot) - axis.gridStart) * scale;
                    const durationPx = (slotEndMinutes(slot) - slotStartMinutes(slot)) * scale;
                    const minHeight = Math.max(cellHeight, durationPx);
                    const rawStudentIds = cells.get(`${day}|${slot}`) ?? [];
                    const studentIds = rawStudentIds.filter((id) => {
                      const s = studentById.get(id);
                      if (!s || s.archived) return false;
                      return !columnDate || isActiveOn(s, columnDate);
                    });
                    const tplCell = templateCells?.get(`${day}|${slot}`);
                    const isCustomized = (sid: string) => weekMode && !(tplCell?.has(sid) ?? false);
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
                                const isAbsent =
                                  !!columnDate &&
                                  !!student &&
                                  !!absentByKey
                                    ?.get(`${toISODate(columnDate)}|${student.teacherId}`)
                                    ?.has(studentId);
                                return (
                                  <span
                                    key={`${studentId}-${i}`}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 3,
                                      fontSize: 11,
                                      padding: "1px 6px",
                                      background: color.bg,
                                      color: color.text,
                                      borderRadius: "var(--border-radius-md)",
                                      whiteSpace: "nowrap",
                                      textDecoration: isAbsent ? "line-through" : undefined,
                                      opacity: isAbsent ? 0.6 : 1,
                                    }}
                                  >
                                    {student ? fullName(student) : "Unknown"}
                                    {isAbsent && (
                                      <Icon name="user-off" size={10} label="Marked absent" />
                                    )}
                                    {isCustomized(studentId) && (
                                      <Icon name="pencil" size={10} label="Customized this week" />
                                    )}
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

              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {!dimmed &&
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
                {columnDate && !outOfTerm && onToggleClosure && (
                  <button
                    className="button button--ghost button--small"
                    onClick={() => onToggleClosure(columnDate)}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      color: "var(--color-text-tertiary)",
                    }}
                  >
                    <Icon name={isClosed ? "calendar-plus" : "x"} size={13} />
                    {isClosed ? "Mark school day" : "No school"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing &&
        (() => {
          const colDate = weekDate ? addDays(weekDate, WEEKDAYS.indexOf(editing.day)) : null;
          const selectedOrdered = (cells.get(`${editing.day}|${editing.slot}`) ?? [])
            .map((id) => studentById.get(id))
            .filter((s): s is Student => s != null)
            .filter((s) => !colDate || isActiveOn(s, colDate));
          return (
            <CellEditor
              day={editing.day}
              slot={editing.slot}
              students={editorStudents(students, weekDate, editing.day)}
              teachers={teachers}
              slotTeacherId={slotTeacher(editing.day, editing.slot)}
              onSetTeacher={(tid) => setSlotTeacher(editing.day, editing.slot, tid)}
              selectedOrdered={selectedOrdered}
              onToggle={(student, on) => toggleStudent(editing.day, editing.slot, student, on)}
              onMove={(student, dir) => moveStudentInCell(editing.day, editing.slot, student.id, dir)}
              onSort={() => sortCellByLastName(editing.day, editing.slot)}
              onOpenStudent={
                onOpenStudent
                  ? (id) => {
                      setEditing(null);
                      onOpenStudent(id);
                    }
                  : undefined
              }
              onDelete={() => removeSlot(editing.day, editing.slot)}
              onClose={() => setEditing(null)}
            />
          );
        })()}
    </>
  );
}

function CellEditor({
  day,
  slot,
  students,
  teachers,
  slotTeacherId,
  onSetTeacher,
  selectedOrdered,
  onToggle,
  onMove,
  onSort,
  onOpenStudent,
  onDelete,
  onClose,
}: {
  day: Weekday;
  slot: string;
  students: Student[];
  teachers: Teacher[];
  slotTeacherId: string;
  onSetTeacher: (teacherId: string) => void;
  selectedOrdered: Student[];
  onToggle: (student: Student, on: boolean) => void;
  onMove: (student: Student, dir: -1 | 1) => void;
  onSort: () => void;
  onOpenStudent?: (studentId: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showOthers, setShowOthers] = useState(false);
  const q = query.trim().toLowerCase();
  const selectedSet = new Set(selectedOrdered.map((s) => s.id));
  const filteredUnselected = students
    .filter((s) => !selectedSet.has(s.id))
    .filter((s) => (q === "" ? true : fullName(s).toLowerCase().includes(q)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  // The slot is teacher-specific: list that teacher's students first; everyone
  // else lives in a collapsed "Other teachers" section.
  const slotTeacher = teachers.find((t) => t.id === slotTeacherId);
  const primary = slotTeacherId
    ? filteredUnselected.filter((s) => s.teacherId === slotTeacherId)
    : [];
  const otherStudents = filteredUnselected.filter((s) => s.teacherId !== slotTeacherId);
  const grouped = new Map<string, Student[]>();
  for (const s of otherStudents) {
    const key = s.teacherId || "__unassigned";
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }
  const otherGroups: { key: string; label: string; color: string; students: Student[] }[] = [];
  for (const t of teachers) {
    if (t.id === slotTeacherId) continue;
    const list = grouped.get(t.id);
    if (list && list.length > 0) {
      otherGroups.push({ key: t.id, label: t.name, color: teacherColor(t.color).bg, students: list });
    }
  }
  const unassigned = grouped.get("__unassigned");
  if (unassigned && unassigned.length > 0) {
    otherGroups.push({ key: "__unassigned", label: "Unassigned", color: "transparent", students: unassigned });
  }
  // Surface other teachers automatically while searching, or when there's no
  // teacher-specific list to show.
  const othersOpen = showOthers || q !== "" || !slotTeacherId;

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
        style={{ width: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 12, margin: 0 }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>{day}</h3>
            <p style={{ margin: "2px 0 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
              {slot} · {selectedOrdered.length} student{selectedOrdered.length === 1 ? "" : "s"}
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-secondary)", flexShrink: 0 }}>Teacher</span>
          <select
            className="input"
            value={slotTeacherId}
            onChange={(e) => onSetTeacher(e.target.value)}
            style={{
              fontSize: 13,
              flex: 1,
              ...(slotTeacher
                ? {
                    background: teacherColor(slotTeacher.color).bg,
                    color: teacherColor(slotTeacher.color).text,
                    borderColor: teacherColor(slotTeacher.color).bg,
                  }
                : {}),
            }}
          >
            <option value="">Select teacher…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
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

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {selectedOrdered.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 4px 4px 4px",
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--color-text-tertiary)",
                }}
              >
                <span>In this slot — paste order</span>
                <button
                  className="button button--ghost button--small"
                  onClick={onSort}
                  style={{ padding: "2px 6px", fontSize: 11, textTransform: "none" }}
                  title="Sort selected students alphabetically by last name"
                >
                  Sort by last name
                </button>
              </div>
              {selectedOrdered.map((student, i) => {
                const t = teachers.find((x) => x.id === student.teacherId);
                const c = teacherColor(t?.color);
                return (
                  <div
                    key={student.id}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 4px", fontSize: 14 }}
                  >
                    <span
                      style={{ fontSize: 11, color: "var(--color-text-tertiary)", width: 16, textAlign: "right" }}
                    >
                      {i + 1}.
                    </span>
                    <button
                      onClick={() => onOpenStudent?.(student.id)}
                      title={onOpenStudent ? `Open ${fullName(student)}` : undefined}
                      disabled={!onOpenStudent}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textAlign: "left",
                        padding: "3px 10px",
                        background: c.bg,
                        color: c.text,
                        border: "none",
                        borderRadius: "var(--border-radius-md)",
                        fontSize: 13,
                        fontFamily: "inherit",
                        cursor: onOpenStudent ? "pointer" : "default",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {fullName(student)}
                    </button>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => onMove(student, -1)}
                      disabled={i === 0}
                      title="Move up"
                      style={{ padding: 2, color: "var(--color-text-secondary)", lineHeight: 0 }}
                      aria-label="Move up"
                    >
                      <Icon name="chevron-left" size={14} />
                    </button>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => onMove(student, 1)}
                      disabled={i === selectedOrdered.length - 1}
                      title="Move down"
                      style={{ padding: 2, color: "var(--color-text-secondary)", lineHeight: 0 }}
                      aria-label="Move down"
                    >
                      <Icon name="chevron-right" size={14} />
                    </button>
                    <button
                      className="button button--ghost button--small"
                      onClick={() => onToggle(student, false)}
                      title="Remove from this slot"
                      style={{ padding: 2, color: "var(--color-text-tertiary)", lineHeight: 0 }}
                      aria-label="Remove"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              paddingTop: selectedOrdered.length > 0 ? 10 : 0,
              borderTop:
                selectedOrdered.length > 0 ? "0.5px solid var(--color-border-tertiary)" : undefined,
            }}
          >
            {slotTeacher ? (
              <>
                <div style={sectionLabelStyle}>Add from {slotTeacher.name}</div>
                {primary.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", padding: "4px 0 6px" }}>
                    {q === ""
                      ? `Everyone on ${slotTeacher.name}'s caseload is already in this slot.`
                      : "No matches for this teacher."}
                  </p>
                ) : (
                  <StudentGrid students={primary} onAdd={(s) => onToggle(s, true)} />
                )}
              </>
            ) : (
              <div style={sectionLabelStyle}>Pick a teacher to list students</div>
            )}

            {otherGroups.length > 0 && (
              <div style={{ marginTop: slotTeacher ? 10 : 4 }}>
                <button
                  className="button button--ghost button--small"
                  onClick={() => setShowOthers((v) => !v)}
                  style={{
                    padding: "4px 4px",
                    color: "var(--color-text-secondary)",
                    fontSize: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span style={{ display: "inline-flex", lineHeight: 0, transform: othersOpen ? "rotate(90deg)" : "none" }}>
                    <Icon name="chevron-right" size={12} />
                  </span>
                  Other teachers' students
                </button>
                {othersOpen && (
                  <div>
                    {otherGroups.map((group) => (
                      <div key={group.key} style={{ display: "flex", flexDirection: "column" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 4px 4px 4px",
                            fontSize: 11,
                            fontWeight: 500,
                            color: "var(--color-text-tertiary)",
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: group.color, flexShrink: 0 }} />
                          {group.label}
                        </div>
                        <StudentGrid students={group.students} onAdd={(s) => onToggle(s, true)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button--small button--danger-text" onClick={onDelete}>
            Delete time slot
          </button>
          <button className="button button--small button--primary" style={{ flex: 1 }} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

const sectionLabelStyle: CSSProperties = {
  padding: "0 4px 4px 4px",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--color-text-tertiary)",
};

// Two-column checkbox grid of addable students.
function StudentGrid({ students, onAdd }: { students: Student[]; onAdd: (s: Student) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 10 }}>
      {students.map((student) => (
        <label
          key={student.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 4px 5px 14px",
            fontSize: 14,
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          <input type="checkbox" checked={false} onChange={() => onAdd(student)} />
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fullName(student)}
          </span>
        </label>
      ))}
    </div>
  );
}

// "8:00" style label for a whole-hour tick on the 12-hour school clock.
function formatHour(h: number): string {
  const hour12 = h > 12 ? h - 12 : h;
  return `${hour12}:00`;
}

// Students offered in the cell editor: drop archived everywhere, and in week mode
// drop anyone whose enrollment window doesn't include the column's date.
function editorStudents(students: Student[], weekDate: Date | null, day: Weekday): Student[] {
  const columnDate = weekDate ? addDays(weekDate, WEEKDAYS.indexOf(day)) : null;
  return students.filter((s) => {
    if (s.archived) return false;
    if (columnDate && !isActiveOn(s, columnDate)) return false;
    return true;
  });
}
