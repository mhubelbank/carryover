// Catches render-time crashes anywhere below it so a thrown component shows a
// recoverable message instead of a blank white screen, and records the crash to the
// local diagnostics log (see clients/errorLog). Wraps the whole app in main.tsx.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordError } from "../clients/errorLog";

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    recordError({ kind: "render", error, componentStack: info.componentStack ?? undefined });
  }

  render(): ReactNode {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="shell" style={{ maxWidth: 560, margin: "10vh auto", textAlign: "center" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: 0 }}>
            The app hit an unexpected error and stopped this screen. Your data is safe — nothing
            is generated or saved without you. Reload to continue; if it keeps happening, open
            Settings → Diagnostics and send the report to the developer.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="button" onClick={() => location.reload()}>
              Reload the app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
