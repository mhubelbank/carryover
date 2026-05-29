import { useCallback, useState } from "react";
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

  const clearStudentTarget = useCallback(() => setStudentTarget(null), []);
  const openStudent = useCallback((id: string, view: "detail" | "goals" = "detail") => {
    setStudentTarget({ id, view });
    setPage("students");
  }, []);
  const clearOpenTeacher = useCallback(() => setOpenTeacherId(null), []);
  const openTeacher = useCallback((id: string) => {
    setOpenTeacherId(id);
    setPage("teachers");
  }, []);
  const clearGenerateTarget = useCallback(() => setGenerateTarget(null), []);
  const openGenerate = useCallback(
    (date: string, teacherId: string, studentIds: string[]) => {
      setGenerateTarget({ date, teacherId, studentIds });
      setPage("generate");
    },
    [],
  );

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
      return (
        <Students
          onNavigate={setPage}
          target={studentTarget}
          onTargetConsumed={clearStudentTarget}
        />
      );
    case "teachers":
      return (
        <Teachers
          onNavigate={setPage}
          openTeacherId={openTeacherId}
          onOpenConsumed={clearOpenTeacher}
          onOpenStudent={openStudent}
        />
      );
    case "schedule":
      return <Schedule onNavigate={setPage} />;
    case "generate":
      return (
        <Generate
          onNavigate={setPage}
          target={generateTarget}
          onTargetConsumed={clearGenerateTarget}
        />
      );
    default:
      return (
        <Today
          onNavigate={setPage}
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
