import { Icon } from "./Icon";

export type NavPage = "today" | "generate" | "students" | "goals" | "schedule" | "settings";

interface NavProps {
  current: NavPage;
  onNavigate: (page: NavPage) => void;
}

const TABS: Array<{ id: Exclude<NavPage, "settings">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "generate", label: "Generate notes" },
  { id: "students", label: "Students" },
  { id: "goals", label: "Goals" },
  { id: "schedule", label: "Schedule" },
];

export function Nav({ current, onNavigate }: NavProps) {
  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "12px 0 20px 0",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
        marginBottom: "1.5rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="notebook" size={18} />
        <span style={{ fontWeight: 500, fontSize: 15 }}>SESIS</span>
      </div>
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {TABS.map((tab) => {
          const active = tab.id === current;
          return (
            <button
              key={tab.id}
              className="button button--ghost"
              onClick={() => onNavigate(tab.id)}
              style={{
                fontSize: 14,
                padding: "6px 12px",
                background: active ? "var(--color-background-secondary)" : "transparent",
                color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: active ? 500 : 400,
                border: "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <button
        className="button button--ghost"
        onClick={() => onNavigate("settings")}
        title="Settings"
        style={{
          padding: 8,
          background:
            current === "settings" ? "var(--color-background-secondary)" : "transparent",
        }}
      >
        <Icon name="settings" size={18} label="Settings" />
      </button>
    </nav>
  );
}
