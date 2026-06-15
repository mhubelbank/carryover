import { Icon } from "./Icon";
import { AppLink } from "./AppLink";
import { pathForPage } from "../routes";

export type NavPage =
  | "today"
  | "generate"
  | "students"
  | "teachers"
  | "activities"
  | "schedule"
  | "settings";

interface NavProps {
  current: NavPage;
  onNavigate: (page: NavPage) => void;
}

// Students and Teachers share one "People" tab (the tab navigates to Students, the
// default; a toggle on the page flips to Teachers). The tab stays highlighted on
// both underlying pages.
const TABS: Array<{ id: Exclude<NavPage, "settings">; label: string }> = [
  { id: "today", label: "Today" },
  { id: "generate", label: "Generate" },
  { id: "schedule", label: "Schedule" },
  { id: "students", label: "People" },
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
        <span style={{ fontWeight: 500, fontSize: 15 }}>Carryover</span>
      </div>
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {TABS.map((tab) => {
          // "People" (the Students tab) stays active on the Teachers page too.
          const active = tab.id === current || (tab.id === "students" && current === "teachers");
          return (
            <AppLink
              key={tab.id}
              href={pathForPage(tab.id)}
              onActivate={() => onNavigate(tab.id)}
              dataTour={`nav-${tab.id}`}
              className="button button--ghost"
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
            </AppLink>
          );
        })}
      </div>
      <AppLink
        href={pathForPage("settings")}
        onActivate={() => onNavigate("settings")}
        dataTour="nav-settings"
        title="Settings"
        className="button button--ghost"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 14,
          padding: "6px 12px",
          border: "none",
          background:
            current === "settings" ? "var(--color-background-secondary)" : "transparent",
          color:
            current === "settings" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
          fontWeight: current === "settings" ? 500 : 400,
        }}
      >
        <Icon name="settings" size={18} />
        Settings
      </AppLink>
    </nav>
  );
}
