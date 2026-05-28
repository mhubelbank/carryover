import { useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { teacherColor, type Mode } from "../domain/teacher";

interface Props {
  onNavigate: (page: NavPage) => void;
}

const MODE_LABELS: Record<Mode, string> = { regular: "Regular", "filming-day": "Filming day" };

// Display labels for the developer-defined filming-day field components.
const FIELD_LABELS: Record<string, string> = {
  visualCues: "Visual cues",
  facialExpressions: "Facial expressions",
  decodingCarryover: "Decoding carryover",
  pragmatic: "Pragmatic skills",
  compliments: "Gave compliments",
  freeText: "Free-text description",
};
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? key;

export function Teachers({ onNavigate }: Props) {
  const { state } = useTerm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (state.status !== "ready") return null;

  if (selectedId) {
    return (
      <TeacherDetail teacherId={selectedId} onBack={() => setSelectedId(null)} onNavigate={onNavigate} />
    );
  }
  return <TeacherList onNavigate={onNavigate} onOpen={setSelectedId} />;
}

function TeacherList({
  onNavigate,
  onOpen,
}: {
  onNavigate: (page: NavPage) => void;
  onOpen: (id: string) => void;
}) {
  const { state } = useTerm();
  const data = state.status === "ready" ? state.data : null;
  if (!data) return null;

  const studentCount = new Map<string, number>();
  for (const s of data.students) {
    studentCount.set(s.teacherId, (studentCount.get(s.teacherId) ?? 0) + 1);
  }

  return (
    <div className="shell">
      <Nav current="teachers" onNavigate={onNavigate} />
      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Teachers</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {data.teachers.length} teacher{data.teachers.length === 1 ? "" : "s"}
        </p>
      </div>

      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          overflow: "hidden",
        }}
      >
        {data.teachers.map((teacher, i) => {
          const color = teacherColor(teacher.color);
          const count = studentCount.get(teacher.id) ?? 0;
          return (
            <button
              key={teacher.id}
              onClick={() => onOpen(teacher.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
                textAlign: "left",
                padding: "12px 14px",
                background: "transparent",
                border: "none",
                borderTop: i === 0 ? "none" : "0.5px solid var(--color-border-tertiary)",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: color.bg }} />
                <span style={{ fontSize: 14 }}>{teacher.name}</span>
                {teacher.modes.map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: 11,
                      padding: "1px 7px",
                      borderRadius: "var(--border-radius-md)",
                      background: "var(--color-background-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {MODE_LABELS[m]}
                  </span>
                ))}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                  {count} student{count === 1 ? "" : "s"}
                </span>
                <span style={{ color: "var(--color-text-tertiary)", lineHeight: 0 }}>
                  <Icon name="chevron-right" size={14} />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TeacherDetail({
  teacherId,
  onBack,
  onNavigate,
}: {
  teacherId: string;
  onBack: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById } = useTerm();
  const data = state.status === "ready" ? state.data : null;
  const teacher = teacherById.get(teacherId);
  if (!data || !teacher) return null;

  const color = teacherColor(teacher.color);
  const students = data.students.filter((s) => s.teacherId === teacher.id);
  const showFilming = teacher.modes.includes("filming-day") || teacher.roles.length > 0;

  return (
    <div className="shell">
      <Nav current="teachers" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← Teachers
        </button>
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 1.5rem 0" }}>{teacher.name}</h1>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Basics</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px", marginBottom: 14 }}>
          <Field label="Name">{teacher.name}</Field>
          <Field label="Color in schedule">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: color.bg }} />
              {color.label}
            </span>
          </Field>
        </div>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>Session modes</p>
        <div style={{ display: "flex", gap: 6 }}>
          {teacher.modes.map((m) => (
            <span
              key={m}
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: "var(--border-radius-md)",
                background: "var(--color-background-secondary)",
              }}
            >
              {MODE_LABELS[m]}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Regular mode · activities</h3>
        {teacher.activities.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No activities configured.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {teacher.activities.map((activity) => (
              <div
                key={activity.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: "var(--color-background-secondary)",
                  borderRadius: "var(--border-radius-md)",
                }}
              >
                <span style={{ fontSize: 13, flex: 1 }}>{activity.name}</span>
                {activity.hasSegmentName && <Tag>+ segment name</Tag>}
                {activity.freeText && <Tag>free text</Tag>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showFilming && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 className="card__title">Filming day · roles</h3>
          {teacher.roles.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No roles configured.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {teacher.roles.map((role) => (
                <div
                  key={role.id}
                  style={{
                    padding: "8px 10px",
                    background: "var(--color-background-secondary)",
                    borderRadius: "var(--border-radius-md)",
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13 }}>
                    {role.name}{" "}
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>
                      — "{role.phrase}"
                    </span>
                  </p>
                  {role.fields.length > 0 && (
                    <p style={{ margin: "2px 0 0 0", fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      Fields: {role.fields.map(fieldLabel).join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Per-student fields</h3>
        {teacher.perStudentFields.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            No per-student fields. Students under {teacher.name} only have the standard fields.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {teacher.perStudentFields.map((field) => (
              <div key={field.key} style={{ fontSize: 13 }}>
                {field.label}{" "}
                <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>· {field.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h3 className="card__title" style={{ margin: 0 }}>
            Caseload
          </h3>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {students.length} student{students.length === 1 ? "" : "s"}
          </span>
        </div>
        {students.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>No students assigned.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {students.map((s) => (
              <span
                key={s.id}
                style={{
                  fontSize: 13,
                  padding: "4px 10px",
                  background: color.bg,
                  color: color.text,
                  borderRadius: "var(--border-radius-md)",
                }}
              >
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 14, margin: 0 }}>{children}</p>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 7px",
        background: "var(--color-background-info)",
        color: "var(--color-text-info)",
        borderRadius: "var(--border-radius-md)",
      }}
    >
      {children}
    </span>
  );
}
