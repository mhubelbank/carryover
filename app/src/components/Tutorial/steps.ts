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
    title: "Welcome to Carryover",
    body: "Here's a quick tour of where everything lives. You can skip anytime, and replay it later from Settings.",
  },
  {
    key: "today",
    target: "nav-today",
    title: "Today",
    body: "Your home base — see who you're seeing today and jump straight into their notes.",
  },
  {
    key: "generate",
    target: "nav-generate",
    title: "Generate notes",
    body: "Write session notes here: pick a student, capture what happened, and the assistant drafts a clean clinical note you can refine.",
  },
  {
    key: "people",
    target: "nav-students",
    title: "People",
    body: "Your students and teachers live here. Switch between them with the Students / Teachers toggle.",
  },
  {
    key: "schedule",
    target: "nav-schedule",
    title: "Schedule",
    body: "Your weekly schedule — who you see and when. Notes you've generated get checked off here.",
  },
  {
    key: "settings",
    target: "nav-settings",
    title: "Settings",
    body: "Your keys, the AI model, data export, and appearance — and you can replay this tour anytime from here.",
  },
];
