import { useEffect } from "react";

// Tracks how many "unsaved changes" bars are currently mounted. Each editor
// renders its SaveBar only while dirty, so a mounted SaveBar == unsaved work.
let mountedBars = 0;

// Call from a component that is mounted exactly when there are unsaved changes
// (i.e. a SaveBar). Warns the browser on refresh/close/navigate-away, and keeps
// the shared counter so in-app navigation can prompt too.
export function useUnsavedGuard(): void {
  useEffect(() => {
    mountedBars++;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // Chrome requires returnValue to be set.
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      mountedBars--;
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
}

// True when it's safe to navigate away — nothing unsaved, or the user confirmed
// discarding. Call before an in-app page switch.
export function confirmNavAway(): boolean {
  if (mountedBars === 0) return true;
  return window.confirm("You have unsaved changes that will be lost. Leave anyway?");
}
