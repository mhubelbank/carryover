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
  onOpenStudent,
  onFinish,
}: {
  currentPage: NavPage;
  nav: (p: NavPage) => void;
  // Opens the first student's detail/goals sub-view (for the deep-dive steps).
  onOpenStudent: (view: "detail" | "goals") => void;
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
      // Measure the target's TRUE current position and lay out the spotlight +
      // tooltip from it. Large content cards read best with the tooltip on top and
      // the section scrolled beneath — but only if there's room ABOVE to slide it
      // down. Small UI bits, and cards too near the top to slide, get the tooltip
      // tucked just below them. Never predicts position — always reads the DOM.
      const layout = () => {
        const el = document.querySelector(`[data-tour="${target}"]`);
        if (!el) {
          setRect(null);
          setPos(null);
          return;
        }
        const r = el.getBoundingClientRect();
        const ch = card.offsetHeight;
        const vh = window.innerHeight;
        const isCard = r.height > 100;
        const canSlideBelowTooltip = window.scrollY + r.top - (ch + 2 * GAP) >= 0;
        const tooltipBelow = !isCard || !canSlideBelowTooltip;
        setRect(r);
        const left = Math.min(Math.max(r.left, GAP), window.innerWidth - CARD_W - GAP);
        const top = tooltipBelow ? Math.max(GAP, Math.min(r.bottom + GAP, vh - ch - GAP)) : GAP;
        setPos({ top, left });
      };
      if (!allowScroll) {
        layout();
        return;
      }
      // Decide the scroll from the current geometry, scroll, then re-measure on the
      // NEXT frame — after the browser has applied the scroll. This avoids both
      // stale getBoundingClientRect and any error when the scroll clamps at a page
      // edge (the bug that left the spotlight offset from the box).
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) {
        setRect(null);
        setPos(null);
        return;
      }
      const r0 = el.getBoundingClientRect();
      const ch = card.offsetHeight;
      const vh = window.innerHeight;
      const isCard = r0.height > 100;
      const canSlideBelowTooltip = window.scrollY + r0.top - (ch + 2 * GAP) >= 0;
      const tooltipBelow = !isCard || !canSlideBelowTooltip;
      const desiredTop = tooltipBelow ? 2 * GAP : ch + 2 * GAP;
      const settled = tooltipBelow
        ? r0.top >= GAP && r0.bottom + GAP + ch <= vh - GAP
        : Math.abs(r0.top - desiredTop) < 2;
      if (settled) {
        layout();
      } else {
        // Use the browser's native scrollIntoView (absolute, reliable, and it syncs
        // layout) with a scroll-margin reserving the desired gap from the top —
        // window.scrollBy proved flaky here (the page didn't move until a manual
        // nudge). Re-measure next frame; the tracking loop follows any settling.
        const node = el as HTMLElement;
        node.style.scrollMarginTop = `${desiredTop}px`;
        node.scrollIntoView({ block: "start" });
        requestAnimationFrame(layout);
      }
    },
    [step?.target],
  );

  // Navigate to the step's page first (or open a student sub-view for the
  // detail/goals deep-dive steps).
  useEffect(() => {
    if (step?.open) onOpenStudent(step.open);
    else if (step?.page && step.page !== currentPage) nav(step.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Find the target (retrying until it mounts after a navigation), scroll it into
  // place once, then CONTINUOUSLY track its real position for a short window —
  // re-reading the DOM each frame and updating only when it actually moves. This is
  // immune to scroll/layout-settle timing (the cause of the spotlight drifting off
  // scrolled Settings cards): whenever the box settles, the spotlight follows it.
  useEffect(() => {
    if (!step?.target) {
      setRect(null);
      setPos(null);
      return;
    }
    let raf = 0;
    let startT = 0;
    let scrolledAt = 0;
    let didScroll = false;
    let lastKey = "";
    const frame = (t: number) => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        if (!didScroll) {
          place(true); // scroll the target into place once
          didScroll = true;
          scrolledAt = t;
        } else {
          const r = el.getBoundingClientRect();
          const key = `${Math.round(r.top)},${Math.round(r.left)},${Math.round(r.height)}`;
          if (key !== lastKey) {
            lastKey = key;
            place(false); // re-anchor to the box's current position
          }
        }
        // Track for ~1.2s to absorb the scroll and any async settling, then stop.
        if (t - scrolledAt < 1200 || !didScroll) raf = requestAnimationFrame(frame);
        return;
      }
      if (!startT) startT = t;
      if (t - startT < 1500) raf = requestAnimationFrame(frame);
      else {
        setRect(null);
        setPos(null);
      }
    };
    raf = requestAnimationFrame(frame);
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
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            margin: "0 0 6px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{step.title}</h3>
          {step.pageLabel && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-text-tertiary)",
                whiteSpace: "nowrap",
              }}
            >
              {step.pageLabel}
            </span>
          )}
        </div>
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
