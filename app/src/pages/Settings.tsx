import { useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { formatShort, parseDate } from "../domain/dates";

interface SettingsProps {
  onNavigate: (page: NavPage) => void;
  onStartNewTerm: () => void;
}

export function Settings({ onNavigate, onStartNewTerm }: SettingsProps) {
  const { signOut, enterTestMode } = useAuth();

  return (
    <div className="shell">
      <Nav current="settings" onNavigate={onNavigate} />

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Settings</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        Manage keys, export data, and reset.
      </p>

      <TermSection onStartNewTerm={onStartNewTerm} />
      <KeysSection />
      <ExportSection />
      <ResetSection onSignOut={signOut} onTestMode={enterTestMode} />
    </div>
  );
}

function TermSection({ onStartNewTerm }: { onStartNewTerm: () => void }) {
  const { state } = useTerm();

  let body: ReactNode;
  if (state.status === "ready") {
    const { term, students, teachers } = state.data;
    const first = parseDate(term.firstDay);
    const last = parseDate(term.lastDay);
    body = (
      <>
        <p style={{ fontSize: 14, fontWeight: 500 }}>{term.label}</p>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
          {first ? formatShort(first) : term.firstDay} – {last ? formatShort(last) : term.lastDay} ·{" "}
          {students.length} student{students.length === 1 ? "" : "s"} · {teachers.length} teacher
          {teachers.length === 1 ? "" : "s"}
        </p>
      </>
    );
  } else if (state.status === "loading") {
    body = <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Loading…</p>;
  } else if (state.status === "error") {
    body = (
      <>
        <p style={{ fontSize: 14 }}>Couldn't load your term</p>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
          {state.message}
        </p>
      </>
    );
  } else {
    body = (
      <>
        <p style={{ fontSize: 14 }}>No term loaded yet</p>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
          Set up your first school year or summer term to start adding students.
        </p>
      </>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Term</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <div style={{ flex: 1 }}>{body}</div>
        <button
          className="button button--small"
          onClick={onStartNewTerm}
          disabled={state.status !== "ready"}
        >
          <Icon name="plus" size={14} />
          Start a new term
        </button>
      </div>
    </div>
  );
}

function KeysSection() {
  // Slice 1: show masked values, allow update via Sign Out + re-entry.
  // Inline editing comes in a later slice.
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Keys</h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
        Both keys are set. Sign out below to replace them.
      </p>
    </div>
  );
}

function ExportSection() {
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Export</h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>
        Download your data for backup or sharing.
      </p>
      <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
        Export becomes available after you set up a term.
      </p>
    </div>
  );
}

function ResetSection({ onSignOut, onTestMode }: { onSignOut: () => void; onTestMode: () => void }) {
  const [confirming, setConfirming] = useState<"signout" | "testmode" | null>(null);

  return (
    <div className="card">
      <h3 className="card__title">Reset</h3>

      <ResetRow
        title="Sign out and clear keys"
        description={
          <>
            Removes both keys from this browser and returns to the welcome screen. Your data is preserved in GitHub.
          </>
        }
        action={
          confirming === "signout" ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="button button--small" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button className="button button--small" onClick={onSignOut}>
                Confirm
              </button>
            </div>
          ) : (
            <button className="button button--small" onClick={() => setConfirming("signout")}>
              Sign out
            </button>
          )
        }
      />

      <ResetRow
        title="Test as new user"
        description="Signs out and pretends your repo is empty (for a session). Doesn't actually delete anything in GitHub. Refresh to restore."
        action={
          <button className="button button--small" onClick={onTestMode}>
            Test mode
          </button>
        }
      />

      <ResetRow
        title="Reset session cache"
        description="Clears generated notes drafts from this browser. Doesn't affect saved data."
        action={
          <button className="button button--small" disabled>
            Reset cache
          </button>
        }
      />
    </div>
  );
}

function ResetRow({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description: ReactNode;
  action: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderTop: "0.5px solid var(--color-border-tertiary)",
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 500 }}>{title}</p>
        <p style={{ marginTop: 4, fontSize: 12, color: "var(--color-text-secondary)" }}>
          {description}
        </p>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  );
}
