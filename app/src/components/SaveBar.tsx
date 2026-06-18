import type { ReactNode } from "react";
import { useUnsavedGuard } from "../hooks/useUnsavedGuard";
import { Icon } from "./Icon";

// Floating "unsaved changes" bar, fixed to the bottom of the viewport (so it
// stays visible on long pages, not just when scrolled to the end) with a muted
// amber tint. Centered and width-matched to the .shell content (max-width 968,
// 1.5rem side padding). Shared across every page that has a save flow. `extra`
// slots a control before the buttons (e.g. the Schedule "Apply from" date).
export function SaveBar({
  message,
  problem,
  saving,
  onDiscard,
  onSave,
  discardLabel = "Discard",
  saveLabel = "Save",
  saveDisabled = false,
  extra,
}: {
  message: string;
  // When set, shown in place of `message` in a danger tone (with an alert icon)
  // — for validation/save errors that would otherwise be easy to miss in small
  // inline text. The caller still controls `saveDisabled` for blocking saves.
  problem?: string | null;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
  discardLabel?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  extra?: ReactNode;
}) {
  // Mounted only while there are unsaved changes — warn on leaving.
  useUnsavedGuard();
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 16,
        margin: "0 auto",
        width: "calc(100% - 3rem)",
        maxWidth: "calc(920px - 3rem)",
        zIndex: 50,
        padding: "10px 16px",
        background: "var(--color-background-warning)",
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.12)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
      }}
    >
      {problem ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--color-text-danger)",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="alert-circle" size={14} />
          {problem}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{message}</p>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {extra}
        <button className="button button--small" onClick={onDiscard} disabled={saving}>
          {discardLabel}
        </button>
        <button
          className="button button--small button--primary"
          onClick={onSave}
          disabled={saving || saveDisabled}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
