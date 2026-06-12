import type { NavPage } from "./Nav";

// Segmented Students | Teachers switcher that heads the People view. Both sit under
// one "People" nav tab; this toggle flips between them by navigating to the
// underlying page (so the unsaved-changes guard still runs on the switch).
export function PeopleToggle({
  current,
  onNavigate,
}: {
  current: "students" | "teachers";
  onNavigate: (page: NavPage) => void;
}) {
  const options: { id: "students" | "teachers"; label: string }[] = [
    { id: "students", label: "Students" },
    { id: "teachers", label: "Teachers" },
  ];
  return (
    <div
      data-tour="people-toggle"
      role="group"
      aria-label="People"
      style={{
        display: "inline-flex",
        border: "0.5px solid var(--color-border-secondary)",
        borderRadius: "var(--border-radius-md)",
        overflow: "hidden",
      }}
    >
      {options.map((o, i) => {
        const on = o.id === current;
        return (
          <button
            key={o.id}
            className="button button--small"
            onClick={() => {
              if (!on) onNavigate(o.id);
            }}
            style={{
              border: "none",
              borderRadius: 0,
              borderLeft: i > 0 ? "0.5px solid var(--color-border-secondary)" : "none",
              background: on ? "var(--color-background-secondary)" : "transparent",
              color: on ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: on ? 500 : 400,
              fontSize: 15,
              padding: "6px 14px",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
