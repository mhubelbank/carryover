import { useState, type CSSProperties, type ReactNode } from "react";

// A lightweight hover tooltip that floats just to the RIGHT of the cursor
// (Claude-style), replacing the browser's native `title` bubble — which can't be
// positioned or styled. The trigger keeps a help cursor (and an optional dotted
// underline) instead of a heavy "?" glyph. The tip is pointer-events-none so it
// never blocks, and clamps near the right edge so it doesn't overflow. Pass inline
// children (the trigger) — the wrapper is a span.
export function Tip({
  tip,
  children,
  underline = false,
  style,
}: {
  tip: string;
  children: ReactNode;
  underline?: boolean;
  style?: CSSProperties;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  if (!tip) return <>{children}</>;
  const W = 280;
  return (
    <span
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
      style={{
        cursor: "help",
        ...(underline ? { textDecoration: "underline dotted", textUnderlineOffset: "2px" } : {}),
        ...style,
      }}
    >
      {children}
      {pos && (
        <span
          role="tooltip"
          style={{
            position: "fixed",
            left: Math.max(8, Math.min(pos.x + 14, window.innerWidth - W - 8)),
            top: pos.y + 12,
            zIndex: 1200,
            maxWidth: W,
            pointerEvents: "none",
            background: "var(--color-background-primary)",
            color: "var(--color-text-primary)",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
            padding: "6px 9px",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.35,
            whiteSpace: "normal",
          }}
        >
          {tip}
        </span>
      )}
    </span>
  );
}
