import { Nav, type NavPage } from "../components/Nav";
import { Banner } from "../components/Banner";

interface TodayProps {
  onNavigate: (page: NavPage) => void;
}

export function Today({ onNavigate }: TodayProps) {
  return (
    <div className="shell">
      <Nav current="today" onNavigate={onNavigate} />

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Today</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        Your daily landing page will go here.
      </p>

      <Banner variant="info" icon="info-circle">
        Keys saved. Next slice will load your roster and show today's sessions.
      </Banner>
    </div>
  );
}
