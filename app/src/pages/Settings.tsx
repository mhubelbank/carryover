import { useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { AnthropicError, validateApiKey } from "../clients/anthropic";
import { GitHubError, validateGitHubToken } from "../clients/github";
import { REPO_CONFIG, useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { triggerDownload, downloadText, zipStore } from "../clients/download";
import { buildXlsx } from "../clients/xlsx";
import { clearNotes, getAllNotes } from "../clients/noteCache";
import { loadThemePref, setThemePref, type ThemePref } from "../clients/theme";
import { backupJson, csvBundleEntries, recentNotesTxt, termSlug, workbookSheets } from "../domain/export";
import { formatShort, parseDate, startOfDay, toISODate } from "../domain/dates";
import { termLabel, type ArchivedTerm, type StudentSnapshot } from "../domain/term";

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
      <AppearanceSection />
      <CatalogsSection onNavigate={onNavigate} />
      <KeysSection />
      <ExportSection />
      <ResetSection onSignOut={signOut} onTestMode={enterTestMode} />
    </div>
  );
}

// A date shown as quiet text that aligns with the line; clicking reveals a
// date input (avoids the native control's trailing whitespace / odd alignment).
function EditableDate({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          const v = e.target.value;
          if (v && v !== value) onChange(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") setEditing(false);
        }}
        style={{
          border: "none",
          background: "transparent",
          fontFamily: "inherit",
          fontSize: 12,
          color: "var(--color-text-secondary)",
          padding: 0,
          width: 124,
        }}
      />
    );
  }
  const d = parseDate(value);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{ border: "none", background: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" }}
    >
      {d ? formatShort(d) : value}
    </button>
  );
}

function TermSection({ onStartNewTerm }: { onStartNewTerm: () => void }) {
  const { state, saveTerm, finishTerm, undoFinishTerm, deleteTerm, termHistory } = useTerm();
  const [showHistory, setShowHistory] = useState(false);
  // null = idle, "confirm" = confirm panel open, "busy" = finishing in progress.
  const [finishStep, setFinishStep] = useState<null | "confirm" | "busy">(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);

  const ready = state.status === "ready" ? state.data : null;
  const term = ready?.term ?? null;
  const last = term ? parseDate(term.lastDay) : null;
  const termOver = !!last && startOfDay(new Date()).getTime() >= last.getTime();
  const finished = !!term?.finishedOn;
  const finishedOn = term?.finishedOn ? parseDate(term.finishedOn) : null;
  // The current term is also in history once finished — show it only once (as the
  // current term above), so exclude it from the Past-terms list.
  const pastTerms = term
    ? termHistory.filter(
        (t) =>
          !(t.termType === term.termType && t.firstDay === term.firstDay && t.lastDay === term.lastDay),
      )
    : termHistory;

  // Inline date edits re-derive the auto-label and save immediately.
  const setDates = (patch: { firstDay?: string; lastDay?: string }) => {
    if (!term) return;
    const firstDay = patch.firstDay ?? term.firstDay;
    const lastDay = patch.lastDay ?? term.lastDay;
    void saveTerm({ ...term, firstDay, lastDay, label: termLabel(term.termType, firstDay, lastDay) });
  };

  const doFinish = async () => {
    setFinishStep("busy");
    setFinishError(null);
    try {
      await finishTerm(toISODate(startOfDay(new Date())));
      setShowHistory(true);
      setFinishStep(null);
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : "Couldn't finish the term.");
      setFinishStep("confirm");
    }
  };

  const doReopen = async () => {
    setReopening(true);
    try {
      await undoFinishTerm();
    } catch {
      // Leave the term finished; the chip stays so she can retry.
    } finally {
      setReopening(false);
    }
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

      <div
        style={{
          borderTop: "0.5px solid var(--color-border-tertiary)",
          borderBottom: "0.5px solid var(--color-border-tertiary)",
          padding: "10px 0",
        }}
      >
        {ready && term ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{term.label}</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontSize: 12, color: "var(--color-text-tertiary)" }}>
              <EditableDate value={term.firstDay} onChange={(v) => setDates({ firstDay: v })} />
              –
              <EditableDate value={term.lastDay} onChange={(v) => setDates({ lastDay: v })} />
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
              {ready.students.length} student{ready.students.length === 1 ? "" : "s"} ·{" "}
              {ready.teachers.length} teacher{ready.teachers.length === 1 ? "" : "s"}
            </span>
            {finished ? (
              <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--color-text-tertiary)" }}
                  title="This term has been archived to your history."
                >
                  <Icon name="check" size={14} /> Finished{finishedOn ? ` ${formatShort(finishedOn)}` : ""}
                </span>
                <button
                  className="button button--small"
                  onClick={() => void doReopen()}
                  disabled={reopening}
                  title="Reverse the archive: clears the finished mark and removes the history entry."
                >
                  {reopening ? "Reopening…" : "Reopen"}
                </button>
              </span>
            ) : termOver && finishStep === null ? (
              <button
                className="button button--small button--primary"
                style={{ marginLeft: "auto" }}
                onClick={() => {
                  setFinishError(null);
                  setFinishStep("confirm");
                }}
              >
                Finish term →
              </button>
            ) : null}
          </div>
        ) : state.status === "loading" ? (
          <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Loading…</p>
        ) : state.status === "error" ? (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
            Couldn't load your term: {state.message}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
            No term yet — start one above.
          </p>
        )}
      </div>

      {ready && term && !finished && finishStep !== null && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: "var(--border-radius-md)",
            background: "var(--color-background-secondary)",
            fontSize: 13,
          }}
        >
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Archive <strong>{term.label}</strong>? This saves a snapshot of today's{" "}
            {ready.students.length} student{ready.students.length === 1 ? "" : "s"} and{" "}
            {ready.teachers.length} teacher{ready.teachers.length === 1 ? "" : "s"} (with their goals)
            to your history. Your caseload stays put — start a new term whenever you're ready to roll
            it forward.
          </p>
          {finishError && (
            <p style={{ margin: "8px 0 0", color: "var(--color-text-danger)" }}>{finishError}</p>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              className="button button--small"
              onClick={() => setFinishStep(null)}
              disabled={finishStep === "busy"}
            >
              Cancel
            </button>
            <button
              className="button button--small button--primary"
              onClick={() => void doFinish()}
              disabled={finishStep === "busy"}
            >
              {finishStep === "busy" ? "Finishing…" : "Finish term"}
            </button>
          </div>
        </div>
      )}

      {pastTerms.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: 13, color: "var(--color-text-secondary)" }}
          >
            <span style={{ display: "inline-flex", transform: showHistory ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>
              <Icon name="chevron-right" size={14} />
            </span>
            Past terms ({pastTerms.length})
          </button>
          {showHistory && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
              {[...pastTerms].reverse().map((t, i) => (
                <PastTermRow
                  key={`${t.firstDay}-${t.lastDay}-${i}`}
                  term={t}
                  onDelete={() => void deleteTerm(t)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A past term: label + dates, expandable to its end-of-term snapshot (students
// grouped by classroom, with the long-term goals worked on that term).
function PastTermRow({ term, onDelete }: { term: ArchivedTerm; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const f = parseDate(term.firstDay);
  const l = parseDate(term.lastDay);
  const snapshot = term.snapshot;

  const handleDelete = () => {
    const n = snapshot?.students.length ?? 0;
    const detail = n ? ` Its end-of-term snapshot of ${n} student${n === 1 ? "" : "s"} will be lost.` : "";
    if (window.confirm(`Delete "${term.label}" from your history?${detail} This can't be undone.`)) onDelete();
  };

  return (
    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={() => snapshot && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          fontSize: 13,
          cursor: snapshot ? "pointer" : "default",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {snapshot && (
            <span style={{ display: "inline-flex", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.12s" }}>
              <Icon name="chevron-right" size={14} />
            </span>
          )}
          {term.label}
        </span>
        <span style={{ color: "var(--color-text-tertiary)" }}>
          {f ? formatShort(f) : term.firstDay} – {l ? formatShort(l) : term.lastDay}
          {snapshot ? ` · ${snapshot.students.length} student${snapshot.students.length === 1 ? "" : "s"}` : ""}
        </span>
      </button>
        <button
          onClick={handleDelete}
          title="Delete this past term"
          aria-label={`Delete ${term.label}`}
          style={{
            display: "inline-flex",
            background: "none",
            border: "none",
            padding: 4,
            cursor: "pointer",
            color: "var(--color-text-tertiary)",
            flexShrink: 0,
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
      {snapshot && open && <TermSnapshotDetail students={snapshot.students} />}
    </div>
  );
}

function TermSnapshotDetail({ students }: { students: StudentSnapshot[] }) {
  // Group by the classroom recorded at term end; "—" for unassigned.
  const groups = new Map<string, StudentSnapshot[]>();
  for (const s of students) {
    const key = s.teacherName || "—";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (students.length === 0) {
    return (
      <p style={{ margin: "8px 0 4px 20px", fontSize: 12, color: "var(--color-text-tertiary)" }}>
        No students on the caseload.
      </p>
    );
  }

  return (
    <div style={{ margin: "8px 0 4px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map(([teacher, group]) => (
        <div key={teacher}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary)" }}>
            {teacher}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
            {group.map((s) => (s.exited ? `${s.name} (left)` : s.name)).join(", ")}
          </p>
        </div>
      ))}
    </div>
  );
}

function AppearanceSection() {
  const [pref, setPref] = useState<ThemePref>(loadThemePref);
  const choose = (p: ThemePref) => {
    setPref(p);
    setThemePref(p);
  };
  const options: { value: ThemePref; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ];
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Appearance</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          role="group"
          aria-label="Theme"
          style={{
            display: "inline-flex",
            border: "0.5px solid var(--color-border-secondary)",
            borderRadius: "var(--border-radius-md)",
            overflow: "hidden",
          }}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              className="button button--small"
              onClick={() => choose(o.value)}
              style={{
                border: "none",
                borderRadius: 0,
                borderLeft: i > 0 ? "0.5px solid var(--color-border-secondary)" : "none",
                background: pref === o.value ? "var(--color-background-secondary)" : "transparent",
                color: pref === o.value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                fontWeight: pref === o.value ? 500 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          System follows your device and switches automatically.
        </span>
      </div>
    </div>
  );
}

function CatalogsSection({ onNavigate }: { onNavigate: (page: NavPage) => void }) {
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Catalogs</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
        <p style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)" }}>
          Activities, news roles, and student fields — assigned to teachers and used when
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
  const { keys, updateKeys } = useAuth();
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Keys</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KeyRow
          label="Anthropic API key"
          value={keys?.anthropicApiKey ?? ""}
          placeholder="sk-ant-…"
          validate={(v) => validateApiKey(v)}
          onSave={(v) => updateKeys({ anthropicApiKey: v })}
        />
        <KeyRow
          label="GitHub personal access token"
          value={keys?.githubToken ?? ""}
          placeholder="github_pat_… or ghp_…"
          validate={(v) => validateGitHubToken(v, REPO_CONFIG.owner, REPO_CONFIG.repo)}
          onSave={(v) => updateKeys({ githubToken: v })}
        />
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        Stored only in this browser. Update the GitHub token if data is missing, and the Anthropic key if note generation fails.
      </p>
    </div>
  );
}

// Mask a stored secret for display: visible scheme prefix + dots + last 4, so
// she can tell which key is set and recognize it without revealing it.
function maskKey(value: string): string {
  if (!value) return "Not set";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 6)}••••••••${value.slice(-4)}`;
}

function formatKeyError(err: unknown): string {
  if (err instanceof AnthropicError) return `Key rejected: ${err.message}`;
  if (err instanceof GitHubError) return `Token rejected: ${err.message}`;
  return err instanceof Error ? err.message : "Couldn't validate — check your connection.";
}

// One key row: masked value + Update, expanding to a password field + Save/Cancel.
// Save validates the new key against its service first, so a typo can't silently
// break the app. Each row saves independently, so editing one never disturbs the other.
function KeyRow({
  label,
  value,
  placeholder,
  validate,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  validate: (value: string) => Promise<unknown>;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEditing(false);
    setDraft("");
    setError(null);
    setValidating(false);
  };

  const save = async () => {
    const v = draft.trim();
    if (!v || validating) return;
    setValidating(true);
    setError(null);
    try {
      await validate(v);
      onSave(v);
      close();
    } catch (err) {
      setError(formatKeyError(err));
      setValidating(false);
    }
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        {editing ? (
          <>
            <input
              className="input"
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={draft}
              disabled={validating}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void save();
                else if (e.key === "Escape") close();
              }}
            />
            <button
              className="button button--small"
              style={{ flexShrink: 0 }}
              onClick={close}
              disabled={validating}
            >
              Cancel
            </button>
            <button
              className="button button--small button--primary"
              style={{ flexShrink: 0 }}
              onClick={() => void save()}
              disabled={!draft.trim() || validating}
            >
              {validating ? "Checking…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <input
              className="input"
              type="text"
              readOnly
              value={maskKey(value)}
              style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}
            />
            <button
              className="button button--small"
              style={{ flexShrink: 0 }}
              onClick={() => setEditing(true)}
            >
              Update
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="field-hint" style={{ color: "var(--color-text-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ExportSection() {
  const { state } = useTerm();
  const data = state.status === "ready" ? state.data : null;
  const slug = data ? termSlug(data.term.label) : "term";

  const downloadBackup = () => {
    if (!data) return;
    downloadText(`carryover-${slug}-backup.json`, backupJson(data), "application/json");
  };

  const downloadBundle = () => {
    if (!data) return;
    const bytes = zipStore(csvBundleEntries(data));
    triggerDownload(`carryover-${slug}-data.zip`, new Blob([bytes], { type: "application/zip" }));
  };

  const downloadExcel = () => {
    if (!data) return;
    const bytes = buildXlsx(workbookSheets(data));
    triggerDownload(
      `carryover-${slug}.xlsx`,
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
  };

  const [notesMsg, setNotesMsg] = useState<string | null>(null);
  const downloadRecentNotes = async () => {
    setNotesMsg(null);
    const notes = await getAllNotes();
    if (notes.length === 0) {
      setNotesMsg("No generated notes are cached yet — generate some first.");
      return;
    }
    downloadText(`carryover-${slug}-recent-notes.txt`, recentNotesTxt(notes));
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Export</h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>
        Download your data for backup or sharing.
      </p>
      {!data ? (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>
          Export becomes available after you set up a term.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button button--small" onClick={downloadExcel}>
            Excel (your sheet format)
          </button>
          <button className="button button--small" onClick={downloadBundle}>
            CSV bundle (.zip)
          </button>
          <button className="button button--small" onClick={() => void downloadRecentNotes()}>
            Recent notes (.txt)
          </button>
          <button className="button button--small" onClick={downloadBackup}>
            Full JSON backup
          </button>
        </div>
      )}
      {notesMsg && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          {notesMsg}
        </p>
      )}
    </div>
  );
}

function ResetSection({ onSignOut, onTestMode }: { onSignOut: () => void; onTestMode: () => void }) {
  const [confirming, setConfirming] = useState<"signout" | "testmode" | "cache" | null>(null);

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
        description="Clears generated notes cached in this browser. Doesn't affect saved data."
        action={
          confirming === "cache" ? (
            <div style={{ display: "flex", gap: 6 }}>
              <button className="button button--small" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                className="button button--small"
                onClick={() => {
                  void clearNotes();
                  setConfirming(null);
                }}
              >
                Confirm
              </button>
            </div>
          ) : (
            <button className="button button--small" onClick={() => setConfirming("cache")}>
              Reset cache
            </button>
          )
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
