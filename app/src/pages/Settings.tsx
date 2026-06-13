import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Nav, type NavPage } from "../components/Nav";
import { AnthropicError } from "../clients/anthropic";
import { OpenAIError } from "../clients/openai";
import { validateKey } from "../clients/llm";
import { GitHubError, validateGitHubToken } from "../clients/github";
import {
  MODEL_CHOICES,
  PROVIDER_META,
  perNoteCostLabel,
  annualCostLabel,
  promptSetChars,
  MEASURED_ON,
  BASELINE_PROMPT_CHARS,
  PROMPT_DRIFT_THRESHOLD,
} from "../clients/models";
import { storage, StorageKeys } from "../clients/storage";
import { getModelChoiceId, setModelChoiceId } from "../clients/modelPref";
import { consumeSettingsSection } from "../clients/settingsNav";
import { isTokenRenewalDue } from "../domain/tokenRenewal";
import { REPO_CONFIG, useAuth } from "../context/AuthContext";
import { useTerm } from "../context/TermContext";
import { useTutorial } from "../context/TutorialContext";
import { loadFeedbackRules, loadGoldenExamples } from "../domain/data";
import { loadPromptSet } from "../domain/notes";
import { triggerDownload, downloadText, zipStore } from "../clients/download";
import { buildXlsx } from "../clients/xlsx";
import { clearNotes, getAllNotes } from "../clients/noteCache";
import { loadThemePref, setThemePref, type ThemePref } from "../clients/theme";
import { getErrorLog, clearErrorLog, errorLogText, errorMailto, type ErrorReport } from "../clients/errorLog";
import { backupJson, csvBundleEntries, recentNotesTxt, termSlug, workbookSheets } from "../domain/export";
import { formatShort, parseDate, startOfDay, toISODate } from "../domain/dates";
import { termLabel, type ArchivedTerm, type StudentSnapshot } from "../domain/term";

interface SettingsProps {
  onNavigate: (page: NavPage) => void;
  onStartNewTerm: () => void;
}


export function Settings({ onNavigate, onStartNewTerm }: SettingsProps) {
  const { signOut, enterTestMode } = useAuth();

  // Scroll to a requested section on open (e.g. the Today token banner → Keys).
  useEffect(() => {
    const section = consumeSettingsSection();
    if (!section) return;
    requestAnimationFrame(() => {
      document.getElementById(`settings-${section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <div className="shell">
      <Nav current="settings" onNavigate={onNavigate} />

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Settings</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        Manage your catalogs, keys, export data, and reset.
      </p>

      <TermSection onStartNewTerm={onStartNewTerm} />
      <CatalogsSection onNavigate={onNavigate} />
      <ModelSection />
      <KeysSection />
      <ExportSection />
      <AppearanceSection />
      <HelpSection onNavigate={onNavigate} />
      <DiagnosticsSection />
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
  const { state, saveTerm, finishTerm, undoFinishTerm, termHistory } = useTerm();
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
    <div data-tour="settings-term" className="card" style={{ marginBottom: "1rem" }}>
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
                <PastTermRow key={`${t.firstDay}-${t.lastDay}-${i}`} term={t} />
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
function PastTermRow({ term }: { term: ArchivedTerm }) {
  const [open, setOpen] = useState(false);
  const f = parseDate(term.firstDay);
  const l = parseDate(term.lastDay);
  const snapshot = term.snapshot;

  return (
    <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 6 }}>
      <button
        onClick={() => snapshot && setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          width: "100%",
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
    <div data-tour="settings-catalogs" className="card" style={{ marginBottom: "1rem" }}>
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

// The model picker: friendly names + a "why choose this" line, no raw model IDs.
// Persisted via modelPref; the Generate page reads it when she generates.
function ModelSection() {
  const { keys } = useAuth();
  const { client } = useTerm();
  const [choiceId, setChoiceId] = useState<string>(getModelChoiceId);
  const choose = (id: string) => {
    setChoiceId(id);
    setModelChoiceId(id);
  };
  // Compare the live prompt size to the size the cost estimates were measured
  // against; a large drift means they've gone stale (re-measure needed).
  const [promptChars, setPromptChars] = useState<number | null>(null);
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void (async () => {
      try {
        const [p, golden, feedbackRules] = await Promise.all([
          loadPromptSet(client, "regular"),
          loadGoldenExamples(client).catch(() => ""),
          loadFeedbackRules(client).catch(() => ""),
        ]);
        if (!cancelled) setPromptChars(promptSetChars({ ...p, golden, feedbackRules }));
      } catch {
        // Leave null — just show the measured-on date without a drift hint.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);
  const estimatesStale =
    promptChars !== null &&
    Math.abs(promptChars - BASELINE_PROMPT_CHARS) / BASELINE_PROMPT_CHARS > PROMPT_DRIFT_THRESHOLD;
  const measuredOn = parseDate(MEASURED_ON);
  // Weekly note volume drives the yearly estimate; persisted so it sticks.
  const [notesPerWeek, setNotesPerWeek] = useState<number>(() => {
    const v = Number(storage.get(StorageKeys.notesPerWeek));
    return Number.isFinite(v) && v > 0 ? v : 40;
  });
  const setVolume = (v: number) => {
    const clean = Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
    setNotesPerWeek(clean);
    if (clean > 0) storage.set(StorageKeys.notesPerWeek, String(clean));
  };
  const selected = MODEL_CHOICES.find((c) => c.id === choiceId);
  const needsOpenAIKey = selected?.provider === "openai" && !keys?.openaiApiKey;
  return (
    <div data-tour="settings-model" className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Model</h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>
        Which AI writes the notes. You can switch anytime — try a few and keep what reads best. Each shows the
        rough cost per note and the estimated cost per year.
      </p>
      <label
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}
      >
        Yearly estimate assumes
        <input
          className="input"
          type="number"
          min={1}
          value={notesPerWeek || ""}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ width: 50, padding: "2px 6px", fontSize: 13, textAlign: "center" }}
        />
        notes per week.
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MODEL_CHOICES.map((c) => {
          const on = c.id === choiceId;
          const perNote = perNoteCostLabel(c);
          const annual = notesPerWeek > 0 ? annualCostLabel(c, notesPerWeek) : null;
          const priceLabel = perNote
            ? annual
              ? `${perNote}/note ≈ ${annual}`
              : `${perNote}/note`
            : null;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => choose(c.id)}
              style={{
                textAlign: "left",
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: "var(--border-radius-md)",
                cursor: "pointer",
                border: on ? "1px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)",
                background: on ? "var(--color-background-info)" : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{
                  marginTop: 3,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: on
                    ? "4px solid var(--color-text-info)"
                    : "1.5px solid var(--color-border-secondary)",
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 500, fontSize: 14, color: "var(--color-text-primary)" }}>{c.label}</span>
                  {priceLabel && (
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 400,
                        color: "var(--color-text-tertiary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {priceLabel}
                    </span>
                  )}
                </span>
                <span style={{ display: "block", fontSize: 12.5, color: "var(--color-text-secondary)" }}>
                  {c.blurb}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {needsOpenAIKey && (
        <p className="field-hint" style={{ color: "var(--color-text-danger)", marginTop: 10 }}>
          Add your OpenAI key below to use this model.
        </p>
      )}
      <p className="field-hint" style={{ marginTop: 10 }}>
        Cost estimates measured{" "}
        {measuredOn ? `${formatShort(measuredOn)}, ${measuredOn.getFullYear()}` : MEASURED_ON}.
        {estimatesStale && (
          <span style={{ color: "var(--color-text-danger)" }}>
            {" "}
            Your prompts have changed a lot since then, so these may be off — reach out to Mara to update the prices.
          </span>
        )}
      </p>
    </div>
  );
}

function KeysSection() {
  const { keys, updateKeys, githubTokenSavedOn } = useAuth();
  const { tokenInvalid } = useTerm();
  const githubStatus = tokenInvalid
    ? { label: "Expired", tone: "danger" as const }
    : isTokenRenewalDue(githubTokenSavedOn)
      ? { label: "Renewal due", tone: "warning" as const }
      : undefined;
  return (
    <div id="settings-keys" className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Keys</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <KeyRow
          label="Anthropic API key"
          value={keys?.anthropicApiKey ?? ""}
          placeholder="sk-ant-…"
          creditsUrl={PROVIDER_META.anthropic.creditsUrl}
          createUrl="https://console.anthropic.com/settings/keys"
          createLabel="Get a key"
          validate={(v) => validateKey("anthropic", v)}
          onSave={(v) => updateKeys({ anthropicApiKey: v })}
        />
        <KeyRow
          label="OpenAI API key"
          value={keys?.openaiApiKey ?? ""}
          placeholder="sk-…"
          creditsUrl={PROVIDER_META.openai.creditsUrl}
          createUrl="https://platform.openai.com/api-keys"
          createLabel="Get a key"
          validate={(v) => validateKey("openai", v)}
          onSave={(v) => updateKeys({ openaiApiKey: v })}
        />
        <KeyRow
          label="GitHub personal access token"
          value={keys?.githubToken ?? ""}
          placeholder="github_pat_… or ghp_…"
          status={githubStatus}
          createUrl="https://github.com/settings/tokens/new?scopes=repo&description=Carryover"
          createLabel="Create a token"
          validate={(v) => validateGitHubToken(v, REPO_CONFIG.owner, REPO_CONFIG.repo)}
          onSave={(v) => updateKeys({ githubToken: v })}
        />
      </div>
      <p className="field-hint" style={{ marginTop: 12 }}>
        Stored only in this browser. Use the credit links to keep an eye on each account's balance.
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
  if (err instanceof AnthropicError || err instanceof OpenAIError) return `Key rejected: ${err.message}`;
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
  creditsUrl,
  createUrl,
  createLabel,
  status,
  validate,
  onSave,
}: {
  label: string;
  value: string;
  placeholder: string;
  creditsUrl?: string;
  createUrl?: string;
  createLabel?: string;
  status?: { label: string; tone: "warning" | "danger" };
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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
          <label className="label">{label}</label>
          {status && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "1px 7px",
                borderRadius: 999,
                background:
                  status.tone === "danger"
                    ? "var(--color-background-danger)"
                    : "var(--color-background-warning)",
                color:
                  status.tone === "danger"
                    ? "var(--color-text-danger)"
                    : "var(--color-text-warning)",
              }}
            >
              {status.label}
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 12 }}>
          {createUrl && (
            <a
              href={createUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              {createLabel ?? "Get one"} <Icon name="external-link" size={11} />
            </a>
          )}
          {creditsUrl && (
            <a
              href={creditsUrl}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              Check your credits <Icon name="external-link" size={11} />
            </a>
          )}
        </span>
      </div>
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
    <div data-tour="settings-export" className="card" style={{ marginBottom: "1rem" }}>
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

// Replay the guided tour. Starting it navigates to Today (the tour highlights the
// nav bar) so the user sees the first step in context.
function HelpSection({ onNavigate }: { onNavigate: (page: NavPage) => void }) {
  const { start } = useTutorial();
  const { demoMode, enterDemoMode } = useAuth();
  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Tutorial &amp; demo</h3>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 12 }}>
        <p style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          Take the guided tour of the app again.
        </p>
        <button
          className="button button--small"
          onClick={() => {
            start();
            onNavigate("today");
          }}
        >
          Replay tutorial
        </button>
      </div>
      {!demoMode && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <p style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
            Explore a sandbox with sample data — your real data stays untouched.
          </p>
          <button
            className="button button--small"
            onClick={() => {
              enterDemoMode();
              onNavigate("today");
            }}
          >
            Try demo mode
          </button>
        </div>
      )}
    </div>
  );
}

// Recent errors & crashes, captured locally (clients/errorLog) and never sent
// anywhere on their own. Lets the clinician copy a report to whoever supports the
// app when something breaks. Always shown, so a clean run reads as reassurance.
function DiagnosticsSection() {
  const [reports, setReports] = useState<ErrorReport[]>(getErrorLog);
  const [copied, setCopied] = useState(false);

  const copyAll = () => {
    void navigator.clipboard.writeText(errorLogText(reports));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const clearAll = () => {
    clearErrorLog();
    setReports([]);
  };

  if (reports.length === 0) {
    return (
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h3 className="card__title">Diagnostics</h3>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          No errors have been detected. If something goes wrong, it'll show up here so you can send
          the report to Mara.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <h3 className="card__title">Diagnostics</h3>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14 }}>
        {reports.length} recent {reports.length === 1 ? "error was" : "errors were"} recorded on
        this device. If something isn't working, copy the report and send it to Mara. Nothing here is shared automatically.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxHeight: 180,
          overflowY: "auto",
          marginBottom: 14,
          fontSize: 12,
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--color-text-secondary)",
        }}
      >
        {reports.map((r, i) => (
          <div key={i} title={`${r.at} · ${r.url} · ${r.appVersion}`}>
            <span style={{ color: "var(--color-text-tertiary)" }}>{r.at.slice(0, 16).replace("T", " ")}</span>{" "}
            {r.name}: {r.message.slice(0, 120)}
            {(r.count ?? 1) > 1 && (
              <span
                style={{
                  marginLeft: 6,
                  padding: "0 6px",
                  borderRadius: 999,
                  background: "var(--color-background-pill)",
                  color: "var(--color-text-secondary)",
                }}
              >
                ×{r.count}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a className="button button--small" href={errorMailto(reports)}>
          Email report
        </a>
        <button className="button button--small" onClick={copyAll}>
          {copied ? "Copied ✓" : "Copy report"}
        </button>
        <button className="button button--small" onClick={clearAll}>
          Clear
        </button>
      </div>
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
