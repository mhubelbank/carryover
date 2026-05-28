import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { loadIepHistory } from "../domain/data";
import { daysBetween, formatShort, parseDate, startOfDay } from "../domain/dates";
import type { Goal } from "../domain/goal";
import type { IepReview } from "../domain/iep";
import { ageFlag } from "../domain/student";
import { StudentGoals } from "./Goals";

interface Props {
  onNavigate: (page: NavPage) => void;
}

type View = { kind: "list" } | { kind: "detail"; id: string } | { kind: "goals"; id: string };

export function Students({ onNavigate }: Props) {
  const { state } = useTerm();
  const [view, setView] = useState<View>({ kind: "list" });
  if (state.status !== "ready") return null;

  if (view.kind === "detail") {
    return (
      <StudentDetail
        studentId={view.id}
        onBack={() => setView({ kind: "list" })}
        onViewGoals={() => setView({ kind: "goals", id: view.id })}
        onNavigate={onNavigate}
      />
    );
  }
  if (view.kind === "goals") {
    return (
      <StudentGoals
        studentId={view.id}
        onBack={() => setView({ kind: "detail", id: view.id })}
        onNavigate={onNavigate}
      />
    );
  }
  return <StudentsList onNavigate={onNavigate} onOpen={(id) => setView({ kind: "detail", id })} />;
}

function StudentsList({
  onNavigate,
  onOpen,
}: {
  onNavigate: (page: NavPage) => void;
  onOpen: (id: string) => void;
}) {
  const { state, teacherById } = useTerm();
  const [query, setQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState<string>("all");

  const data = state.status === "ready" ? state.data : null;
  const goalCount = useMemo(
    () => (data ? countActiveGoals(data.goals) : new Map<string, number>()),
    [data],
  );
  if (!data) return null;

  const now = startOfDay(new Date());
  const q = query.trim().toLowerCase();
  const filtered = data.students
    .filter((s) => (teacherFilter === "all" ? true : s.teacherId === teacherFilter))
    .filter((s) => (q === "" ? true : s.name.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Students</h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
          {data.students.length} student{data.students.length === 1 ? "" : "s"} across{" "}
          {data.teachers.length} teacher{data.teachers.length === 1 ? "" : "s"}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <div style={{ flex: 1, position: "relative" }}>
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
            style={{ paddingLeft: 32 }}
            placeholder="Search students…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 160 }}
          value={teacherFilter}
          onChange={(e) => setTeacherFilter(e.target.value)}
        >
          <option value="all">All teachers</option>
          {data.teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-md)",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "var(--color-background-secondary)" }}>
              <th style={th(24)}>Name</th>
              <th style={th(14)}>Teacher</th>
              <th style={th(12)}>Pronouns</th>
              <th style={th(24)}>AAC device</th>
              <th style={th(9)}>Goals</th>
              <th style={th(12)}>Next IEP</th>
              <th style={{ width: "5%" }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const iep = parseDate(s.nextIepReview);
              const delta = iep ? daysBetween(now, iep) : null;
              const iepColor =
                delta == null
                  ? "var(--color-text-secondary)"
                  : delta < 0
                    ? "var(--color-text-danger)"
                    : delta <= 14
                      ? "var(--color-text-warning)"
                      : "var(--color-text-secondary)";
              const count = goalCount.get(s.id) ?? 0;
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  style={{ borderTop: "0.5px solid var(--color-border-tertiary)", cursor: "pointer" }}
                >
                  <td style={td()}>{s.name}</td>
                  <td style={td("var(--color-text-secondary)")}>
                    {teacherById.get(s.teacherId)?.name ?? "—"}
                  </td>
                  <td style={td("var(--color-text-secondary)")}>{s.pronouns || "—"}</td>
                  <td style={{ ...td("var(--color-text-secondary)"), fontSize: 13 }}>
                    {s.aacDevice ?? "—"}
                  </td>
                  <td
                    style={{
                      ...td(count === 0 ? "var(--color-text-warning)" : "var(--color-text-secondary)"),
                      fontWeight: count === 0 ? 500 : 400,
                    }}
                  >
                    {count}
                  </td>
                  <td style={{ ...td(iepColor), fontSize: 13, fontWeight: delta != null && delta <= 14 ? 500 : 400 }}>
                    {iep ? formatShort(iep) : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    <span style={{ color: "var(--color-text-tertiary)", lineHeight: 0 }}>
                      <Icon name="chevron-right" size={14} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div
          style={{
            padding: "12px 14px",
            textAlign: "center",
            fontSize: 13,
            color: "var(--color-text-tertiary)",
            borderTop: "0.5px solid var(--color-border-tertiary)",
          }}
        >
          {filtered.length === 0
            ? "No students match"
            : `Showing ${filtered.length} of ${data.students.length}`}
        </div>
      </div>
    </div>
  );
}

function StudentDetail({
  studentId,
  onBack,
  onViewGoals,
  onNavigate,
}: {
  studentId: string;
  onBack: () => void;
  onViewGoals: () => void;
  onNavigate: (page: NavPage) => void;
}) {
  const { state, teacherById, studentById, client } = useTerm();
  const [history, setHistory] = useState<IepReview[] | null>(null);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setHistory(null);
    loadIepHistory(client, studentId)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client, studentId]);

  const data = state.status === "ready" ? state.data : null;
  const student = studentById.get(studentId);
  if (!data || !student) return null;

  const teacher = teacherById.get(student.teacherId);
  const goalCount = data.goals.filter((g) => g.studentId === student.id && !g.archived).length;
  const flag = ageFlag(student.age);
  const ageColor =
    flag === "alert"
      ? "var(--color-text-danger)"
      : flag === "warn"
        ? "var(--color-text-warning)"
        : undefined;

  return (
    <div className="shell">
      <Nav current="students" onNavigate={onNavigate} />

      <div style={{ marginBottom: "1.25rem" }}>
        <button
          className="button button--ghost button--small"
          onClick={onBack}
          style={{ padding: 0, color: "var(--color-text-secondary)" }}
        >
          ← All students
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: "var(--color-background-info)",
              color: "var(--color-text-info)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 500,
              fontSize: 15,
            }}
          >
            {student.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{student.name}</h1>
            <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary)", fontSize: 14 }}>
              {teacher ? `${teacher.name}'s caseload` : "No teacher"} · {goalCount} goal
              {goalCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <button className="button button--small" onClick={onViewGoals}>
          View goals
          <Icon name="chevron-right" size={14} />
        </button>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Profile</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
          <Field label="Name">{student.name}</Field>
          <Field label="Pronouns">{student.pronouns || "—"}</Field>
          <Field label="Age">
            <span style={{ color: ageColor }}>{student.age ?? "—"}</span>
          </Field>
          <Field label="Teacher">{teacher?.name ?? "—"}</Field>
          <div style={{ gridColumn: "span 2" }}>
            <Field label="AAC device">{student.aacDevice ?? "—"}</Field>
          </div>
        </div>

        <Divider />
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px 0" }}>IEP dates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
          <Field label="Next IEP review">{formatDateField(student.nextIepReview)}</Field>
          <Field label="Next triennial">{formatDateField(student.nextTriennial)}</Field>
          <Field label="Mandate">{student.mandate ?? "—"}</Field>
        </div>

        {teacher && teacher.perStudentFields.length > 0 && (
          <>
            <Divider />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>Teacher-specific fields</h3>
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
                (from {teacher.name}'s setup)
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px 20px" }}>
              {teacher.perStudentFields.map((field) => (
                <Field key={field.key} label={field.label}>
                  {isTruthy(student.fields[field.key]) ? "Yes" : "No"}
                </Field>
              ))}
            </div>
          </>
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
            IEP history
          </h3>
          {history && history.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {history.length} review{history.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {history === null ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>Loading…</p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-tertiary)" }}>
            No IEP reviews recorded yet.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {history.map((review, i) => (
              <ReviewRow key={`${review.date}-${i}`} review={review} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ review }: { review: IepReview }) {
  const date = parseDate(review.date);
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "12px 0",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}
    >
      <div style={{ flexShrink: 0, width: 96 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>
          {date ? formatShort(date) : review.date}
        </p>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: review.note ? 6 : 0 }}>
          {review.nothingChanged ? (
            <Badge bg="var(--color-background-info)" color="var(--color-text-info)">
              <Icon name="check" size={11} /> Nothing changed
            </Badge>
          ) : (
            <>
              {review.added ? (
                <Badge bg="var(--color-background-success)" color="var(--color-text-success)">
                  + {review.added} goal{review.added === 1 ? "" : "s"}
                </Badge>
              ) : null}
              {review.retired ? (
                <Badge bg="var(--color-background-secondary)" color="var(--color-text-secondary)">
                  {review.retired} retired
                </Badge>
              ) : null}
              {review.kept ? (
                <Badge bg="var(--color-background-secondary)" color="var(--color-text-secondary)">
                  {review.kept} kept
                </Badge>
              ) : null}
            </>
          )}
        </div>
        {review.note && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{review.note}</p>
        )}
      </div>
    </div>
  );
}

function Badge({ bg, color, children }: { bg: string; color: string; children: ReactNode }) {
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 7px",
        background: bg,
        color,
        borderRadius: "var(--border-radius-md)",
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      {children}
    </span>
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

function Divider() {
  return (
    <div
      style={{
        margin: "1.25rem 0",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}
    />
  );
}

function formatDateField(iso: string | null): string {
  const date = parseDate(iso);
  return date ? formatShort(date) : "—";
}

function isTruthy(value: string | undefined): boolean {
  const t = (value ?? "").trim().toLowerCase();
  return t === "true" || t === "1" || t === "yes";
}

function countActiveGoals(goals: Goal[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const goal of goals) {
    if (goal.archived) continue;
    counts.set(goal.studentId, (counts.get(goal.studentId) ?? 0) + 1);
  }
  return counts;
}

function th(widthPct: number) {
  return {
    textAlign: "left" as const,
    padding: "10px 14px",
    fontWeight: 500,
    fontSize: 12,
    color: "var(--color-text-secondary)",
    width: `${widthPct}%`,
  };
}

function td(color?: string) {
  return { padding: "10px 14px", color };
}
