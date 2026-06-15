// Client-side error & crash capture. The app is a BYOK single-page app served as
// static assets (no backend), so there is nowhere to *send* a crash report and no
// third party we want student data flowing to. Instead we keep a small local ring
// buffer of recent errors in localStorage, scrubbed of anything secret, and surface
// it in Settings → Diagnostics so the clinician can copy a report when something
// breaks. Nothing here ever leaves the device on its own.
import { storage, StorageKeys } from "./storage";

export interface ErrorReport {
  at: string; // ISO timestamp of the most recent occurrence
  kind: "render" | "error" | "unhandledrejection";
  name: string;
  message: string;
  count: number; // how many times this same message has occurred
  stack?: string;
  componentStack?: string; // React component stack (render crashes only)
  url: string; // pathname only — never the query string
  appVersion: string;
  userAgent: string;
}

const MAX = 5; // keep only the 5 most recent distinct errors

// Where the "Email the report" buttons send to — the person who set the app up.
// Plain mailto (no backend, nothing auto-transmitted): it opens a pre-filled draft
// the clinician sends herself. Change this if support moves to someone else.
export const SUPPORT_EMAIL = "mhubelbank@gmail.com";

// New-error subscribers (the on-screen toast). Kept separate from the stored log so
// the UI can react the instant an error lands instead of only on the next render.
type Listener = (report: ErrorReport) => void;
const listeners = new Set<Listener>();

export function subscribeErrors(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// Redact things that must never sit in a stored report even though the report
// stays on-device: API keys / tokens (Anthropic sk-ant-…, OpenAI sk-…, GitHub
// ghp_/gho_/…, generic Bearer …) and any long opaque secret-looking run. Names and
// note text are out of scope — those already live on this device (note cache,
// roster) and the log is never auto-transmitted; the redaction here is specifically
// to keep credentials out of a report the clinician might paste somewhere.
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[posru]_[A-Za-z0-9]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b[A-Za-z0-9_-]{40,}\b/g, // catch-all for long opaque tokens
];

export function scrubSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

function read(): ErrorReport[] {
  try {
    const raw = storage.get(StorageKeys.errorLog);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ErrorReport[]) : [];
  } catch {
    return [];
  }
}

export function getErrorLog(): ErrorReport[] {
  return read();
}

export function clearErrorLog(): void {
  storage.remove(StorageKeys.errorLog);
}

// Build a scrubbed report and prepend it to the ring buffer. Wrapped so a failure
// in logging can never itself crash the app (or recurse through the handlers).
export function recordError(input: {
  kind: ErrorReport["kind"];
  error: unknown;
  componentStack?: string;
}): void {
  try {
    const err = input.error;
    const name = err instanceof Error ? err.name : typeof err;
    const rawMessage = err instanceof Error ? err.message : String(err);
    const rawStack = err instanceof Error ? err.stack : undefined;
    const report: ErrorReport = {
      at: new Date().toISOString(),
      kind: input.kind,
      name: scrubSecrets(name).slice(0, 200),
      message: scrubSecrets(rawMessage).slice(0, 1000),
      count: 1,
      stack: rawStack ? scrubSecrets(rawStack).slice(0, 4000) : undefined,
      componentStack: input.componentStack
        ? scrubSecrets(input.componentStack).slice(0, 4000)
        : undefined,
      url: typeof location !== "undefined" ? location.pathname : "",
      // `define` rewrites this token to a string literal at build time; the typeof
      // guard keeps it safe anywhere the define isn't applied (e.g. unit tests).
      appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };
    // Dedup on the message: a repeat bumps the existing entry's count and floats it
    // to the top with a fresh timestamp, rather than filling the log with copies.
    const existing = read();
    const dup = existing.findIndex((e) => e.message === report.message);
    let next: ErrorReport[];
    if (dup >= 0) {
      const merged = { ...report, count: (existing[dup]!.count ?? 1) + 1 };
      next = [merged, ...existing.slice(0, dup), ...existing.slice(dup + 1)].slice(0, MAX);
    } else {
      next = [report, ...existing].slice(0, MAX);
    }
    storage.set(StorageKeys.errorLog, JSON.stringify(next));
    const latest = next[0]!;
    listeners.forEach((fn) => {
      try {
        fn(latest);
      } catch {
        // A toast failing must not break logging.
      }
    });
  } catch {
    // Never let diagnostics break the app.
  }
}

// A plain-text dump of the whole log for the "Copy report" button.
export function errorLogText(reports: ErrorReport[]): string {
  if (reports.length === 0) return "No errors recorded.";
  return reports
    .map((r) => {
      const lines = [
        `[${r.at}] ${r.kind}: ${r.name}: ${r.message}${(r.count ?? 1) > 1 ? `  (×${r.count})` : ""}`,
        `  page: ${r.url}  ·  app: ${r.appVersion}`,
        `  ${r.userAgent}`,
      ];
      if (r.stack) lines.push(r.stack.replace(/^/gm, "  "));
      if (r.componentStack) lines.push("  component stack:" + r.componentStack.replace(/^/gm, "  "));
      return lines.join("\n");
    })
    .join("\n\n");
}

// A mailto: link that opens a pre-filled draft to SUPPORT_EMAIL with the report in
// the body. mailto bodies get truncated by some mail clients, so cap the length and
// point at Diagnostics for the full text. Already-scrubbed, so no secrets ride along.
const MAILTO_BODY_LIMIT = 1500;

export function errorMailto(reports: ErrorReport[]): string {
  const subject = "Carryover error report";
  let body = `Hi,\n\nCarryover ran into an error. Details below (sent from the app).\n\n${errorLogText(reports)}`;
  if (body.length > MAILTO_BODY_LIMIT) {
    body =
      body.slice(0, MAILTO_BODY_LIMIT) +
      "\n…(truncated — open Settings → Diagnostics → Copy report for the full text)";
  }
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

let installed = false;

// Register global handlers once. StrictMode mounts effects twice in dev, so this is
// idempotent. Catches uncaught errors and unhandled promise rejections — the React
// error boundary handles render crashes separately.
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", (e) => {
    // Cross-origin scripts (and several Safari cases) null out `e.error` and
    // report only the opaque "Script error." For those, keep whatever source
    // location the ErrorEvent still exposes so the entry is at least traceable;
    // a real same-origin error carries its own stack via `e.error`.
    if (e.error) {
      recordError({ kind: "error", error: e.error });
    } else {
      const where = e.filename ? ` (${e.filename}:${e.lineno ?? 0}:${e.colno ?? 0})` : " (cross-origin / no source — likely a browser extension)";
      recordError({ kind: "error", error: `${e.message || "Script error."}${where}` });
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    recordError({ kind: "unhandledrejection", error: e.reason });
  });
}
