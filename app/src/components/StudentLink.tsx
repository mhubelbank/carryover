import type { CSSProperties, ReactNode } from "react";
import { AppLink } from "./AppLink";
import { studentHref } from "../routes";

// An inline link to a student's page. Plain click opens the detail in-app;
// Cmd/middle-click opens it in a new tab (so a note and a student can be viewed
// side by side). Subtly afforded — underlines on hover.
export function StudentLink({
  id,
  view = "detail",
  onOpen,
  children,
  style,
}: {
  id: string;
  view?: "detail" | "goals";
  onOpen: (id: string, view?: "detail" | "goals") => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <AppLink
      href={studentHref(id, view)}
      onActivate={() => onOpen(id, view)}
      className="link-affordance"
      style={{ cursor: "pointer", ...style }}
    >
      {children}
    </AppLink>
  );
}
