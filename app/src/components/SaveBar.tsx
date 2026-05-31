import type { ReactNode } from "react";
import { useUnsavedGuard } from "../hooks/useUnsavedGuard";

// Floating "unsaved changes" bar, pinned to the bottom of the viewport with a
// muted amber tint so it stands out over the cream tables/cards. Shared across
// every page that has a save flow. `extra` slots a control before the buttons
// (e.g. the Schedule "Apply from" date).
export function SaveBar({
  message,
  saving,
  onDiscard,
  onSave,
  discardLabel = "Discard",
  saveLabel = "Save",
  saveDisabled = false,
  extra,
}: {
  message: string;
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
        position: "sticky",
        bottom: 16,
        marginTop: 16,
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
      <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>{message}</p>
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
