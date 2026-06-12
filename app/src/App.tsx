import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { confirmNavAway } from "./hooks/useUnsavedGuard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TermProvider, useTerm } from "./context/TermContext";
import { TutorialProvider, useTutorial } from "./context/TutorialContext";
import { Banner } from "./components/Banner";
import { ErrorToaster } from "./components/ErrorToaster";
import { TutorialOverlay } from "./components/Tutorial/TutorialOverlay";
import { isTutorialDone, markTutorialDone } from "./clients/tutorial";
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

// State-driven page selection backed by the History API (Tier-1 routing): each
// top-level page maps to a path (/today, /generate, …) so Back/Forward move between
// tabs and a refresh stays put. Students/Teachers keep their own list-vs-detail
// sub-state internally, so detail views are NOT in the URL — Back from a detail
// returns to the previous tab, not the list. Goals are reached per-student.
const NAV_PAGES: NavPage[] = ["today", "generate", "students", "teachers", "activities", "schedule", "settings"];

// First path segment → page, if it's a known page (else null).
function pageFromPath(path: string): NavPage | null {
  const seg = path.replace(/^\/+/, "").split("/")[0] ?? "";
  return (NAV_PAGES as string[]).includes(seg) ? (seg as NavPage) : null;
}
const pathForPage = (p: NavPage): string => `/${p}`;

function loadStoredPage(): NavPage {
  const v = storage.get(StorageKeys.page);
  return v && (NAV_PAGES as string[]).includes(v) ? (v as NavPage) : "today";
}
// Prefer the URL on load (deep link / refresh), falling back to the last stored tab.
function initialPage(): NavPage {
  return pageFromPath(window.location.pathname) ?? loadStoredPage();
}

function Pages() {
  const [page, setPage] = useState<NavPage>(initialPage);
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
  const { active: tourActive, start: startTour, stop: stopTour } = useTutorial();

  // Auto-start the guided tour once, the first time real data is loaded — so a
  // brand-new user sees it after the new-term wizard (not over an empty app), and
  // a demo/seeded user sees it immediately.
  const tourAutoStarted = useRef(false);
  useEffect(() => {
    if (tourAutoStarted.current) return;
    if (state.status === "ready" && !isTutorialDone()) {
      tourAutoStarted.current = true;
      startTour();
    }
  }, [state.status, startTour]);

  // Reset scroll to top when the page changes — it's a single document, so the
  // window scroll otherwise carries over between screens.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page, newTerm]);

  // Remember the current tab so a refresh lands on the same page.
  useEffect(() => {
    storage.set(StorageKeys.page, page);
  }, [page]);

  // Track the live page for the popstate handler (registered once, so it would
  // otherwise capture a stale `page`).
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // Browser Back/Forward → page. Registered once on mount; also normalizes the URL
  // and seeds history state so the first Back has somewhere to return to.
  useEffect(() => {
    window.history.replaceState({ page: pageRef.current }, "", pathForPage(pageRef.current));
    const onPop = () => {
      const target = pageFromPath(window.location.pathname) ?? "today";
      if (target === pageRef.current) return;
      if (confirmNavAway()) {
        setPage(target);
      } else {
        // User kept their unsaved work — undo the Back by restoring the URL.
        window.history.pushState({ page: pageRef.current }, "", pathForPage(pageRef.current));
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Switch page and push a history entry so Back returns here. The guard against a
  // matching path avoids stacking duplicate entries (e.g. opening a second student
  // while already on /students).
  const pushPage = useCallback((p: NavPage) => {
    setPage(p);
    if (pageFromPath(window.location.pathname) !== p) {
      window.history.pushState({ page: p }, "", pathForPage(p));
    }
  }, []);

  // Navigation used by the tutorial as it tabs through pages — replaceState rather
  // than pushState so stepping the tour doesn't litter the Back history.
  const tourNavigate = useCallback((p: NavPage) => {
    setPage(p);
    window.history.replaceState({ page: p }, "", pathForPage(p));
  }, []);

  // All navigation goes through `nav`/`pushPage` so an editor with unsaved changes
  // can prompt before the page switches out from under it (the SaveBar's mount
  // state drives the guard; see useUnsavedGuard).
  const nav = useCallback(
    (p: NavPage) => {
      if (p === page) return; // re-clicking the current tab shouldn't prompt
      if (confirmNavAway()) pushPage(p);
    },
    [page, pushPage],
  );

  const clearStudentTarget = useCallback(() => setStudentTarget(null), []);
  const openStudent = useCallback(
    (id: string, view: "detail" | "goals" | "iep-review" = "detail") => {
      if (!confirmNavAway()) return;
      setStudentTarget({ id, view });
      pushPage("students");
    },
    [pushPage],
  );
  const clearOpenTeacher = useCallback(() => setOpenTeacherId(null), []);
  const openTeacher = useCallback(
    (id: string) => {
      if (!confirmNavAway()) return;
      setOpenTeacherId(id);
      pushPage("teachers");
    },
    [pushPage],
  );
  const clearGenerateTarget = useCallback(() => setGenerateTarget(null), []);
  const openGenerate = useCallback(
    (date: string, teacherId: string, studentIds: string[], timeSlot?: string) => {
      if (!confirmNavAway()) return;
      setGenerateTarget({ date, teacherId, studentIds, timeSlot });
      pushPage("generate");
    },
    [pushPage],
  );

  // Rendered alongside the active page so the guided tour can spotlight elements on
  // any page (including Settings, which is a special early return below).
  const overlay = tourActive && (
    <TutorialOverlay
      currentPage={page}
      nav={tourNavigate}
      onFinish={() => {
        stopTour();
        markTutorialDone();
      }}
    />
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
    return (
      <>
        <Settings onNavigate={nav} onStartNewTerm={() => setNewTerm(true)} />
        {overlay}
      </>
    );

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

  let content: ReactNode;
  switch (page) {
    case "students":
      content = (
        <Students onNavigate={nav} target={studentTarget} onTargetConsumed={clearStudentTarget} />
      );
      break;
    case "teachers":
      content = (
        <Teachers
          onNavigate={nav}
          openTeacherId={openTeacherId}
          onOpenConsumed={clearOpenTeacher}
          onOpenStudent={openStudent}
        />
      );
      break;
    case "activities":
      content = <Activities onNavigate={nav} onOpenStudent={openStudent} />;
      break;
    case "schedule":
      content = <Schedule onNavigate={nav} onOpenStudent={openStudent} />;
      break;
    case "generate":
      content = (
        <Generate
          onNavigate={nav}
          target={generateTarget}
          onTargetConsumed={clearGenerateTarget}
          onReviewIep={(id) => openStudent(id, "iep-review")}
        />
      );
      break;
    default:
      content = (
        <Today
          onNavigate={nav}
          onOpenStudent={openStudent}
          onOpenTeacher={openTeacher}
          onGenerate={openGenerate}
          onStartNewTerm={() => setNewTerm(true)}
        />
      );
  }

  return (
    <>
      {content}
      {overlay}
    </>
  );
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
      <TutorialProvider>
        <Router />
        <ErrorToaster />
      </TutorialProvider>
    </AuthProvider>
  );
}
