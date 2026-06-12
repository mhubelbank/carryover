import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(160);
  const step = TOUR_STEPS[i];
  const isLast = i === TOUR_STEPS.length - 1;

  // Measure the tooltip so placement can keep it fully on screen (content height
  // varies per step). Per-step is enough — the body text is fixed within a step.
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i]);

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
        // Scroll the target into a spot that leaves room for the tooltip; the
        // scroll listener below keeps the spotlight aligned as it animates.
        const r = el.getBoundingClientRect();
        const ch = cardRef.current?.offsetHeight ?? cardH;
        const vh = window.innerHeight;
        // If the target is short enough to fit with the tooltip below it, park it
        // near the top (tooltip goes underneath). Otherwise it's tall (e.g. the
        // Model card) — reserve room for the tooltip at the very top and slide the
        // target just beneath it so they don't overlap.
        const fitsTooltipBelow = r.height + ch + 48 <= vh;
        const desiredTop = fitsTooltipBelow ? 24 : ch + 24;
        const settled = fitsTooltipBelow
          ? r.top >= 12 && r.bottom + 12 + ch <= vh - 12
          : Math.abs(r.top - desiredTop) < 4;
        if (!settled) window.scrollBy({ top: r.top - desiredTop, behavior: "smooth" });
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

  // Prefer below the target, flip above if it won't fit, and finally clamp so the
  // card is always fully on screen even when the target is tall (e.g. the Model
  // card) or near an edge.
  let cardPos: CSSProperties;
  if (rect) {
    const left = Math.min(Math.max(rect.left, 12), window.innerWidth - CARD_W - 12);
    const below = rect.bottom + 12;
    const above = rect.top - 12 - cardH;
    let top: number;
    if (below + cardH <= window.innerHeight - 12) top = below;
    else if (above >= 12) top = above;
    else top = 12; // target too tall for either side — sit at the top of the screen
    top = Math.max(12, Math.min(top, window.innerHeight - cardH - 12));
    cardPos = { left, top };
  } else {
    cardPos = { left: "50%", top: "42%", transform: "translate(-50%, -50%)" };
  }

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
        ref={cardRef}
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
