import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import type { NavPage } from "./components/Nav";

// We're using state-driven page selection rather than a router for slice 1.
// When we add deep links (e.g., direct URL to a student's IEP review), we'll
// pull in a router. Until then, this is the simplest thing that works.
function Router() {
  const { keys } = useAuth();
  const [page, setPage] = useState<NavPage>("today");

  if (!keys) return <Welcome />;
  if (page === "settings") return <Settings onNavigate={setPage} />;

  // All other pages fall through to Today for slice 1. Each will become its
  // own page component as the relevant slices land.
  return <Today onNavigate={setPage} />;
}

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
