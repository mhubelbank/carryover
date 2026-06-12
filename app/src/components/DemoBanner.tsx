import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { resetDemoFs } from "../demo/seed";

// Persistent strip shown across the top of every page while in Demo mode. Makes it
// unmistakable that this is a sandbox, and offers Reset (re-seed the sample data)
// and Exit (back to the welcome screen).
export function DemoBanner() {
  const { exitDemoMode } = useAuth();
  const { client, reload } = useTerm();
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    if (!client) return;
    setResetting(true);
    try {
      await resetDemoFs(client);
      reload();
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "7px 16px",
        background: "var(--color-background-info)",
        color: "var(--color-text-info)",
        borderBottom: "0.5px solid var(--color-border-secondary)",
        fontSize: 13,
      }}
    >
      <span>
        <strong style={{ fontWeight: 600 }}>Demo mode</strong> — exploring sample data. Nothing is
        saved to a real account.
      </span>
      <span style={{ display: "inline-flex", gap: 8 }}>
        <button className="button button--small" onClick={() => void reset()} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset demo"}
        </button>
        <button className="button button--small" onClick={exitDemoMode}>
          Exit
        </button>
      </span>
    </div>
  );
}
