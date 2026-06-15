import type { CSSProperties, ReactNode } from "react";

// A real <a href> for the app's History-API routes, so Cmd/Ctrl/middle/Shift-click
// open the target in a new tab/window like any link. A plain left-click is
// intercepted and handled in-app via onActivate (no full reload). Use for nav tabs
// and any inline link that points at an app screen.
export function AppLink({
  href,
  onActivate,
  className,
  style,
  title,
  dataTour,
  children,
}: {
  href: string;
  onActivate: () => void;
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
      style={{ textDecoration: "none", color: "inherit", ...style }}
      onClick={(e) => {
        // Let the browser handle modified clicks (new tab/window) and non-left
        // buttons; only hijack a plain left-click for in-app navigation.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onActivate();
      }}
    >
      {children}
    </a>
  );
}
