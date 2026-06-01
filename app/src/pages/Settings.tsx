import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { loadTermHistory } from "../domain/data";
import { formatShort, parseDate, startOfDay } from "../domain/dates";
import { termLabel, type Term } from "../domain/term";

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

// Date inputs styled to read as quiet metadata (still click-to-edit).
const SUBTLE_DATE: CSSProperties = {
  border: "none",
  background: "transparent",
  fontFamily: "inherit",
  fontSize: 12,
  color: "var(--color-text-tertiary)",
  padding: 0,
  width: 102,
  cursor: "pointer",
};

function TermSection({ onStartNewTerm }: { onStartNewTerm: () => void }) {
  const { state, client, saveTerm } = useTerm();
  const [history, setHistory] = useState<Term[]>([]);
  const [showHistory, setShowHistory] = useState(false);
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

  const ready = state.status === "ready" ? state.data : null;
  const term = ready?.term ?? null;
  const last = term ? parseDate(term.lastDay) : null;
  const termOver = !!last && startOfDay(new Date()).getTime() >= last.getTime();

  // Inline date edits re-derive the auto-label and save immediately.
  const setDates = (patch: { firstDay?: string; lastDay?: string }) => {
    if (!term) return;
    const firstDay = patch.firstDay ?? term.firstDay;
    const lastDay = patch.lastDay ?? term.lastDay;
    void saveTerm({ ...term, firstDay, lastDay, label: termLabel(term.termType, firstDay, lastDay) });
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h3 className="card__title" style={{ margin: 0 }}>
          Term
        </h3>
        <button className="button button--small" onClick={onStartNewTerm} disabled={!ready}>
          <Icon name="plus" size={14} /> Start a new term
        </button>
      </div>

      {ready && term ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{term.label}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 12, color: "var(--color-text-tertiary)" }}>
            <input
              type="date"
              value={term.firstDay}
              title="Click to edit the start date"
              style={SUBTLE_DATE}
              onChange={(e) => setDates({ firstDay: e.target.value })}
            />
            –
            <input
              type="date"
              value={term.lastDay}
              title="Click to edit the end date"
              style={SUBTLE_DATE}
              onChange={(e) => setDates({ lastDay: e.target.value })}
            />
          </span>
          <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
            {ready.students.length} student{ready.students.length === 1 ? "" : "s"} ·{" "}
            {ready.teachers.length} teacher{ready.teachers.length === 1 ? "" : "s"}
          </span>
          {termOver && (
            <button
              className="button button--small button--primary"
              style={{ marginLeft: "auto" }}
              onClick={onStartNewTerm}
            >
              Finish term →
            </button>
          )}
        </div>
      ) : state.status === "loading" ? (
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Loading…</p>
      ) : state.status === "error" ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Couldn't load your term: {state.message}
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          No term yet — start one above.
        </p>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 14, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10 }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: 13, color: "var(--color-text-secondary)" }}
          >
            <span style={{ display: "inline-flex", transform: showHistory ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>
              <Icon name="chevron-right" size={14} />
            </span>
            Past terms ({history.length})
          </button>
          {showHistory && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {[...history].reverse().map((t, i) => {
                const f = parseDate(t.firstDay);
                const l = parseDate(t.lastDay);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
                    <span>{t.label}</span>
                    <span style={{ color: "var(--color-text-tertiary)" }}>
                      {f ? formatShort(f) : t.firstDay} – {l ? formatShort(l) : t.lastDay}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
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
