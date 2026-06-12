import { startOfDay, toISODate } from "./dates";

// GitHub fine-grained tokens max out around a year, so the access token needs a
// yearly renewal. The reminder fires on/after June 1 each year (start of summer
// term setup) until a fresh token is saved.
export function renewalCutoff(year: number): string {
  return `${year}-06-01`;
}

// True when it's on/after this year's June 1 and the GitHub token hasn't been
// (re)saved since that cutoff — i.e. it's time for the annual renewal. ISO date
// strings (YYYY-MM-DD) compare correctly with `<`. `savedOn` null = unknown when
// the token was last set, so once past the cutoff we prompt.
export function isTokenRenewalDue(savedOn: string | null, today: Date = new Date()): boolean {
  const start = startOfDay(today);
  const todayISO = toISODate(start);
  const cutoff = renewalCutoff(start.getFullYear());
  if (todayISO < cutoff) return false;
  return !savedOn || savedOn < cutoff;
}
