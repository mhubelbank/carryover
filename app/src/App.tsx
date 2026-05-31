import { useCallback, useState } from "react";
import { confirmNavAway } from "./hooks/useUnsavedGuard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TermProvider, useTerm } from "./context/TermContext";
import { Banner } from "./components/Banner";
import { Nav, type NavPage } from "./components/Nav";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import { Students } from "./pages/Students";
import { Teachers } from "./pages/Teachers";
import { Activities } from "./pages/Activities";
import { Schedule } from "./pages/Schedule";
import { Generate } from "./pages/Generate";
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
  const [studentTarget, setStudentTarget] = useState<
    { id: string; view: "detail" | "goals" } | null
  >(null);
  const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);
  const [generateTarget, setGenerateTarget] = useState<
    { date: string; teacherId: string; studentIds: string[] } | null
  >(null);
  const { state } = useTerm();

  // All navigation goes through `nav` so an editor with unsaved changes can
  // prompt before the page switches out from under it (the SaveBar's mount
  // state drives the guard; see useUnsavedGuard).
  const nav = useCallback(
    (p: NavPage) => {
      if (p === page) return; // re-clicking the current tab shouldn't prompt
      if (confirmNavAway()) setPage(p);
    },
    [page],
  );

  const clearStudentTarget = useCallback(() => setStudentTarget(null), []);
  const openStudent = useCallback((id: string, view: "detail" | "goals" = "detail") => {
    if (!confirmNavAway()) return;
    setStudentTarget({ id, view });
    setPage("students");
  }, []);
  const clearOpenTeacher = useCallback(() => setOpenTeacherId(null), []);
  const openTeacher = useCallback((id: string) => {
    if (!confirmNavAway()) return;
    setOpenTeacherId(id);
    setPage("teachers");
  }, []);
  const clearGenerateTarget = useCallback(() => setGenerateTarget(null), []);
  const openGenerate = useCallback(
    (date: string, teacherId: string, studentIds: string[]) => {
      if (!confirmNavAway()) return;
      setGenerateTarget({ date, teacherId, studentIds });
      setPage("generate");
    },
    [],
  );

  // Settings is reachable regardless of how data loading went.
  if (page === "settings") return <Settings onNavigate={nav} />;

  if (state.status === "loading") {
    return <StatusScreen page={page} onNavigate={nav} variant="info" message="Loading your data…" />;
  }
  if (state.status === "error") {
    return (
      <StatusScreen
        page={page}
        onNavigate={nav}
        variant="danger"
        message={`Couldn't load your data: ${state.message}`}
      />
    );
  }
  if (state.status === "empty") return <FirstTermSetup onNavigate={nav} />;

  switch (page) {
    case "students":
      return (
        <Students
          onNavigate={nav}
          target={studentTarget}
          onTargetConsumed={clearStudentTarget}
        />
      );
    case "teachers":
      return (
        <Teachers
          onNavigate={nav}
          openTeacherId={openTeacherId}
          onOpenConsumed={clearOpenTeacher}
          onOpenStudent={openStudent}
        />
      );
    case "activities":
      return <Activities onNavigate={nav} />;
    case "schedule":
      return <Schedule onNavigate={nav} onOpenStudent={openStudent} />;
    case "generate":
      return (
        <Generate
          onNavigate={nav}
          target={generateTarget}
          onTargetConsumed={clearGenerateTarget}
        />
      );
    default:
      return (
        <Today
          onNavigate={nav}
          onOpenStudent={openStudent}
          onOpenTeacher={openTeacher}
          onGenerate={openGenerate}
        />
      );
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

export function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
