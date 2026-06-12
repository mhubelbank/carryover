import { useEffect, useState, type CSSProperties } from "react";
import { TOUR_STEPS } from "./steps";
import type { NavPage } from "../Nav";

// Guided coachmark tour. Spotlights the current step's target element (found via
// its data-tour attribute) with a dimmed cutout and an anchored tooltip, stepping
// through TOUR_STEPS. Hand-rolled to match the codebase's no-dependency style; no
// portal needed (the app uses plain fixed overlays). Sits above the error toaster.
const CARD_W = 340;

export function TutorialOverlay({
  currentPage,
  nav,
  onFinish,
}: {
  currentPage: NavPage;
  nav: (p: NavPage) => void;
  onFinish: () => void;
}) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[i];
  const isLast = i === TOUR_STEPS.length - 1;

  // Navigate to the step's page first, if it lives on another tab.
  useEffect(() => {
    if (step?.page && step.page !== currentPage) nav(step.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Measure the target (retrying until it mounts after a possible navigation), and
  // keep the spotlight aligned as the page scrolls or resizes.
  useEffect(() => {
    const target = step?.target;
    if (!target) {
      setRect(null);
      return;
    }
    const find = () => document.querySelector(`[data-tour="${target}"]`);
    let raf = 0;
    let startT = 0;
    const loop = (t: number) => {
      const el = find();
      if (el) {
        // Bring off-screen targets (e.g. lower Settings sections) into view; the
        // scroll listener below keeps the spotlight aligned as it animates.
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setRect(el.getBoundingClientRect());
        return;
      }
      if (!startT) startT = t;
      if (t - startT < 1500) raf = requestAnimationFrame(loop);
      else setRect(null); // give up → center the card
    };
    raf = requestAnimationFrame(loop);
    const onMove = () => {
      const el = find();
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [i, currentPage, step?.target]);

  // Escape skips the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  if (!step) return null;

  const placeAbove = !!rect && rect.bottom > window.innerHeight - 220;
  const cardPos: CSSProperties = rect
    ? {
        left: Math.min(Math.max(rect.left, 12), window.innerWidth - CARD_W - 12),
        ...(placeAbove
          ? { top: rect.top - 12, transform: "translateY(-100%)" }
          : { top: rect.bottom + 12 }),
      }
    : { left: "50%", top: "42%", transform: "translate(-50%, -50%)" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, pointerEvents: "none" }}>
      {/* Dimmer / click-catcher. When a target is highlighted the dimming comes
          from the spotlight's box-shadow, so this stays transparent but still
          swallows clicks so the user follows the tour controls. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "auto",
          background: rect ? "transparent" : "rgba(0, 0, 0, 0.5)",
        }}
      />
      {rect && (
        <div
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 10,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.5)",
            pointerEvents: "none",
            transition: "all 0.15s ease",
          }}
        />
      )}
      <div
        className="card"
        style={{
          position: "fixed",
          width: CARD_W,
          maxWidth: "calc(100vw - 24px)",
          pointerEvents: "auto",
          boxShadow: "0 8px 28px rgba(0, 0, 0, 0.25)",
          ...cardPos,
        }}
      >
        <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 600 }}>{step.title}</h3>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          {step.body}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
          <button
            onClick={onFinish}
            style={{
              border: "none",
              background: "none",
              padding: 0,
              font: "inherit",
              fontSize: 12.5,
              color: "var(--color-text-tertiary)",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {i + 1} of {TOUR_STEPS.length}
            </span>
            {i > 0 && (
              <button className="button button--small" onClick={() => setI(i - 1)}>
                Back
              </button>
            )}
            <button
              className="button button--small button--primary"
              onClick={() => (isLast ? onFinish() : setI(i + 1))}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
