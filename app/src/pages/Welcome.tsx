import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { validateApiKey, AnthropicError } from "../clients/anthropic";
import { validateOpenAIKey, OpenAIError } from "../clients/openai";
import { validateGitHubToken, GitHubError } from "../clients/github";
import { REPO_CONFIG, useAuth } from "../context/AuthContext";
import { useTutorial } from "../context/TutorialContext";

// Inline code style for the literal token settings shown in the GitHub field.
const monoStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  background: "var(--color-background-secondary)",
  padding: "1px 5px",
  borderRadius: 4,
};

type ValidationState = "idle" | "validating" | "error";

export function Welcome() {
  const { signIn, enterDemoMode } = useAuth();
  const { start: startTutorial } = useTutorial();
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [githubKey, setGithubKey] = useState("");
  const [state, setState] = useState<ValidationState>("idle");
  const [error, setError] = useState<string | null>(null);
  // First screen is a role fork: the SLP (real user) goes to key setup; everyone
  // else drops straight into the demo. Keeps the demo from hiding under the form.
  const [view, setView] = useState<"choose" | "setup">("choose");

  // OpenAI is optional — the default model is Claude, so don't gate sign-in on it.
  const canSubmit =
    anthropicKey.trim().length > 0 && githubKey.trim().length > 0 && state !== "validating";

  async function handleSubmit() {
    setState("validating");
    setError(null);
    try {
      // Validate the keys in parallel — fail fast and show whichever broke. The
      // OpenAI key is only checked if she entered one.
      const checks: Promise<unknown>[] = [
        validateApiKey(anthropicKey.trim()),
        validateGitHubToken(githubKey.trim(), REPO_CONFIG.owner, REPO_CONFIG.repo),
      ];
      if (openaiKey.trim()) checks.push(validateOpenAIKey(openaiKey.trim()));
      await Promise.all(checks);
      signIn({
        anthropicApiKey: anthropicKey.trim(),
        openaiApiKey: openaiKey.trim(),
        githubToken: githubKey.trim(),
      });
    } catch (err) {
      setState("error");
      if (err instanceof AnthropicError) {
        setError(`Anthropic key rejected: ${err.message}`);
      } else if (err instanceof OpenAIError) {
        setError(`OpenAI key rejected: ${err.message}`);
      } else if (err instanceof GitHubError) {
        setError(`GitHub token rejected: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }

  if (view === "choose") {
    return (
      <div className="shell" style={{ maxWidth: 560 }}>
        <div className="card" style={{ padding: "2rem 2.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <Icon name="notebook" size={22} />
            <h1 style={{ fontSize: 22 }}>Welcome to Carryover</h1>
          </div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.75rem" }}>
            An assistant for speech-language session notes. Are you setting it up, or just taking a
            look?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <RoleButton
              primary
              icon="school"
              title="I'm a speech-language pathologist"
              subtitle="Set up Carryover with your own keys"
              onClick={() => setView("setup")}
            />
            <RoleButton
              icon="search"
              title="Someone else — just exploring"
              subtitle="Try the demo with sample data"
              onClick={() => {
                startTutorial();
                enterDemoMode();
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell" style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: "2rem 2.5rem" }}>
        <button
          type="button"
          onClick={() => setView("choose")}
          style={{
            border: "none",
            background: "none",
            padding: 0,
            marginBottom: 14,
            font: "inherit",
            fontSize: 13,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Icon name="notebook" size={22} />
          <h1 style={{ fontSize: 22 }}>Set up Carryover</h1>
        </div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.75rem" }}>
          Add your keys, then you'll start adding students.
        </p>

        <KeyField
          number={1}
          title="Anthropic API key"
          help={
            <>
              For generating notes and categorizing goals.{" "}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                Get one <Icon name="external-link" size={12} />
              </a>
            </>
          }
          hint={
            <>
              Stored only in this browser. Set a{" "}
              <a href="https://console.anthropic.com/settings/limits" target="_blank" rel="noreferrer">
                monthly spend cap
              </a>{" "}
              for safety (recommended: $15).
            </>
          }
          placeholder="sk-ant-..."
          value={anthropicKey}
          onChange={setAnthropicKey}
        />

        <KeyField
          number={2}
          optional
          title="OpenAI API key"
          help={
            <>
              Optional — only needed if you switch to a ChatGPT model in Settings. You can add it
              now or later.{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
                Get one <Icon name="external-link" size={12} />
              </a>
            </>
          }
          hint={
            <>
              Stored only in this browser. Set a{" "}
              <a
                href="https://platform.openai.com/settings/organization/limits"
                target="_blank"
                rel="noreferrer"
              >
                monthly spend cap
              </a>{" "}
              for safety (recommended: $15).
            </>
          }
          placeholder="sk-..."
          value={openaiKey}
          onChange={setOpenaiKey}
        />

        <KeyField
          number={3}
          title="GitHub personal access token"
          help={
            <>
              Save your roster to a private repository.{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Carryover"
                target="_blank"
                rel="noreferrer"
              >
                Create one <Icon name="external-link" size={12} />
              </a> with properties:{" "}
              <ul
                style={{
                  margin: "8px 0 0 0",
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <li>Expiration: <span style={monoStyle}>06/01/2027</span> (renew each summer)</li>
                <li>Scope: <span style={monoStyle}>repo</span> should already be checked</li>
              </ul>
            </>
          }
          hint={
            <>
              Saves to{" "}
              <span style={monoStyle}>
                {REPO_CONFIG.owner}/{REPO_CONFIG.repo}
              </span>{" "}
              · stored only in this browser.
            </>
          }
          placeholder="ghp_..."
          value={githubKey}
          onChange={setGithubKey}
        />

        {error && (
          <p
            role="alert"
            style={{
              marginTop: "1rem",
              fontSize: 13,
              color: "var(--color-text-danger)",
            }}
          >
            {error}
          </p>
        )}

        <div style={{ marginTop: "1.75rem", display: "flex", justifyContent: "flex-end" }}>
          <button
            className="button button--primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {state === "validating" ? "Validating…" : "Save and continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// A large, full-width option on the role-chooser screen: a bold title over a
// muted one-line description.
function RoleButton({
  icon,
  title,
  subtitle,
  primary,
  onClick,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        width: "100%",
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: "var(--border-radius-md)",
        border: primary
          ? "1px solid var(--color-text-info)"
          : "0.5px solid var(--color-border-secondary)",
        background: primary ? "var(--color-background-info)" : "transparent",
        cursor: "pointer",
      }}
    >
      <span style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>
        <Icon name={icon} size={24} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)" }}>
          {title}
        </span>
        <span style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginTop: 2 }}>
          {subtitle}
        </span>
      </span>
    </button>
  );
}

interface KeyFieldProps {
  number: number;
  title: string;
  optional?: boolean;
  help: ReactNode;
  hint: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function KeyField({ number, title, optional, help, hint, placeholder, value, onChange }: KeyFieldProps) {
  return (
    <div
      style={{
        border: "0.5px solid var(--color-border-tertiary)",
        borderRadius: "var(--border-radius-md)",
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--color-background-info)",
            color: "var(--color-text-info)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 500,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {number}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 500, fontSize: 15 }}>
            {title}
            {optional && (
              <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)" }}> (optional)</span>
            )}
          </p>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
            {help}
          </div>
        </div>
      </div>
      <input
        className="input"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="field-hint">{hint}</p>
    </div>
  );
}
