// A non-intrusive toast at the bottom of the screen that pops up the moment an
// error is captured (see clients/errorLog), so a problem is visible immediately
// instead of only in Settings → Diagnostics. It offers a one-click pre-filled email
// of the report to whoever supports the app, and auto-dismisses on its own.
import { useEffect, useState } from "react";
import { subscribeErrors, errorMailto, errorLogText, type ErrorReport } from "../clients/errorLog";

const DISMISS_MS = 15000; // long enough to read and click Email, then it slips away

export function ErrorToaster() {
  const [report, setReport] = useState<ErrorReport | null>(null);
  const [copied, setCopied] = useState(false);

  // Show the newest error; a later one replaces whatever's on screen.
  useEffect(() => subscribeErrors((r) => {
    setReport(r);
    setCopied(false);
  }), []);

  useEffect(() => {
    if (!report) return;
    const t = window.setTimeout(() => setReport(null), DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [report]);

  if (!report) return null;

  // Width-matched and positioned like the SaveBar (centered over the .shell
  // content), in the light-red danger palette.
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 16,
        margin: "0 auto",
        width: "calc(100% - 3rem)",
        maxWidth: "calc(920px - 3rem)",
        zIndex: 1000,
        padding: "10px 16px",
        background: "var(--color-background-danger)",
        border: "0.5px solid var(--color-border-danger)",
        borderRadius: "var(--border-radius-md)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.12)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      <p
        style={{
          margin: 0,
          minWidth: 0,
          fontSize: 13,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={report.message}
      >
        <strong style={{ fontWeight: 500, color: "var(--color-text-danger)" }}>
          Something went wrong. Share the error with Mara →
        </strong>{" "}
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button
          className="button button--small"
          onClick={() => {
            void navigator.clipboard.writeText(errorLogText([report]));
            setCopied(true);
          }}
        >
          {copied ? "Copied ✓" : "Copy text"}
        </button>
        <a
          className="button button--small"
          href={errorMailto([report])}
          onClick={() => setReport(null)}
        >
          Open Mail
        </a>
        <button
          onClick={() => setReport(null)}
          aria-label="Dismiss"
          style={{
            border: "none",
            background: "none",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: 2,
            color: "var(--color-text-tertiary)",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
