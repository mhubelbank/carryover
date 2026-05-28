import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";

interface Props {
  onNavigate: (page: NavPage) => void;
}

// Empty state: the repo has no data/term.json yet. The real setup wizard is
// Slice 6; this is the placeholder it will replace.
export function FirstTermSetup({ onNavigate }: Props) {
  return (
    <div className="shell">
      <Nav current="today" onNavigate={onNavigate} />
      <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
        <div style={{ color: "var(--color-text-tertiary)", marginBottom: 14 }}>
          <Icon name="calendar-plus" size={32} />
        </div>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Set up your first term</h1>
        <p
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 14,
            maxWidth: 440,
            margin: "0 auto 20px",
            lineHeight: 1.5,
          }}
        >
          There's no term in your data yet. Create a school year or summer term to
          start adding students, goals, and a schedule.
        </p>
        <button className="button button--primary" disabled>
          <Icon name="plus" size={14} />
          Prepare new term
        </button>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--color-text-tertiary)" }}>
          The setup wizard arrives in a later slice.
        </p>
      </div>
    </div>
  );
}
