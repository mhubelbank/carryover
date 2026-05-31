import { useEffect, useState, type CSSProperties } from "react";
import { Banner } from "../components/Banner";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { daysBetween, formatLong, formatShort, mondayOf, parseDate, startOfDay, stepWeekday, toISODate, toWeekday, weekdayName } from "../domain/dates";
import { loadSessions, loadWeekSchedule } from "../domain/data";
import { slotStartMinutes, type ScheduleEntry } from "../domain/schedule";
import { teacherColor } from "../domain/teacher";
import { fullName, isActiveOn, type Student } from "../domain/student";

interface Props {
  onNavigate: (page: NavPage) => void;
  onOpenStudent: (studentId: string, view?: "detail" | "goals") => void;
  onOpenTeacher: (teacherId: string) => void;
  onGenerate: (date: string, teacherId: string, studentIds: string[], timeSlot?: string) => void;
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
  const { state, client, teacherById, studentById, saveStudents, saveTerm } = useTerm();
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
  // Which students already have a stored (generated) session, keyed
  // `${date}|${teacherId}`. Loaded once; Today remounts on return from Generate,
  // so it refreshes after she generates notes.
  const [generatedByKey, setGeneratedByKey] = useState<Map<string, Set<string>>>(() => new Map());
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadSessions(client)
      .then((all) => {
        if (cancelled) return;
        const m = new Map<string, Set<string>>();
        for (const s of all) {
          m.set(`${s.date}|${s.teacherId}`, new Set(s.students.map((e) => e.studentId)));
        }
        setGeneratedByKey(m);
      })
      .catch(() => {
        if (!cancelled) setGeneratedByKey(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
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
  // Banner appears on the term's last day and stays until she sets up the next
  // term. She rarely has the next term's schedule before the new term starts,
  // so notifying earlier just creates dismissal fatigue.
  const daysToEnd = lastDay ? daysBetween(now, lastDay) : null;
  const termOver = daysToEnd != null && daysToEnd <= 0;

  async function saveIepDate(studentId: string, nextIepReview: string | null) {
    await saveStudents(
      students.map((s) => (s.id === studentId ? { ...s, nextIepReview } : s)),
    );
  }

  // Skip students who are archived OR outside their enrollment window for the
  // selected date. Skip sessions owned by an archived teacher entirely.
  const activeStudentIds = new Set(
    students.filter((s) => isActiveOn(s, selected)).map((s) => s.id),
  );
  const sessions = buildSessions(effectiveSchedule, weekdayName(selected))
    .filter((s) => !teacherById.get(s.teacherId)?.archived)
    .map((s) => ({
      ...s,
      studentIds: s.studentIds.filter((id) => activeStudentIds.has(id)),
    }))
    .filter((s) => s.studentIds.length > 0);
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
        {termOver && (
          <Banner
            variant="warning"
            icon="calendar-plus"
            action={
              <button className="button button--small" disabled>
                Prepare new term →
              </button>
            }
          >
            {term.label} is over — time to prepare the next term.
          </Banner>
        )}
        {overdueStudents.map((student) => (
          <Banner
            key={student.id}
            variant="danger"
            action={
              <div style={{ display: "flex", gap: 6 }}>
                <IepDateChanger
                  current={student.nextIepReview}
                  onSave={(d) => saveIepDate(student.id, d)}
                />
                <button
                  className="button button--small"
                  onClick={() => onOpenStudent(student.id, "goals")}
                >
                  Review goals →
                </button>
              </div>
            }
          >
            {fullName(student)}'s IEP review was {formatShort(parseDate(student.nextIepReview) ?? now)}.
          </Banner>
        ))}
        {tomorrowStudents.map((student) => (
          <Banner
            key={student.id}
            variant="info"
            action={
              <IepDateChanger
                current={student.nextIepReview}
                onSave={(d) => saveIepDate(student.id, d)}
              />
            }
          >
            {fullName(student)}'s IEP review is tomorrow
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
            const teacher = teacherById.get(session.teacherId);
            const color = teacherColor(teacher?.color);
            const generatedSet = generatedByKey.get(`${selectedIso}|${session.teacherId}`);
            const allGenerated =
              !!generatedSet && session.studentIds.every((id) => generatedSet.has(id));
            return (
              <div
                key={`${session.timeSlot}|${session.teacherId}`}
                style={{
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderTop: `4px solid ${color.bg}`,
                  borderRadius: "var(--border-radius-md)",
                  padding: "14px 16px",
                  background: "var(--color-background-secondary)",
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
                    {allGenerated && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--color-text-success)",
                          background: "var(--color-background-success)",
                          padding: "2px 8px",
                          borderRadius: 999,
                        }}
                        title="Notes generated for this session"
                      >
                        <Icon name="check" size={12} /> Generated
                      </span>
                    )}
                  </div>
                  <button
                    className="button button--small button--primary"
                    onClick={() =>
                      onGenerate(selectedIso, session.teacherId, session.studentIds, session.timeSlot)
                    }
                  >
                    {allGenerated ? "Regenerate " : "Generate "}
                    {session.studentIds.length} note
                    {session.studentIds.length === 1 ? "" : "s"}
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {session.studentIds.map((id, i) => {
                    const student = studentById.get(id);
                    const isOverdue = overdue.has(id);
                    const isGenerated = !!generatedSet?.has(id);
                    return (
                      <button
                        key={`${id}-${i}`}
                        onClick={() => onOpenStudent(id)}
                        title={`Open ${student ? fullName(student) : "student"}`}
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
                            : "var(--color-background-tertiary)",
                          color: isOverdue
                            ? "var(--color-text-danger)"
                            : "var(--color-text-primary)",
                        }}
                      >
                        {isOverdue ? (
                          <Icon name="alert-circle" size={13} />
                        ) : (
                          isGenerated && (
                            <span style={{ color: "var(--color-text-success)", lineHeight: 0 }}>
                              <Icon name="check" size={13} />
                            </span>
                          )
                        )}
                        {student ? fullName(student) : "Unknown"}
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

// Inline IEP-date editor inside a banner action. Collapsed by default to a
// "Change IEP date" button; expanding reveals a date input + save/cancel. On
// successful save, the parent updates the student record and the surrounding
// banner naturally re-evaluates (the student may drop out of overdue/tomorrow).
function IepDateChanger({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);

  if (!editing) {
    return (
      <button
        className="button button--small"
        onClick={() => {
          setValue(current ?? "");
          setEditing(true);
        }}
      >
        Change IEP date
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        className="input"
        type="date"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ height: 28, fontSize: 13, padding: "2px 6px" }}
      />
      <button
        className="button button--small button--primary"
        disabled={saving || !value}
        onClick={async () => {
          setSaving(true);
          try {
            await onSave(value || null);
            setEditing(false);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "…" : "Save"}
      </button>
      <button
        className="button button--small"
        onClick={() => setEditing(false)}
        disabled={saving}
      >
        Cancel
      </button>
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
