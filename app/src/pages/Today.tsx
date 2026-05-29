import { useEffect, useState, type CSSProperties } from "react";
import { Banner } from "../components/Banner";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { daysBetween, formatLong, formatShort, mondayOf, parseDate, startOfDay, stepWeekday, toISODate, toWeekday, weekdayName } from "../domain/dates";
import { loadWeekSchedule } from "../domain/data";
import { slotStartMinutes, type ScheduleEntry } from "../domain/schedule";
import { teacherColor } from "../domain/teacher";
import type { Student } from "../domain/student";

interface Props {
  onNavigate: (page: NavPage) => void;
  onOpenStudent: (studentId: string, view?: "detail" | "goals") => void;
  onOpenTeacher: (teacherId: string) => void;
  onGenerate: (date: string, teacherId: string, studentIds: string[]) => void;
}

interface Session {
  timeSlot: string;
  teacherId: string;
  studentIds: string[];
}

const emptyBoxStyle: CSSProperties = {
  border: "0.5px dashed var(--color-border-tertiary)",
  borderRadius: "var(--border-radius-md)",
  padding: "1.5rem",
  textAlign: "center",
  color: "var(--color-text-tertiary)",
  fontSize: 14,
};

export function Today({ onNavigate, onOpenStudent, onOpenTeacher, onGenerate }: Props) {
  const { state, client, teacherById, studentById, saveTerm } = useTerm();
  const [selected, setSelected] = useState<Date>(() => toWeekday(startOfDay(new Date())));
  const [busy, setBusy] = useState(false);
  // The deviation file for the selected date's week, if one exists; otherwise we
  // fall back to the usual template. Keyed by the week's Monday so it only
  // reloads when the date crosses into a different week.
  const [weekSchedule, setWeekSchedule] = useState<ScheduleEntry[] | null>(null);
  const weekKey = toISODate(mondayOf(selected));
  useEffect(() => {
    // Fall back to the template while the new week loads, so a previous week's
    // customizations never linger on screen.
    setWeekSchedule(null);
    if (!client) return;
    let cancelled = false;
    loadWeekSchedule(client, weekKey)
      .then((res) => {
        if (!cancelled) setWeekSchedule(res ? res.entries : null);
      })
      .catch(() => {
        if (!cancelled) setWeekSchedule(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client, weekKey]);
  if (state.status !== "ready") return null;
  const { term, schedule, students } = state.data;
  const effectiveSchedule = weekSchedule ?? schedule;

  const now = startOfDay(new Date());

  // IEP status is relative to the real current date, not the previewed day.
  const overdue = new Set<string>();
  const overdueStudents: Student[] = [];
  const tomorrowStudents: Student[] = [];
  for (const student of students) {
    const date = parseDate(student.nextIepReview);
    if (!date) continue;
    const delta = daysBetween(now, date);
    if (delta < 0) {
      overdue.add(student.id);
      overdueStudents.push(student);
    } else if (delta === 1) {
      tomorrowStudents.push(student);
    }
  }

  const lastDay = parseDate(term.lastDay);
  const daysToEnd = lastDay ? daysBetween(now, lastDay) : null;
  const termEnding = daysToEnd != null && daysToEnd >= 0 && daysToEnd <= 14;

  const sessions = buildSessions(effectiveSchedule, weekdayName(selected));
  const studentCount = new Set(sessions.flatMap((s) => s.studentIds)).size;

  const firstDay = parseDate(term.firstDay);
  const selectedTime = selected.getTime();
  const inTerm =
    (!firstDay || selectedTime >= firstDay.getTime()) &&
    (!lastDay || selectedTime <= lastDay.getTime());
  const selectedIso = toISODate(selected);
  const isClosed = (term.closures ?? []).includes(selectedIso);

  async function setClosure(closed: boolean) {
    setBusy(true);
    try {
      const current = term.closures ?? [];
      const closures = closed
        ? [...current, selectedIso].filter((d, i, a) => a.indexOf(d) === i)
        : current.filter((d) => d !== selectedIso);
      await saveTerm({ ...term, closures });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Nav current="today" onNavigate={onNavigate} />

      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{formatLong(selected)}</h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
            {sessions.length} session{sessions.length === 1 ? "" : "s"} · {studentCount} student
            {studentCount === 1 ? "" : "s"}
            {weekSchedule !== null && (
              <span style={{ color: "var(--color-text-warning)" }}> · customized this week</span>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button button--small" onClick={() => setSelected((d) => stepWeekday(d, -1))}>
            <Icon name="chevron-left" size={14} />
          </button>
          <button className="button button--small" onClick={() => setSelected(toWeekday(now))}>
            Today
          </button>
          <button className="button button--small" onClick={() => setSelected((d) => stepWeekday(d, 1))}>
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.25rem" }}>
        {termEnding && (
          <Banner
            variant="warning"
            icon="calendar-plus"
            action={
              <button className="button button--small" disabled>
                Prepare new term →
              </button>
            }
          >
            {term.label} ends {lastDay ? formatShort(lastDay) : ""}
          </Banner>
        )}
        {overdueStudents.map((student) => (
          <Banner
            key={student.id}
            variant="danger"
            action={
              <button
                className="button button--small"
                onClick={() => onOpenStudent(student.id, "goals")}
              >
                Review goals →
              </button>
            }
          >
            {student.name}'s IEP review was {formatShort(parseDate(student.nextIepReview) ?? now)} — goal
            update needed before generating notes
          </Banner>
        ))}
        {tomorrowStudents.map((student) => (
          <Banner key={student.id} variant="info">
            {student.name}'s IEP review is tomorrow
          </Banner>
        ))}
      </div>

      {!inTerm ? (
        <div style={emptyBoxStyle}>
          {formatLong(selected)} is outside the {term.label}
          {firstDay && lastDay ? ` (${formatShort(firstDay)} – ${formatShort(lastDay)})` : ""}.
        </div>
      ) : isClosed ? (
        <div style={emptyBoxStyle}>
          <p style={{ margin: 0 }}>No school on {formatLong(selected)}.</p>
          <button
            className="button button--small"
            style={{ marginTop: 12 }}
            onClick={() => setClosure(false)}
            disabled={busy}
          >
            Mark as a school day
          </button>
        </div>
      ) : sessions.length === 0 ? (
        <div style={emptyBoxStyle}>No sessions scheduled for {weekdayName(selected)}.</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button
              className="button button--small"
              onClick={() => setClosure(true)}
              disabled={busy}
            >
              <Icon name="x" size={13} />
              No school today
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sessions.map((session) => {
            const blocked = session.studentIds.some((id) => overdue.has(id));
            const teacher = teacherById.get(session.teacherId);
            const color = teacherColor(teacher?.color);
            return (
              <div
                key={`${session.timeSlot}|${session.teacherId}`}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderTop: `4px solid ${color.bg}`,
                  borderRadius: "var(--border-radius-md)",
                  padding: "14px 16px",
                  background: blocked ? "var(--color-background-secondary)" : undefined,
                  opacity: blocked ? 0.85 : 1,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 10,
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>
                      {session.timeSlot}
                    </span>
                    <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
                    <button
                      onClick={() => onOpenTeacher(session.teacherId)}
                      title={`Open ${teacher?.name ?? "teacher"}`}
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        fontFamily: "inherit",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--color-text-primary)",
                      }}
                    >
                      {teacher?.name ?? "Unknown"}
                    </button>
                  </div>
                  <button
                    className={blocked ? "button button--small" : "button button--small button--primary"}
                    disabled={blocked}
                    onClick={() => onGenerate(selectedIso, session.teacherId, session.studentIds)}
                    title={blocked ? "Resolve the overdue IEP first" : undefined}
                  >
                    {blocked
                      ? "Blocked — review goals"
                      : `Generate ${session.studentIds.length} note${session.studentIds.length === 1 ? "" : "s"}`}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {session.studentIds.map((id, i) => {
                    const student = studentById.get(id);
                    const isOverdue = overdue.has(id);
                    return (
                      <button
                        key={`${id}-${i}`}
                        onClick={() => onOpenStudent(id)}
                        title={`Open ${student?.name ?? "student"}`}
                        style={{
                          fontSize: 13,
                          fontFamily: "inherit",
                          padding: "4px 10px",
                          borderRadius: "var(--border-radius-md)",
                          border: "none",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          background: isOverdue
                            ? "var(--color-background-danger)"
                            : "var(--color-background-secondary)",
                          color: isOverdue
                            ? "var(--color-text-danger)"
                            : "var(--color-text-primary)",
                        }}
                      >
                        {isOverdue && <Icon name="alert-circle" size={13} />}
                        {student?.name ?? "Unknown"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>
        </>
      )}
    </div>
  );
}

function buildSessions(
  schedule: { teacherId: string; dayOfWeek: string; timeSlot: string; studentId: string }[],
  weekday: string,
): Session[] {
  const byKey = new Map<string, Session>();
  for (const entry of schedule) {
    if (entry.dayOfWeek !== weekday) continue;
    const key = `${entry.timeSlot}|${entry.teacherId}`;
    let session = byKey.get(key);
    if (!session) {
      session = { timeSlot: entry.timeSlot, teacherId: entry.teacherId, studentIds: [] };
      byKey.set(key, session);
    }
    session.studentIds.push(entry.studentId);
  }
  return [...byKey.values()].sort(
    (a, b) => slotStartMinutes(a.timeSlot) - slotStartMinutes(b.timeSlot),
  );
}
