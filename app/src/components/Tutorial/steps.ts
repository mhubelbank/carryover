import type { NavPage } from "../Nav";

// One coachmark in the guided tour. `target` is the `data-tour="…"` attribute of
// the element to spotlight (omit for a centered intro card). `page`, if set, is
// navigated to before the step shows — currently every step anchors to the always-
// present Nav bar, so none need it, but the overlay supports it.
export interface TourStep {
  key: string;
  page?: NavPage;
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  // --- Overview: a quick left-to-right pass over the nav bar (stays on Today) ---
  {
    key: "intro",
    page: "today",
    title: "Welcome to Carryover",
    body: "Let's take a quick tour. First the lay of the land, then we'll step into each part. You can skip anytime and replay it later from Settings.",
  },
  {
    key: "ov-today",
    page: "today",
    target: "nav-today",
    title: "Today",
    body: "Your daily home base — the students you're seeing today, ready to write up.",
  },
  {
    key: "ov-generate",
    page: "today",
    target: "nav-generate",
    title: "Generate",
    body: "Write notes for any session with the assistant.",
  },
  {
    key: "ov-schedule",
    page: "today",
    target: "nav-schedule",
    title: "Schedule",
    body: "Your weekly plan of who you see and when.",
  },
  {
    key: "ov-people",
    page: "today",
    target: "nav-students",
    title: "People",
    body: "Your students and teachers.",
  },
  {
    key: "ov-settings",
    page: "today",
    target: "nav-settings",
    title: "Settings",
    body: "Manage your terms, update activities, change the AI model, and export your data.",
  },
  // --- Deep dive: into each page, left to right ---
  {
    key: "deep-today",
    page: "today",
    target: "today-date",
    title: "Today, in depth",
    body: "Use the arrows on the right to move between days. You can view the students you've planned to see, and click a button to generate notes for that session. You'll also see notifications here for events, like IEP reviews and birthdays.",
  },
  {
    key: "deep-generate",
    page: "generate",
    target: "generate-picker",
    title: "Generating a note",
    body: "Pick the date, teacher, and time slot to load a session. Then capture what happened — activities, trials, prompting — and generate a clean clinical note you can refine.",
  },
  {
    key: "deep-schedule",
    page: "schedule",
    target: "schedule-mode",
    title: "Your schedule",
    body: "Keep a 'usual' weekly template, or switch to a specific week to customize just that one. This view syncs to Today and Generate, so if you mark a student as absent in one view, it'll show up in all three places.",
  },
  {
    key: "deep-people",
    page: "students",
    target: "people-toggle",
    title: "Students & teachers",
    body: "Toggle between the tables of Students and Teachers. Search, add, and archive from the controls beside each table.",
  },
  {
    key: "deep-settings-term",
    page: "settings",
    target: "settings-term",
    title: "Term (Settings)",
    body: "Manage your terms here. '+ Start a new term' opens a setup wizard that carries over your caseload and schedule, so you're never starting from scratch.",
  },
  {
    key: "deep-settings-catalogs",
    page: "settings",
    target: "settings-catalogs",
    title: "Catalogs (Settings)",
    body: "Your activities, news-day roles, and student fields — the reusable building blocks the note generator draws on.",
  },
  {
    key: "deep-settings-model",
    page: "settings",
    target: "settings-model",
    title: "Model (Settings)",
    body: "Choose which model writes your notes (Claude or ChatGPT), with rough cost estimates.",
  },
  {
    key: "deep-settings-export",
    page: "settings",
    target: "settings-export",
    title: "Export (Settings)",
    body: "Download your data anytime via an Excel workbook, recent notes text file, or full backup.",
  },
  {
    key: "outro",
    page: "today",
    title: "You're all set",
    body: "That's the tour! Replay it anytime from Settings → Tutorial.",
  },
];
