import type { CalendarEvent } from "../domain/events";
import { Icon, type IconName } from "./Icon";

interface EventStyle {
  bg: string;
  color: string;
  border: string;
  icon: IconName;
  label: string;
}

// Single source of truth for event color + icon + label, shared by the Schedule
// chips and the Today banners so a given event kind looks identical in both.
export const EVENT_STYLE: Record<CalendarEvent["kind"], EventStyle> = {
  iep: {
    bg: "var(--color-background-accent)",
    color: "var(--color-text-accent)",
    border: "var(--color-border-accent)",
    icon: "clipboard-check",
    label: "IEP review",
  },
  "first-day": {
    bg: "var(--color-background-success)",
    color: "var(--color-text-success)",
    border: "var(--color-border-success)",
    icon: "door-enter",
    label: "First day",
  },
  "last-day": {
    bg: "var(--color-background-warning)",
    color: "var(--color-text-warning)",
    border: "var(--color-border-warning)",
    icon: "door-exit",
    label: "Last day",
  },
  birthday: {
    bg: "#f3ecfc",
    color: "#6b3fa0",
    border: "#e1d5f5",
    icon: "cake",
    label: "Birthday",
  },
};

// A single calendar-event marker: icon + student first name + kind label.
// `height` lets Schedule pin it to its fixed event-row line height; Today omits it.
export function EventChip({
  event,
  onClick,
  height,
}: {
  event: CalendarEvent;
  onClick: () => void;
  height?: number;
}) {
  const style = EVENT_STYLE[event.kind];
  const suffix = event.weekend ? ` (${event.weekend})` : "";
  return (
    <button
      onClick={onClick}
      title={`${event.firstName} · ${style.label}${suffix}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        padding: "0 6px",
        background: style.bg,
        color: style.color,
        border: "none",
        borderRadius: "var(--border-radius-md)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        textAlign: "left",
        fontFamily: "inherit",
        ...(height != null ? { height, lineHeight: `${height}px` } : {}),
      }}
    >
      <Icon name={style.icon} size={11} />
      {event.firstName} · {style.label}
      {suffix}
    </button>
  );
}
