import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TOUR_STEPS } from "./steps";
import type { NavPage } from "../Nav";

// Guided coachmark tour. Spotlights the current step's target element (found via
// its data-tour attribute) with a dimmed cutout and an anchored tooltip, stepping
// through TOUR_STEPS. Hand-rolled to match the codebase's no-dependency style; no
// portal needed (the app uses plain fixed overlays). Sits above the error toaster.
const CARD_W = 340;
const GAP = 12;

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[i];
  const isLast = i === TOUR_STEPS.length - 1;

  // Compute the spotlight rect and tooltip position together — using one measured
  // tooltip height so the scroll target and the placement can never disagree (the
  // bug that overlapped the tooltip with tall cards). A short target gets the
  // tooltip below it; a tall one (e.g. the Model card) pins the tooltip at the top
  // and slides the target beneath it. `allowScroll` is true only on the first pass
  // for a step; scroll/resize realignment passes just follow the target.
  const place = useCallback(
    (allowScroll: boolean) => {
      const target = step?.target;
      const card = cardRef.current;
      if (!target || !card) {
        setRect(null);
        setPos(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) {
        setRect(null);
        setPos(null);
        return;
      }
      const ch = card.offsetHeight;
      const vh = window.innerHeight;
      let r = el.getBoundingClientRect();
      // Large content cards read best with the tooltip on top and the section
      // scrolled beneath it — but that only works if there's room ABOVE the target
      // to slide it down (its absolute offset must clear the tooltip). Small UI bits
      // (nav tabs, toggles, headings) and cards too near the top of their page to
      // slide down get the tooltip tucked just below them instead — never overlapping.
      const isCard = r.height > 100;
      const canSlideBelowTooltip = window.scrollY + r.top - (ch + 2 * GAP) >= 0;
      const tooltipBelow = !isCard || !canSlideBelowTooltip;
      if (allowScroll) {
        // Where we want the target's top: just under the top tooltip (tall) or near
        // the top of the screen with room for the tooltip below it (short).
        const desiredTop = tooltipBelow ? 2 * GAP : ch + 2 * GAP;
        const settled = tooltipBelow
          ? r.top >= GAP && r.bottom + GAP + ch <= vh - GAP
          : Math.abs(r.top - desiredTop) < 2;
        if (!settled) {
          // Instant (not smooth): a smooth scroll hasn't moved the element yet when
          // we re-measure below, so the spotlight/tooltip would be placed against a
          // stale position — and a double-invoked effect (StrictMode) would scroll
          // twice and land short. Instant keeps measure-after-scroll correct and the
          // call idempotent (a second pass sees it already in place and no-ops).
          window.scrollBy({ top: r.top - desiredTop });
          r = el.getBoundingClientRect();
        }
      }
      setRect(r);
      const left = Math.min(Math.max(r.left, GAP), window.innerWidth - CARD_W - GAP);
      const top = tooltipBelow ? Math.max(GAP, Math.min(r.bottom + GAP, vh - ch - GAP)) : GAP;
      setPos({ top, left });
    },
    [step?.target],
  );

  // Navigate to the step's page first, if it lives on another tab.
  useEffect(() => {
    if (step?.page && step.page !== currentPage) nav(step.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Find the target (retrying until it mounts after a navigation), place it once
  // with scrolling allowed, then keep it aligned on scroll/resize.
  useEffect(() => {
    if (!step?.target) {
      setRect(null);
      setPos(null);
      return;
    }
    let raf = 0;
    let startT = 0;
    let placed = false;
    const tick = (t: number) => {
      if (document.querySelector(`[data-tour="${step.target}"]`)) {
        place(!placed);
        placed = true;
        return;
      }
      if (!startT) startT = t;
      if (t - startT < 1500) raf = requestAnimationFrame(tick);
      else {
        setRect(null);
        setPos(null);
      }
    };
    raf = requestAnimationFrame(tick);
    const onMove = () => place(false);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [i, currentPage, step?.target, place]);

  // Escape skips the tour.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  if (!step) return null;

  const cardPos: CSSProperties = pos
    ? { position: "fixed", top: pos.top, left: pos.left }
    : { position: "fixed", left: "50%", top: "42%", transform: "translate(-50%, -50%)" };

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
            Exit
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
