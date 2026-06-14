import type { NavPage } from "../Nav";

// One coachmark in the guided tour. `target` is the `data-tour="…"` attribute of
// the element to spotlight (omit for a centered intro card). `page`, if set, is
// navigated to before the step shows — currently every step anchors to the always-
// present Nav bar, so none need it, but the overlay supports it.
export interface TourStep {
  key: string;
  page?: NavPage;
  // Open the first student's detail/goals sub-view (instead of just a top tab).
  open?: "detail" | "goals";
  target?: string;
  title: string;
  // Right-aligned gray label showing which page the step lives on (deep-dive steps
  // only — overview steps already use the page name as their title).
  pageLabel?: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  // --- Overview: a quick left-to-right pass over the nav bar (stays on Today) ---
  {
    key: "intro",
    page: "today",
    title: "Welcome to Carryover",
    body: "Let's take a quick tour. First an overview, then we'll step into each tab. You can skip anytime and replay it later from Settings.",
  },
  {
    key: "ov-today",
    page: "today",
    target: "nav-today",
    title: "Today",
    body: "Your daily home base. Shows the students you're seeing today, ready to write up.",
  },
  {
    key: "ov-generate",
    page: "today",
    target: "nav-generate",
    title: "Generate",
    body: "Write notes with the assistant -- one session at a time, or a whole day in one batch.",
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
    body: "Your tables of students and teachers.",
  },
  {
    key: "ov-settings",
    page: "today",
    target: "nav-settings",
    title: "Settings",
    body: "Manage your terms, update activities, and change the AI model.",
  },
  // --- Deep dive: into each page, left to right ---
  {
    key: "deep-today",
    page: "today",
    target: "today-date",
    title: "Today, in depth",
    pageLabel: "Today",
    body: "Use the arrows on the right to move between days. You can view the students you've planned to see, and write up any session. You'll also see notifications here for events, like IEP reviews and birthdays.",
  },
  {
    key: "deep-today-batch",
    page: "today",
    target: "today-batch",
    title: "Write a whole day at once",
    pageLabel: "Today",
    body: "The first of two ways to write clinical notes: batch the day's sessions, then generate them together in one pass. This is the fastest and cheapest way to clear a day's sessions. Your inputs auto-save, so you can edit the form throughout the day.",
  },
  {
    key: "deep-generate",
    page: "generate",
    target: "generate-picker",
    title: "Write one session",
    pageLabel: "Generate",
    body: "The second way: one session at a time, handy for a single catch-up note. Pick the date, teacher, and time slot to load a session. Capture what happened in the form, then generate a clean clinical note you can refine.",
  },
  {
    key: "deep-schedule",
    page: "schedule",
    target: "schedule-mode",
    title: "Your schedule",
    pageLabel: "Schedule",
    body: "Keep a 'usual' weekly template, or switch to a specific week to customize just that one. This view syncs to Today and Generate, so if you mark a student as absent in one view, it'll show up in all three places.",
  },
  {
    key: "deep-people",
    page: "students",
    target: "people-toggle",
    title: "Students & teachers",
    pageLabel: "People",
    body: "Toggle between the tables of Students and Teachers. Search, add, and archive from the controls beside each table.",
  },
  {
    key: "deep-student",
    page: "students",
    open: "detail",
    target: "student-profile",
    title: "Student details",
    pageLabel: "People",
    body: "Open any student for their profile, mandate, and IEP dates — plus a Progress view that charts their trial data over time.",
  },
  {
    key: "deep-goals",
    page: "students",
    open: "goals",
    target: "student-goals",
    title: "Goals tracking",
    pageLabel: "People",
    body: "Each student's long- and short-term goals live here. The trials you log while generating notes roll up into their progress automatically.",
  },
  {
    key: "deep-settings-term",
    page: "settings",
    target: "settings-term",
    title: "Term",
    pageLabel: "Settings",
    body: "From the Settings page, you can manage your school terms. '+ Start a new term' opens a setup wizard that carries over your caseload, so you're never starting from scratch.",
  },
  {
    key: "deep-settings-catalogs",
    page: "settings",
    target: "settings-catalogs",
    title: "Catalogs",
    pageLabel: "Settings",
    body: "Your activities, news-day roles, and student fields — the reusable building blocks the note generator draws on.",
  },
  {
    key: "deep-settings-model",
    page: "settings",
    target: "settings-model",
    title: "Model",
    pageLabel: "Settings",
    body: "Choose which model writes your notes (Claude or ChatGPT), with rough cost estimates.",
  },
  {
    key: "deep-settings-export",
    page: "settings",
    target: "settings-export",
    title: "Export",
    pageLabel: "Settings",
    body: "Download your data anytime via an Excel workbook, recent notes text file, or full backup.",
  },
  {
    key: "outro",
    page: "today",
    title: "You're all set",
    body: "That's the tour! Replay it anytime from Settings → Tutorial.",
  },
];
