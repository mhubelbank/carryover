// GitHub REST API client for the data repo. Authenticates with a fine-grained
// PAT scoped to a single repository, owner+repo are hardcoded at the call site.

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

export interface RepoInfo {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface FileContent {
  // Decoded file contents (assumes UTF-8 text).
  text: string;
  // The blob SHA of the current version. Required for safe overwrites.
  sha: string;
}

export class GitHubError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

interface GitHubClientOptions {
  token: string;
  owner: string;
  repo: string;
}

export class GitHubClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;

  constructor({ token, owner, repo }: GitHubClientOptions) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": API_VERSION,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) detail = body.message;
      } catch {
        // Not JSON; ignore.
      }
      throw new GitHubError(detail, res.status);
    }

    return (await res.json()) as T;
  }

  async getRepo(): Promise<RepoInfo> {
    const data = await this.request<{
      full_name: string;
      default_branch: string;
      private: boolean;
    }>(`/repos/${this.owner}/${this.repo}`);
    return {
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      private: data.private,
    };
  }

  async readFile(path: string): Promise<FileContent | null> {
    try {
      const data = await this.request<{ content: string; sha: string; encoding: string }>(
        `/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`,
      );
      const text =
        data.encoding === "base64"
          ? new TextDecoder().decode(
              Uint8Array.from(atob(data.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)),
            )
          : data.content;
      return { text, sha: data.sha };
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return null;
      throw err;
    }
  }

  // Write or overwrite a single file. If `sha` is omitted, this creates a new
  // file. Pass the sha from a prior readFile to update an existing file safely.
  async writeFile(
    path: string,
    content: string,
    message: string,
    sha?: string,
  ): Promise<void> {
    const b64 = btoa(unescape(encodeURIComponent(content)));
    await this.request(`/repos/${this.owner}/${this.repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: b64,
        ...(sha ? { sha } : {}),
      }),
    });
  }
}

// Validates the token can read the target repo. We don't write here because
// many actions only require read; write failures surface naturally on save.
export async function validateGitHubToken(
  token: string,
  owner: string,
  repo: string,
): Promise<RepoInfo> {
  const client = new GitHubClient({ token, owner, repo });
  return await client.getRepo();
}
