import { useState, type CSSProperties } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { appendTermToHistory } from "../domain/data";
import { termLabel, type TermType } from "../domain/term";
import { teacherColor, type ColorKey, type Teacher } from "../domain/teacher";
import { ageFlag, computedAge, fullName, type Student } from "../domain/student";
import type { Goal } from "../domain/goal";
import { ColorPicker } from "./Teachers";

interface Props {
  onNavigate: (page: NavPage) => void;
  // Present when launched over existing data (from Settings); closes the wizard.
  // Absent for the first-run/empty case, where finishing reloads into the app.
  onClose?: () => void;
}

const STEPS = ["Year", "Teachers", "Students", "Schedule", "Goals"] as const;

function blankTeacher(): Teacher {
  return {
    id: `t_${crypto.randomUUID()}`,
    name: "",
    color: "purple",
    modes: ["regular"],
    activityIds: [],
    filmingRoleIds: [],
    sessionCaptures: [],
    archived: false,
  };
}

function cloneTeacher(t: Teacher): Teacher {
  return {
    ...t,
    modes: [...t.modes],
    activityIds: [...t.activityIds],
    filmingRoleIds: [...t.filmingRoleIds],
    sessionCaptures: (t.sessionCaptures ?? []).map((c) => ({ ...c })),
  };
}

function cloneStudent(s: Student): Student {
  const fields: Student["fields"] = {};
  for (const [k, v] of Object.entries(s.fields)) fields[k] = Array.isArray(v) ? [...v] : v;
  return {
    ...s,
    fields,
    defaultPromptingLevel: [...s.defaultPromptingLevel],
    defaultPromptingType: [...s.defaultPromptingType],
    defaultRedirection: [...s.defaultRedirection],
    defaultResponse: [...s.defaultResponse],
  };
}

function blankStudent(): Student {
  return {
    id: `s_${crypto.randomUUID()}`,
    firstName: "",
    middle: "",
    lastName: "",
    pronouns: "",
    teacherId: "",
    birthday: null,
    age: null,
    nextIepReview: null,
    nextTriennial: null,
    mandate: null,
    firstDay: null,
    lastDay: null,
    archived: false,
    fields: {},
    defaultPromptingLevel: [],
    defaultPromptingType: [],
    defaultRedirection: [],
    defaultResponse: [],
  };
}

// The new-term setup wizard (replaces the empty-state placeholder). Step 1
// (Year) creates the term, step 2 reviews the teacher roster; steps 3–5 (students,
// schedule, goals) are built out incrementally — placeholders for now.
export function NewTermWizard({ onNavigate, onClose }: Props) {
  const { state, client, saveTerm, saveTeachers, saveStudents, saveSchedule, reload } = useTerm();
  const ready = state.status === "ready" ? state.data : null;
  const [step, setStep] = useState(1);
  const [termType, setTermType] = useState<TermType>("school-year");
  const [firstDay, setFirstDay] = useState("");
  const [lastDay, setLastDay] = useState("");
  // Teacher roster carried forward (or empty on first run); editable here.
  const [teachers, setTeachers] = useState<Teacher[]>(() =>
    ready ? ready.teachers.filter((t) => !t.archived).map(cloneTeacher) : [],
  );
  const [teachersBase] = useState(() => JSON.stringify(teachers));
  // Continuing students (active, carried forward) + students added this session.
  const [continuing, setContinuing] = useState<Student[]>(() =>
    ready ? ready.students.filter((s) => !s.archived).map(cloneStudent) : [],
  );
  const [continuingBase] = useState(() => JSON.stringify(continuing));
  const [newStudents, setNewStudents] = useState<Student[]>([]);
  const archivedPrev = ready?.students.filter((s) => s.archived) ?? [];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = firstDay && lastDay ? termLabel(termType, firstDay, lastDay) : "";
  const yearValid = firstDay !== "" && lastDay !== "" && firstDay <= lastDay;

  async function finish() {
    if (!yearValid) {
      setStep(1);
      setError("Set the term's first and last day (last must be on or after first).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Keep a record of the outgoing term before term.json is overwritten.
      if (ready && client) await appendTermToHistory(client, ready.term);
      await saveTerm({ termType, firstDay, lastDay, label: termLabel(termType, firstDay, lastDay) });
      // Persist the reviewed roster only if it changed (drop blank-name rows).
      const cleanedTeachers = teachers.map((t) => ({ ...t, name: t.name.trim() })).filter((t) => t.name);
      if (JSON.stringify(cleanedTeachers) !== teachersBase) await saveTeachers(cleanedTeachers);
      // Roster = previously-archived (untouched) + continuing (edits/removals) +
      // new (blank-name rows dropped). Students archived this step get their last
      // day set to the prior term's end; new students start on this term's first
      // day. Only write if anything changed.
      const cleanedNew = newStudents
        .map((s) => ({ ...s, firstName: s.firstName.trim() }))
        .filter((s) => s.firstName);
      if (cleanedNew.length > 0 || JSON.stringify(continuing) !== continuingBase) {
        const priorLastDay = ready?.term.lastDay ?? null;
        const continuingFinal = continuing.map((s) =>
          s.archived ? { ...s, lastDay: s.lastDay ?? priorLastDay } : s,
        );
        const newFinal = cleanedNew.map((s) => ({ ...s, firstDay: s.firstDay ?? firstDay }));
        await saveStudents([...archivedPrev, ...continuingFinal, ...newFinal]);
      }
      // A new term's schedule starts empty (no carry-forward); clear the old one.
      if ((ready?.schedule.length ?? 0) > 0) await saveSchedule([]);
      // Term now exists → the app reloads into its normal (ready) state.
      reload();
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the term.");
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <Nav current="today" onNavigate={onNavigate} />

      <h1 style={{ margin: "0 0 1.5rem 0", fontSize: 22, fontWeight: 500 }}>Start a new term</h1>

      <Stepper step={step} onStep={setStep} />

      <div
        className="card"
        style={{ borderRadius: "var(--border-radius-lg)", padding: "1.5rem" }}
      >
        {step === 1 ? (
          <YearStep
            termType={termType}
            firstDay={firstDay}
            lastDay={lastDay}
            label={label}
            onTermType={setTermType}
            onFirstDay={setFirstDay}
            onLastDay={setLastDay}
          />
        ) : step === 2 ? (
          <TeachersStep teachers={teachers} onChange={setTeachers} />
        ) : step === 3 ? (
          <StudentsStep
            continuing={continuing}
            newStudents={newStudents}
            teachers={teachers}
            onContinuing={setContinuing}
            onNew={setNewStudents}
          />
        ) : step === 4 ? (
          <ScheduleStep hadSchedule={(ready?.schedule.length ?? 0) > 0} />
        ) : (
          <GoalsStep
            students={[
              ...continuing.filter((s) => !s.archived),
              ...newStudents.filter((s) => s.firstName.trim()),
            ]}
            goals={ready?.goals ?? []}
            teachers={teachers}
          />
        )}
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 12, fontSize: 13, color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}

      <div
        style={{
          marginTop: "1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {step === 1 && onClose && (
            <button className="button" onClick={onClose}>
              Cancel setup
            </button>
          )}
          {step > 1 && (
            <button className="button" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </button>
          )}
          {step > 1 && step < 5 && (
            <button
              className="button button--ghost button--small"
              style={{ color: "var(--color-text-secondary)" }}
              onClick={() => setStep((s) => s + 1)}
            >
              Skip this step →
            </button>
          )}
        </div>
        {step < 5 ? (
          <button
            className="button button--primary"
            disabled={step === 1 && !yearValid}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue →
          </button>
        ) : (
          <button
            className="button button--primary"
            disabled={saving || !yearValid}
            onClick={finish}
          >
            <Icon name="check" size={14} /> {saving ? "Creating…" : "Finish setup"}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: "1.5rem",
        padding: 4,
        background: "var(--color-background-secondary)",
        borderRadius: "var(--border-radius-md)",
      }}
    >
      {STEPS.map((name, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <button
            key={name}
            onClick={() => onStep(n)}
            style={{
              flex: 1,
              padding: "8px 12px",
              fontSize: 13,
              textAlign: "center",
              cursor: "pointer",
              border: "none",
              fontFamily: "inherit",
              fontWeight: active ? 500 : 400,
              color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              background: active ? "var(--color-background-primary)" : "transparent",
              borderRadius: "calc(var(--border-radius-md) - 2px)",
            }}
          >
            {n} · {name}
            {done ? " ✓" : ""}
          </button>
        );
      })}
    </div>
  );
}

function YearStep({
  termType,
  firstDay,
  lastDay,
  label,
  onTermType,
  onFirstDay,
  onLastDay,
}: {
  termType: TermType;
  firstDay: string;
  lastDay: string;
  label: string;
  onTermType: (t: TermType) => void;
  onFirstDay: (d: string) => void;
  onLastDay: (d: string) => void;
}) {
  return (
    <>
      <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500 }}>
        Term type
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: "1.25rem" }}>
        {(["school-year", "summer"] as const).map((t) => (
          <label
            key={t}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "12px 14px",
              border:
                termType === t
                  ? "2px solid var(--color-border-info)"
                  : "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-md)",
              cursor: "pointer",
            }}
          >
            <input type="radio" name="term-type" checked={termType === t} onChange={() => onTermType(t)} />
            <span style={{ fontSize: 14, fontWeight: 500 }}>
              {t === "school-year" ? "School year" : "Summer"}
            </span>
          </label>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
        <div>
          <label className="label">First day</label>
          <input
            className="input"
            type="date"
            value={firstDay}
            onChange={(e) => onFirstDay(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Last day</label>
          <input
            className="input"
            type="date"
            value={lastDay}
            onChange={(e) => onLastDay(e.target.value)}
          />
        </div>
      </div>

      {label && (
        <p style={{ margin: "1.25rem 0 0 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
          This term will be labeled <strong style={{ color: "var(--color-text-primary)" }}>{label}</strong>.
        </p>
      )}
    </>
  );
}

const TEACHER_MODES = [
  { id: "regular", label: "Regular" },
  { id: "filming-day", label: "Filming day" },
] as const;

function TeachersStep({
  teachers,
  onChange,
}: {
  teachers: Teacher[];
  onChange: (next: Teacher[]) => void;
}) {
  const [colorFor, setColorFor] = useState<string | null>(null);
  const colorTarget = teachers.find((t) => t.id === colorFor);
  const setName = (id: string, name: string) =>
    onChange(teachers.map((t) => (t.id === id ? { ...t, name } : t)));
  const setColor = (id: string, color: ColorKey) =>
    onChange(teachers.map((t) => (t.id === id ? { ...t, color } : t)));
  const toggleMode = (id: string, mode: Teacher["modes"][number], on: boolean) =>
    onChange(
      teachers.map((t) =>
        t.id === id
          ? { ...t, modes: on ? [...new Set([...t.modes, mode])] : t.modes.filter((m) => m !== mode) }
          : t,
      ),
    );
  const remove = (id: string) => onChange(teachers.filter((t) => t.id !== id));
  return (
    <div>
      <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
        Your teachers carry forward. Review the roster — rename, adjust modes, remove anyone who left,
        or add a new teacher. (Activities, roles, and special fields stay as configured.)
      </p>
      {teachers.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: "0 0 12px 0" }}>
          No teachers yet — add one below.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {teachers.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                type="button"
                onClick={() => setColorFor(t.id)}
                title="Schedule color"
                style={{
                  width: 24,
                  height: 24,
                  flexShrink: 0,
                  borderRadius: 6,
                  border: "0.5px solid var(--color-border-secondary)",
                  background: teacherColor(t.color).bg,
                  cursor: "pointer",
                }}
              />
              <input
                className="input"
                style={{ flex: 1, maxWidth: 240 }}
                placeholder="Teacher name"
                value={t.name}
                onChange={(e) => setName(t.id, e.target.value)}
              />
              <div style={{ display: "flex", gap: 14, fontSize: 13 }}>
                {TEACHER_MODES.map((m) => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={t.modes.includes(m.id)}
                      onChange={(e) => toggleMode(t.id, m.id, e.target.checked)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              <button
                className="button button--small button--danger-text"
                style={{ marginLeft: "auto", padding: "2px 8px" }}
                onClick={() => remove(t.id)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="button button--small" onClick={() => onChange([...teachers, blankTeacher()])}>
        <Icon name="plus" size={13} /> Add a teacher
      </button>

      {colorTarget && (
        <ColorPicker
          current={colorTarget.color}
          name={colorTarget.name}
          others={teachers
            .filter((x) => x.id !== colorTarget.id)
            .map((x) => ({ name: x.name, color: x.color }))}
          onPick={(c) => {
            setColor(colorTarget.id, c);
            setColorFor(null);
          }}
          onClose={() => setColorFor(null)}
        />
      )}
    </div>
  );
}

const CELL: CSSProperties = { padding: "4px 6px" };
const CELL_INPUT: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 13,
  padding: "6px 8px",
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
};

function StudentsStep({
  continuing,
  newStudents,
  teachers,
  onContinuing,
  onNew,
}: {
  continuing: Student[];
  newStudents: Student[];
  teachers: Teacher[];
  onContinuing: (next: Student[]) => void;
  onNew: (next: Student[]) => void;
}) {
  const [tab, setTab] = useState<"continuing" | "new">("continuing");
  const [filter, setFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [age21, setAge21] = useState(false);

  const patchIn = (list: Student[], set: (n: Student[]) => void, id: string, patch: Partial<Student>) =>
    set(list.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const removedCount = continuing.filter((s) => s.archived).length;
  const continuingCount = continuing.length - removedCount;
  const newCount = newStudents.filter((s) => s.firstName.trim()).length;

  const visibleContinuing = continuing.filter((s) => {
    if (filter && !fullName(s).toLowerCase().includes(filter.toLowerCase())) return false;
    if (teacherFilter && s.teacherId !== teacherFilter) return false;
    if (age21 && !s.archived) {
      const a = computedAge(s);
      if (a == null || a < 21) return false;
    }
    return true;
  });

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      const rows = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const cols = line.split(/\t|,/).map((c) => c.trim());
          const s = blankStudent();
          s.firstName = cols[0] ?? "";
          if (cols[1] && /^\d{4}-\d{2}-\d{2}$/.test(cols[1])) s.birthday = cols[1];
          return s;
        });
      if (rows.length) onNew([...newStudents, ...rows]);
    } catch {
      // Clipboard read denied — silently ignore.
    }
  }

  return (
    <div>
      {/* Continuing / New tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1.25rem" }}>
        {(["continuing", "new"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRadius: "var(--border-radius-md)",
              fontWeight: tab === t ? 500 : 400,
              background: tab === t ? "var(--color-background-secondary)" : "transparent",
              color: tab === t ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            }}
          >
            {t === "continuing" ? "Continuing" : "New"}
            <span style={{ color: "var(--color-text-tertiary)", marginLeft: 6 }}>
              {t === "continuing" ? continuingCount : newCount}
            </span>
          </button>
        ))}
      </div>

      {tab === "continuing" ? (
        <>
          <p style={{ margin: "0 0 14px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            Review the roster — update birthdays, teachers, or IEP dates. Click × to remove a student from
            this term; removed students are archived (not deleted) and can be restored with Undo.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select className="select" style={{ width: 160 }} value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">All teachers</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || "(unnamed)"}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={age21} onChange={(e) => setAge21(e.target.checked)} />
              Age 21+
            </label>
          </div>

          <StudentTable
            students={visibleContinuing}
            teachers={teachers}
            emptyText="No matching students."
            onPatch={(id, patch) => patchIn(continuing, onContinuing, id, patch)}
            onToggleRemove={(id) =>
              patchIn(continuing, onContinuing, id, { archived: !continuing.find((s) => s.id === id)?.archived })
            }
          />

          <p style={{ marginTop: 10, fontSize: 13, color: "var(--color-text-secondary)" }}>
            {continuingCount} continuing · {removedCount} removed
          </p>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className="button button--small" onClick={paste}>
              Paste from clipboard
            </button>
            <button className="button button--small" onClick={() => onNew([...newStudents, blankStudent()])}>
              <Icon name="plus" size={13} /> Add row
            </button>
          </div>

          <StudentTable
            students={newStudents}
            teachers={teachers}
            emptyText="No new students yet — paste a list or add a row."
            onPatch={(id, patch) => patchIn(newStudents, onNew, id, patch)}
            onToggleRemove={(id) => onNew(newStudents.filter((s) => s.id !== id))}
          />

          <p style={{ margin: "10px 4px 0 4px", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Teacher-specific fields can be set later from each student's detail page.
          </p>
        </>
      )}
    </div>
  );
}

function StudentTable({
  students,
  teachers,
  emptyText,
  onPatch,
  onToggleRemove,
}: {
  students: Student[];
  teachers: Teacher[];
  emptyText: string;
  onPatch: (id: string, patch: Partial<Student>) => void;
  onToggleRemove: (id: string) => void;
}) {
  const th: CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontWeight: 500,
    fontSize: 12,
    color: "var(--color-text-secondary)",
  };
  return (
    <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", overflow: "hidden" }}>
      <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: "var(--color-background-secondary)" }}>
            <th style={{ ...th, width: "26%" }}>Name</th>
            <th style={{ ...th, width: "18%" }}>Birthday</th>
            <th style={{ ...th, width: "10%" }}>Age</th>
            <th style={{ ...th, width: "19%" }}>Teacher</th>
            <th style={{ ...th, width: "18%" }}>Next IEP</th>
            <th style={{ width: "9%" }} />
          </tr>
        </thead>
        <tbody>
          {students.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ padding: "24px 14px", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
                {emptyText}
              </td>
            </tr>
          ) : (
            students.map((s) => (
              <StudentRow
                key={s.id}
                s={s}
                teachers={teachers}
                onPatch={(patch) => onPatch(s.id, patch)}
                onToggleRemove={() => onToggleRemove(s.id)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StudentRow({
  s,
  teachers,
  onPatch,
  onToggleRemove,
}: {
  s: Student;
  teachers: Teacher[];
  onPatch: (patch: Partial<Student>) => void;
  onToggleRemove: () => void;
}) {
  const border = "0.5px solid var(--color-border-tertiary)";
  if (s.archived) {
    return (
      <tr style={{ borderTop: border, background: "var(--color-background-secondary)", opacity: 0.6 }}>
        <td style={CELL}>
          <span style={{ textDecoration: "line-through", color: "var(--color-text-tertiary)", fontSize: 13, padding: "0 8px" }}>
            {fullName(s) || "(unnamed)"}
          </span>
        </td>
        <td colSpan={4} style={{ ...CELL, color: "var(--color-text-tertiary)", fontSize: 12 }}>
          removed from this term (archived)
        </td>
        <td style={{ ...CELL, textAlign: "center" }}>
          <button
            className="button button--small"
            style={{ fontSize: 11, padding: "3px 8px" }}
            onClick={onToggleRemove}
          >
            Undo
          </button>
        </td>
      </tr>
    );
  }
  const age = computedAge(s);
  const flag = ageFlag(age);
  const ageStyle: CSSProperties =
    flag === "alert"
      ? { background: "#FCEBEB", color: "#501313", fontWeight: 500 }
      : flag === "warn"
        ? { background: "#FAEEDA", color: "#633806", fontWeight: 500 }
        : {};
  return (
    <tr style={{ borderTop: border }}>
      <td style={CELL}>
        <input style={CELL_INPUT} value={s.firstName} placeholder="Name" onChange={(e) => onPatch({ firstName: e.target.value })} />
      </td>
      <td style={CELL}>
        <input
          type="date"
          style={CELL_INPUT}
          value={s.birthday ?? ""}
          onChange={(e) => onPatch({ birthday: e.target.value || null })}
        />
      </td>
      <td style={CELL}>
        {/* Age is derived from the birthday — locked. */}
        <span style={{ ...CELL_INPUT, ...ageStyle, display: "inline-block", borderRadius: 4, textAlign: "center" }}>
          {age ?? "—"}
        </span>
      </td>
      <td style={CELL}>
        <select style={CELL_INPUT} value={s.teacherId} onChange={(e) => onPatch({ teacherId: e.target.value })}>
          <option value="">—</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name || "(unnamed)"}
            </option>
          ))}
        </select>
      </td>
      <td style={CELL}>
        <input
          type="date"
          style={CELL_INPUT}
          value={s.nextIepReview ?? ""}
          onChange={(e) => onPatch({ nextIepReview: e.target.value || null })}
        />
      </td>
      <td style={{ ...CELL, textAlign: "center" }}>
        <button
          title="Remove from this term"
          onClick={onToggleRemove}
          style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 16, lineHeight: 1 }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function ScheduleStep({ hadSchedule }: { hadSchedule: boolean }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--color-text-tertiary)" }}>
      <Icon name="calendar-plus" size={28} />
      <p style={{ fontSize: 14, margin: "10px 0 0 0", color: "var(--color-text-secondary)" }}>
        A new term starts with an empty schedule.
      </p>
      <p style={{ fontSize: 13, margin: "8px auto 0", maxWidth: 460, lineHeight: 1.5 }}>
        {hadSchedule
          ? "Finishing clears last term's schedule. "
          : ""}
        Build the new weekly schedule on the Schedule tab afterward — add time slots and drop students
        into each day.
      </p>
    </div>
  );
}

function GoalsStep({
  students,
  goals,
  teachers,
}: {
  students: Student[];
  goals: Goal[];
  teachers: Teacher[];
}) {
  const activeGoals = goals.filter((g) => !g.archived);
  const withGoals = new Set(activeGoals.map((g) => g.studentId));
  const without = students.filter((s) => !withGoals.has(s.id));
  const teacherName = (id: string) => teachers.find((t) => t.id === id)?.name || "—";
  const stat = (label: string, value: number, warn = false): JSX.Element => (
    <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{label}</p>
      <p style={{ margin: "4px 0 0 0", fontSize: 24, fontWeight: 500, color: warn ? "var(--color-text-warning)" : undefined }}>
        {value}
      </p>
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.25rem" }}>
        {stat("With goals", students.length - without.length)}
        {stat("Without goals", without.length, without.length > 0)}
        {stat("Total short-term goals", activeGoals.length)}
      </div>
      {without.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Everyone has goals. You're ready to finish.
        </p>
      ) : (
        <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", background: "var(--color-background-secondary)", fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Students without goals · {without.length}
          </div>
          {without.map((s) => (
            <div key={s.id} style={{ padding: "10px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 14 }}>
              {fullName(s) || "(unnamed)"}{" "}
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>· {teacherName(s.teacherId)}</span>
            </div>
          ))}
          <p style={{ margin: 0, padding: "10px 14px", borderTop: "0.5px solid var(--color-border-tertiary)", fontSize: 12, color: "var(--color-text-tertiary)" }}>
            Add goals from each student's Goals page after finishing.
          </p>
        </div>
      )}
    </div>
  );
}
