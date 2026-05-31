import { useState } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useTerm } from "../context/TermContext";
import { termLabel, type TermType } from "../domain/term";

interface Props {
  onNavigate: (page: NavPage) => void;
}

const STEPS = ["Year", "Teachers", "Students", "Schedule", "Goals"] as const;

// The new-term setup wizard (replaces the empty-state placeholder). Step 1
// (Year) creates the term; steps 2–5 carry forward / edit teachers, students,
// schedule, and goals (built out incrementally — placeholders for now).
export function NewTermWizard({ onNavigate }: Props) {
  const { saveTerm, reload } = useTerm();
  const [step, setStep] = useState(1);
  const [termType, setTermType] = useState<TermType>("school-year");
  const [firstDay, setFirstDay] = useState("");
  const [lastDay, setLastDay] = useState("");
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
      await saveTerm({ termType, firstDay, lastDay, label: termLabel(termType, firstDay, lastDay) });
      // Term now exists → the app reloads into its normal (ready) state.
      reload();
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
        ) : (
          <PlaceholderStep name={STEPS[step - 1]!} />
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

function PlaceholderStep({ name }: { name: string }) {
  return (
    <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--color-text-tertiary)" }}>
      <p style={{ fontSize: 14, margin: 0 }}>
        {name} setup is coming next. For now, continue to create the term — you can manage{" "}
        {name.toLowerCase()} from their tab afterward.
      </p>
    </div>
  );
}
