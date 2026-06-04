// Light/dark theme. Default "system" follows the OS (and live-updates when it
// flips); "light"/"dark" pin it. The effective theme is written to
// document.documentElement.dataset.theme, which tokens.css keys off of.
import { storage, StorageKeys } from "./storage";

export type ThemePref = "system" | "light" | "dark";

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function effective(pref: ThemePref): "light" | "dark" {
  return pref === "system" ? (prefersDark() ? "dark" : "light") : pref;
}

let current: ThemePref = "system";
let mql: MediaQueryList | null = null;

function apply(): void {
  document.documentElement.dataset.theme = effective(current);
}

export function loadThemePref(): ThemePref {
  const v = storage.get(StorageKeys.theme);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function setThemePref(pref: ThemePref): void {
  current = pref;
  storage.set(StorageKeys.theme, pref);
  apply();
}

// Call once at startup. Applies the saved preference and keeps "system" in sync
// with live OS changes.
export function initTheme(): void {
  current = loadThemePref();
  apply();
  if (!mql) {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener("change", () => {
      if (current === "system") apply();
    });
  }
}
