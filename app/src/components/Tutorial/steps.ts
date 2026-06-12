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
  {
    key: "intro",
    page: "today",
    title: "Welcome to Carryover",
    body: "Here's a quick tour of where everything lives. You can skip anytime, and replay it later from Settings.",
  },
  {
    key: "today",
    page: "today",
    target: "nav-today",
    title: "Today",
    body: "Your home base — view the students you're seeing today and jump straight into their notes.",
  },
  {
    key: "generate",
    page: "generate",
    target: "nav-generate",
    title: "Generate notes",
    body: "Write session notes here: pick a student, capture what happened, and the assistant drafts a clean clinical note you can refine.",
  },
  {
    key: "people",
    page: "students",
    target: "nav-students",
    title: "People",
    body: "Your students and teacher tables live here.",
  },
  {
    key: "schedule",
    page: "schedule",
    target: "nav-schedule",
    title: "Schedule",
    body: "Your weekly schedule — who you see and when. Notes you've generated get checked off here.",
  },
  {
    // No page: the overlay doesn't render on the Settings page (it's a special
    // early-return), so stay on Schedule and just spotlight the gear.
    key: "settings",
    target: "nav-settings",
    title: "Settings",
    body: "Your keys, the AI model, data export, and appearance — and you can replay this tour anytime from here.",
  },
];
