// A one-shot request to scroll to a particular Settings section after navigating
// there (e.g. the Today token-renewal banner jumping straight to Keys). Module-
// level so it survives the page remount, consumed once on the Settings mount.
let pending: string | null = null;

export function requestSettingsSection(section: string): void {
  pending = section;
}

export function consumeSettingsSection(): string | null {
  const s = pending;
  pending = null;
  return s;
}
