import type { CSSProperties, ReactNode } from "react";

// A real <a href> for the app's History-API routes, so Cmd/Ctrl/middle/Shift-click
// open the target in a new tab/window like any link. A plain left-click is
// intercepted and handled in-app via onActivate (no full reload). Use for nav tabs
// and any inline link that points at an app screen.
export function AppLink({
  href,
  onActivate,
  newTab = false,
  className,
  style,
  title,
  dataTour,
  children,
}: {
  href: string;
  onActivate: () => void;
  // When true, EVERY click (even a plain one) opens the target in a new tab and
  // the current page stays put — onActivate is not called. Used for person-name
  // links so a note/schedule and a person's page can be viewed side by side.
  newTab?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  dataTour?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      title={title}
      data-tour={dataTour}
      className={className}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener" : undefined}
      style={{ textDecoration: "none", color: "inherit", ...style }}
      onClick={(e) => {
        // New-tab links: let the browser open target=_blank for any click.
        if (newTab) return;
        // Otherwise let the browser handle modified clicks (new tab/window) and
        // non-left buttons; only hijack a plain left-click for in-app navigation.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onActivate();
      }}
    >
      {children}
    </a>
  );
}
