// Shared helpers for the eval scripts (run via tsx, not in the browser).
//
// Both scripts call the real generation pipeline, so they need:
//   ANTHROPIC_API_KEY   — generation
//   prompts             — either GITHUB_TOKEN (fetch from the private data repo)
//                         or PROMPTS_DIR (local prompt files, for fast iteration)
// Data-repo coords default to the live private repo; override via env.
import { existsSync, readFileSync } from "node:fs";
import { GitHubClient } from "../src/clients/github";
import { loadGoldenExamples } from "../src/domain/data";
import { loadPromptSet, type PromptSet } from "../src/domain/notes";
import type { Mode } from "../src/domain/teacher";

// Load a gitignored .env.local so the eval scripts pick up keys without exporting
// them on every run. Checks the app dir (scripts' cwd) then the repo root. Real
// environment variables win — we never overwrite an already-set var. Returns the
// file we loaded, or null if none exists.
function loadEnvLocal(): string | null {
  for (const path of [".env.local", "../.env.local"]) {
    if (!existsSync(path)) continue;
    for (const raw of readFileSync(path, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = val;
    }
    return path;
  }
  return null;
}
const ENV_FILE = loadEnvLocal();

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing required env var: ${name}`);
    console.error(
      ENV_FILE
        ? `  Add ${name}=… to ${ENV_FILE}.`
        : `  Create app/.env.local (copy app/.env.example) and add ${name}=…, or export it.`,
    );
    process.exit(1);
  }
  return v;
}

function dataClient(): GitHubClient | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return new GitHubClient({
    token,
    owner: process.env.DATA_OWNER ?? "mhubelbank",
    repo: process.env.DATA_REPO ?? "carryover-data",
    branch: process.env.DATA_BRANCH ?? "main",
  });
}

// Prompt templates for a mode — local dir if PROMPTS_DIR is set, else fetched
// from the private data repo (needs GITHUB_TOKEN).
export async function getPrompts(mode: Mode): Promise<PromptSet> {
  const dir = process.env.PROMPTS_DIR;
  if (dir) {
    const read = (pass: string) => readFileSync(`${dir}/${mode}-${pass}.md`, "utf8");
    return { draft: read("draft"), review: read("review"), streamline: read("streamline") };
  }
  const client = dataClient();
  if (!client) {
    console.error("✗ Set GITHUB_TOKEN (fetch prompts from the data repo) or PROMPTS_DIR (local files).");
    process.exit(1);
  }
  return loadPromptSet(client, mode);
}

// Golden examples (style guide appended to the draft prompt in production).
export async function getGolden(): Promise<string> {
  const client = dataClient();
  if (!client) return "";
  return loadGoldenExamples(client).catch(() => "");
}

// Run `fn` over `items` with bounded concurrency, preserving input order.
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
