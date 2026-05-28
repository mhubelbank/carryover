import type { CSSProperties } from "react";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { WEEKDAYS, sortedTimeSlots } from "../domain/schedule";
import { teacherColor } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
}

export function Schedule({ onNavigate }: Props) {
  const { state, teacherById, studentById } = useTerm();
  if (state.status !== "ready") return null;
  const { term, schedule, teachers } = state.data;

  const slots = sortedTimeSlots(schedule);

  // (day|slot) -> studentIds in that cell.
  const cells = new Map<string, string[]>();
  for (const entry of schedule) {
    const key = `${entry.dayOfWeek}|${entry.timeSlot}`;
    const list = cells.get(key) ?? [];
    list.push(entry.studentId);
    cells.set(key, list);
  }

  return (
    <div className="shell">
      <Nav current="schedule" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Schedule</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {term.label} · {schedule.length} slot{schedule.length === 1 ? "" : "s"}
        </p>
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

      {slots.length === 0 ? (
        <div
          className="card"
          style={{ textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 14 }}
        >
          No time slots scheduled yet.
        </div>
      ) : (
        <div
          style={{
            border: "0.5px solid var(--color-border-tertiary)",
            borderRadius: "var(--border-radius-md)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "var(--color-background-secondary)" }}>
                <th style={headStyle(13)}>Time</th>
                {WEEKDAYS.map((day) => (
                  <th key={day} style={headStyle(17.4)}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((slot) => (
                <tr key={slot} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                  <td
                    style={{
                      padding: "10px 12px",
                      color: "var(--color-text-secondary)",
                      fontSize: 12,
                      verticalAlign: "top",
                    }}
                  >
                    {slot}
                  </td>
                  {WEEKDAYS.map((day) => {
                    const studentIds = cells.get(`${day}|${slot}`) ?? [];
                    return (
                      <td key={day} style={{ padding: "8px 10px", verticalAlign: "top" }}>
                        {studentIds.length === 0 ? (
                          <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>—</span>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {studentIds.map((studentId, i) => {
                              const student = studentById.get(studentId);
                              const teacher = student ? teacherById.get(student.teacherId) : undefined;
                              const color = teacherColor(teacher?.color);
                              return (
                                <span
                                  key={`${studentId}-${i}`}
                                  style={{
                                    fontSize: 12,
                                    padding: "2px 7px",
                                    background: color.bg,
                                    color: color.text,
                                    borderRadius: "var(--border-radius-md)",
                                  }}
                                >
                                  {student?.name ?? "Unknown"}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function headStyle(widthPct: number): CSSProperties {
  return {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: 500,
    fontSize: 12,
    color: "var(--color-text-secondary)",
    width: `${widthPct}%`,
  };
}
