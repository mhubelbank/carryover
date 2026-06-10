import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { validateApiKey, AnthropicError } from "../clients/anthropic";
import { validateGitHubToken, GitHubError } from "../clients/github";
import { REPO_CONFIG, useAuth } from "../context/AuthContext";

// Inline code style for the literal token settings shown in the GitHub field.
const monoStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  background: "var(--color-background-secondary)",
  padding: "1px 5px",
  borderRadius: 4,
};

type ValidationState = "idle" | "validating" | "error";

export function Welcome() {
  const { signIn } = useAuth();
  const [anthropicKey, setAnthropicKey] = useState("");
  const [githubKey, setGithubKey] = useState("");
  const [state, setState] = useState<ValidationState>("idle");
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    anthropicKey.trim().length > 0 && githubKey.trim().length > 0 && state !== "validating";

  async function handleSubmit() {
    setState("validating");
    setError(null);
    try {
      // Validate both keys in parallel — fail fast and show whichever broke.
      await Promise.all([
        validateApiKey(anthropicKey.trim()),
        validateGitHubToken(githubKey.trim(), REPO_CONFIG.owner, REPO_CONFIG.repo),
      ]);
      signIn({
        anthropicApiKey: anthropicKey.trim(),
        // OpenAI is optional and added later in Settings if she wants a ChatGPT model.
        openaiApiKey: "",
        githubToken: githubKey.trim(),
      });
    } catch (err) {
      setState("error");
      if (err instanceof AnthropicError) {
        setError(`Anthropic key rejected: ${err.message}`);
      } else if (err instanceof GitHubError) {
        setError(`GitHub token rejected: ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
  }

  return (
    <div className="shell" style={{ maxWidth: 640 }}>
      <div className="card" style={{ padding: "2rem 2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Icon name="notebook" size={22} />
          <h1 style={{ fontSize: 22 }}>Welcome to Carryover</h1>
        </div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.75rem" }}>
          Add two keys, then you'll start adding students.
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
          hint="Stored only in this browser. Set a monthly spend cap in your Anthropic dashboard for safety."
          placeholder="sk-ant-..."
          value={anthropicKey}
          onChange={setAnthropicKey}
        />

        <KeyField
          number={2}
          title="GitHub personal access token"
          help={
            <>
              So your roster and notes save between sessions.{" "}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Carryover"
                target="_blank"
                rel="noreferrer"
              >
                Create one <Icon name="external-link" size={12} />
              </a>{" "}
              — this opens the classic-token form with the scope pre-selected. Just confirm:
              <ul
                style={{
                  margin: "8px 0 0 0",
                  paddingLeft: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <li>Expiration: 1 year (renew each summer at term setup)</li>
                <li>Scope: <span style={monoStyle}>repo</span> is checked</li>
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

interface KeyFieldProps {
  number: number;
  title: string;
  help: ReactNode;
  hint: ReactNode;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

function KeyField({ number, title, help, hint, placeholder, value, onChange }: KeyFieldProps) {
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
          <p style={{ fontWeight: 500, fontSize: 15 }}>{title}</p>
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
