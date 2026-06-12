// Whether the user has finished or skipped the guided tour. Drives the one-time
// auto-start on first run; the tour can always be replayed from Settings without
// clearing this. Mirrors the get/set pattern in clients/theme.ts.
import { storage, StorageKeys } from "./storage";

export function isTutorialDone(): boolean {
  return storage.get(StorageKeys.tutorialDone) === "1";
}

export function markTutorialDone(): void {
  storage.set(StorageKeys.tutorialDone, "1");
}

export function resetTutorial(): void {
  storage.remove(StorageKeys.tutorialDone);
}
