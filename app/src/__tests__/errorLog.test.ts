import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  scrubSecrets,
  recordError,
  getErrorLog,
  clearErrorLog,
  errorLogText,
} from "../clients/errorLog";

// The log persists through the localStorage wrapper; tests run in node, so stand up
// a tiny in-memory localStorage before touching it.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

describe("scrubSecrets", () => {
  it("redacts API keys and tokens, leaves ordinary text alone", () => {
    expect(scrubSecrets("key sk-ant-abcd1234EFGH5678 failed")).toBe("key [redacted] failed");
    expect(scrubSecrets("Authorization: Bearer abc123.def456.ghi789")).toContain("[redacted]");
    expect(scrubSecrets("token ghp_0123456789ABCDEFabcdef0123456789ABCD")).toBe("token [redacted]");
    expect(scrubSecrets("Cannot read properties of undefined (reading 'map')")).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
  });
});

describe("error log ring buffer", () => {
  beforeEach(() => clearErrorLog());

  it("records the newest error first and scrubs the message", () => {
    recordError({ kind: "error", error: new Error("boom with sk-ant-secretsecretsecret token") });
    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.kind).toBe("error");
    expect(log[0]!.message).toBe("boom with [redacted] token");
    expect(log[0]!.message).not.toContain("secretsecret");
  });

  it("caps the log at 5 distinct errors, newest first", () => {
    for (let i = 0; i < 30; i++) recordError({ kind: "error", error: new Error(`e${i}`) });
    const log = getErrorLog();
    expect(log).toHaveLength(5);
    expect(log[0]!.message).toBe("e29"); // newest first
    expect(log.at(-1)?.message).toBe("e25"); // only the last 5 kept
  });

  it("dedups on message: a repeat bumps the count and floats to the top", () => {
    recordError({ kind: "error", error: new Error("boom") });
    recordError({ kind: "error", error: new Error("other") });
    recordError({ kind: "error", error: new Error("boom") });
    const log = getErrorLog();
    expect(log).toHaveLength(2); // "boom" not duplicated
    expect(log[0]!.message).toBe("boom");
    expect(log[0]!.count).toBe(2);
    expect(log[1]!.message).toBe("other");
    expect(log[1]!.count).toBe(1);
  });

  it("renders a plain-text report", () => {
    recordError({ kind: "render", error: new Error("kaboom") });
    expect(errorLogText(getErrorLog())).toContain("render: Error: kaboom");
    expect(errorLogText([])).toBe("No errors recorded.");
  });
});
