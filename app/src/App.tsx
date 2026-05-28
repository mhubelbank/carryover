import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TermProvider, useTerm } from "./context/TermContext";
import { Banner } from "./components/Banner";
import { Nav, type NavPage } from "./components/Nav";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import { Students } from "./pages/Students";
import { Teachers } from "./pages/Teachers";
import { Schedule } from "./pages/Schedule";
import { FirstTermSetup } from "./pages/FirstTermSetup";

function Router() {
  const { keys } = useAuth();
  if (!keys) return <Welcome />;
  return (
    <TermProvider>
      <Pages />
    </TermProvider>
  );
}

// State-driven page selection (no router yet). Students/Teachers keep their own
// list-vs-detail sub-state internally, so the top-level route stays a flat tab.
// Goals are reached per-student from within Students, not as a top-level tab.
function Pages() {
  const [page, setPage] = useState<NavPage>("today");
  const { state } = useTerm();

  // Settings is reachable regardless of how data loading went.
  if (page === "settings") return <Settings onNavigate={setPage} />;

  if (state.status === "loading") {
    return <StatusScreen page={page} onNavigate={setPage} variant="info" message="Loading your data…" />;
  }
  if (state.status === "error") {
    return (
      <StatusScreen
        page={page}
        onNavigate={setPage}
        variant="danger"
        message={`Couldn't load your data: ${state.message}`}
      />
    );
  }
  if (state.status === "empty") return <FirstTermSetup onNavigate={setPage} />;

  switch (page) {
    case "students":
      return <Students onNavigate={setPage} />;
    case "teachers":
      return <Teachers onNavigate={setPage} />;
    case "schedule":
      return <Schedule onNavigate={setPage} />;
    case "generate":
      return <GeneratePlaceholder onNavigate={setPage} />;
    default:
      return <Today onNavigate={setPage} />;
  }
}

function StatusScreen({
  page,
  onNavigate,
  variant,
  message,
}: {
  page: NavPage;
  onNavigate: (page: NavPage) => void;
  variant: "info" | "danger";
  message: string;
}) {
  return (
    <div className="shell">
      <Nav current={page} onNavigate={onNavigate} />
      <Banner variant={variant}>{message}</Banner>
    </div>
  );
}

function GeneratePlaceholder({ onNavigate }: { onNavigate: (page: NavPage) => void }) {
  return (
    <div className="shell">
      <Nav current="generate" onNavigate={onNavigate} />
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>Generate notes</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        Create SESIS notes for a session.
      </p>
      <Banner variant="info">Note generation arrives in a later slice.</Banner>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
