// GitHub REST API client for the data repo. Authenticates with a fine-grained
// PAT scoped to a single repository, owner+repo are hardcoded at the call site.

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";

// Encode each path segment but keep "/" separators — the contents API wants
// real slashes in the URL path, not a percent-encoded %2F.
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

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

export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
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
  // Branch to read/write. Omit to use the repo's default branch.
  branch?: string;
}

export class GitHubClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly branch?: string;
  // Memoized "branch exists (creating it if needed)" check, run once per client.
  private branchReady: Promise<void> | null = null;

  constructor({ token, owner, repo, branch }: GitHubClientOptions) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  // The ?ref= suffix that pins reads to our branch (empty for the default).
  private refQuery(): string {
    return this.branch ? `?ref=${encodeURIComponent(this.branch)}` : "";
  }

  // Ensure the data branch exists, creating it from the default branch's head if
  // absent (so data already committed to the default branch carries over). No-op
  // when using the default branch. Memoized so it runs once per client. Called
  // before the first read and the first write.
  ensureBranch(): Promise<void> {
    if (!this.branch) return Promise.resolve();
    if (!this.branchReady) this.branchReady = this.createBranchIfMissing();
    return this.branchReady;
  }

  private async createBranchIfMissing(): Promise<void> {
    const branch = encodeURIComponent(this.branch!);
    try {
      await this.request(`/repos/${this.owner}/${this.repo}/git/ref/heads/${branch}`);
      return;
    } catch (err) {
      if (!(err instanceof GitHubError && err.status === 404)) throw err;
    }
    const repoInfo = await this.getRepo();
    const base = await this.request<{ object: { sha: string } }>(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${encodeURIComponent(repoInfo.defaultBranch)}`,
    );
    await this.request(`/repos/${this.owner}/${this.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${this.branch}`, sha: base.object.sha }),
    });
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
        `/repos/${this.owner}/${this.repo}/contents/${encodePath(path)}${this.refQuery()}`,
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

  // List a directory's immediate entries. Returns [] when the directory does
  // not exist (e.g., no sessions yet), so callers treat "missing" as "empty".
  async listDir(path: string): Promise<DirEntry[]> {
    try {
      const data = await this.request<Array<{ name: string; path: string; type: string }>>(
        `/repos/${this.owner}/${this.repo}/contents/${encodePath(path)}${this.refQuery()}`,
      );
      if (!Array.isArray(data)) return [];
      return data.map((entry) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type === "dir" ? "dir" : "file",
      }));
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return [];
      throw err;
    }
  }

  // Write or overwrite a single file. If `sha` is omitted, this creates a new
  // file. Pass the sha from a prior readFile to update an existing file safely.
  // Returns the new blob sha, needed for the next safe overwrite of this file.
  async writeFile(
    path: string,
    content: string,
    message: string,
    sha?: string,
  ): Promise<string> {
    await this.ensureBranch();
    try {
      return await this.putFile(path, content, message, sha);
    } catch (err) {
      // Optimistic-concurrency recovery. A cached sha goes stale when the file
      // changed on the branch since it was loaded — a prior save this session, a
      // data-branch sync, or another device. GitHub then returns 409 ("… does
      // not match …") for a stale sha, or 422 for a create (`sha` omitted) that
      // collides with a file that now exists. In both cases, refetch the current
      // sha and retry once: last-write-wins, which is correct for this
      // single-user app and far better than a dead-end save error. A 422 with a
      // sha already supplied is a real validation error — don't mask it.
      const recoverable =
        err instanceof GitHubError && (err.status === 409 || (err.status === 422 && sha == null));
      if (!recoverable) throw err;
      const current = await this.readFile(path);
      return await this.putFile(path, content, message, current?.sha);
    }
  }

  private async putFile(
    path: string,
    content: string,
    message: string,
    sha?: string,
  ): Promise<string> {
    const b64 = btoa(unescape(encodeURIComponent(content)));
    const res = await this.request<{ content: { sha: string } }>(
      `/repos/${this.owner}/${this.repo}/contents/${encodePath(path)}`,
      {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: b64,
          ...(sha ? { sha } : {}),
          ...(this.branch ? { branch: this.branch } : {}),
        }),
      },
    );
    return res.content.sha;
  }

  // Delete a file. Requires the current blob sha. A missing file (404) is
  // treated as already-deleted rather than an error.
  async deleteFile(path: string, message: string, sha: string): Promise<void> {
    await this.ensureBranch();
    try {
      await this.request(`/repos/${this.owner}/${this.repo}/contents/${encodePath(path)}`, {
        method: "DELETE",
        body: JSON.stringify({
          message,
          sha,
          ...(this.branch ? { branch: this.branch } : {}),
        }),
      });
    } catch (err) {
      if (err instanceof GitHubError && err.status === 404) return;
      throw err;
    }
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
