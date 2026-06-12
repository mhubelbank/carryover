import { useCallback, useEffect, useState } from "react";
import { confirmNavAway } from "./hooks/useUnsavedGuard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TermProvider, useTerm } from "./context/TermContext";
import { Banner } from "./components/Banner";
import { ErrorToaster } from "./components/ErrorToaster";
import { Nav, type NavPage } from "./components/Nav";
import { storage, StorageKeys } from "./clients/storage";
import { Welcome } from "./pages/Welcome";
import { Settings } from "./pages/Settings";
import { Today } from "./pages/Today";
import { Students } from "./pages/Students";
import { Teachers } from "./pages/Teachers";
import { Activities } from "./pages/Activities";
import { Schedule } from "./pages/Schedule";
import { Generate } from "./pages/Generate";
import { NewTermWizard } from "./pages/NewTermWizard";

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
const NAV_PAGES: NavPage[] = ["today", "generate", "students", "teachers", "activities", "schedule", "settings"];
function loadStoredPage(): NavPage {
  const v = storage.get(StorageKeys.page);
  return v && (NAV_PAGES as string[]).includes(v) ? (v as NavPage) : "today";
}

function Pages() {
  const [page, setPage] = useState<NavPage>(loadStoredPage);
  const [studentTarget, setStudentTarget] = useState<
    { id: string; view: "detail" | "goals" | "iep-review" } | null
  >(null);
  const [openTeacherId, setOpenTeacherId] = useState<string | null>(null);
  const [generateTarget, setGenerateTarget] = useState<
    { date: string; teacherId: string; studentIds: string[]; timeSlot?: string } | null
  >(null);
  // When true, the new-term wizard is open over the normal app (launched from
  // Settings with existing data). The empty/first-run case renders it directly.
  const [newTerm, setNewTerm] = useState(false);
  const { state } = useTerm();

  // Reset scroll to top when the page changes — it's a single document, so the
  // window scroll otherwise carries over between screens.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, newTerm]);

  // Remember the current tab so a refresh lands on the same page.
  useEffect(() => {
    storage.set(StorageKeys.page, page);
  }, [page]);

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
  const openStudent = useCallback(
    (id: string, view: "detail" | "goals" | "iep-review" = "detail") => {
      if (!confirmNavAway()) return;
      setStudentTarget({ id, view });
      setPage("students");
    },
    [],
  );
  const clearOpenTeacher = useCallback(() => setOpenTeacherId(null), []);
  const openTeacher = useCallback((id: string) => {
    if (!confirmNavAway()) return;
    setOpenTeacherId(id);
    setPage("teachers");
  }, []);
  const clearGenerateTarget = useCallback(() => setGenerateTarget(null), []);
  const openGenerate = useCallback(
    (date: string, teacherId: string, studentIds: string[], timeSlot?: string) => {
      if (!confirmNavAway()) return;
      setGenerateTarget({ date, teacherId, studentIds, timeSlot });
      setPage("generate");
    },
    [],
  );

  // The new-term wizard takes over the whole view when open (checked before the
  // page routes, including Settings, which is where it's launched from).
  if (newTerm && state.status === "ready")
    return (
      <NewTermWizard
        onNavigate={(p) => {
          setNewTerm(false);
          nav(p);
        }}
        onClose={() => setNewTerm(false)}
      />
    );

  // Settings is reachable regardless of how data loading went.
  if (page === "settings")
    return <Settings onNavigate={nav} onStartNewTerm={() => setNewTerm(true)} />;

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
  if (state.status === "empty") return <NewTermWizard onNavigate={nav} />;

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
      return <Activities onNavigate={nav} onOpenStudent={openStudent} />;
    case "schedule":
      return <Schedule onNavigate={nav} onOpenStudent={openStudent} />;
    case "generate":
      return (
        <Generate
          onNavigate={nav}
          target={generateTarget}
          onTargetConsumed={clearGenerateTarget}
          onReviewIep={(id) => openStudent(id, "iep-review")}
        />
      );
    default:
      return (
        <Today
          onNavigate={nav}
          onOpenStudent={openStudent}
          onOpenTeacher={openTeacher}
          onGenerate={openGenerate}
          onStartNewTerm={() => setNewTerm(true)}
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
      <ErrorToaster />
    </AuthProvider>
  );
}
