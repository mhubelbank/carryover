import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadTermHistory } from "../domain/data";
import { formatShort, parseDate } from "../domain/dates";
import type { Term } from "../domain/term";

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
        Manage your catalogs, keys, export data, and reset.
      </p>

      <TermSection onStartNewTerm={onStartNewTerm} />
      <CatalogsSection onNavigate={onNavigate} />
      <KeysSection />
      <ExportSection />
      <ResetSection onSignOut={signOut} onTestMode={enterTestMode} />
    </div>
  );
}

function TermSection({ onStartNewTerm }: { onStartNewTerm: () => void }) {
  const { state, client } = useTerm();
  const [history, setHistory] = useState<Term[]>([]);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    loadTermHistory(client)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

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

      {history.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
          <p style={{ margin: "0 0 8px 0", fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Past terms
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...history].reverse().map((t, i) => {
              const first = parseDate(t.firstDay);
              const last = parseDate(t.lastDay);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                  <span>{t.label}</span>
                  <span style={{ color: "var(--color-text-tertiary)" }}>
                    {first ? formatShort(first) : t.firstDay} – {last ? formatShort(last) : t.lastDay}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogsSection({ onNavigate }: { onNavigate: (page: NavPage) => void }) {
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Catalogs</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <p style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}>
          Activities, filming roles, and student fields — assigned to teachers and used when
          generating notes.
        </p>
        <button className="button button--small" onClick={() => onNavigate("activities")}>
          Manage catalogs →
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
