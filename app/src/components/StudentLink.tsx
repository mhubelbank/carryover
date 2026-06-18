import type { CSSProperties, ReactNode } from "react";
import { AppLink } from "./AppLink";
import { studentHref } from "../routes";

// An inline link to a student's page. Always opens in a NEW tab (so a note and a
// student page can sit side by side) — see AppLink newTab. Afforded as clickable
// at rest with a dotted underline that turns solid on hover/focus (.student-link).
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
      newTab
      className="student-link"
      style={{ cursor: "pointer", ...style }}
    >
      {children}
    </AppLink>
  );
}
