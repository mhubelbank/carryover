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
    body: "Where you write session notes with the assistant.",
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
    body: "Keys, the AI model, data export, and appearance.",
  },
  // --- Deep dive: into each page, left to right ---
  {
    key: "deep-today",
    page: "today",
    target: "today-date",
    title: "Today, in depth",
    body: "This is the day you're viewing — use the arrows to move between days. Each student you're seeing is listed below, with a button to start their note.",
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
    body: "Keep a 'usual' weekly template, or switch to a specific week to customize just that one. Notes you've generated get checked off here.",
  },
  {
    key: "deep-people",
    page: "students",
    target: "people-toggle",
    title: "Students & teachers",
    body: "Toggle between Students and Teachers. Search, add, and archive from the controls beside each table.",
  },
  {
    key: "outro",
    page: "students",
    title: "You're all set",
    body: "That's the tour! Replay it anytime from Settings → Tutorial.",
  },
];
