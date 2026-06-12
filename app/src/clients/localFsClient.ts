// A localStorage-backed "filesystem" that implements the same DataClient surface
// as GitHubClient (readFile/listDir/writeFile/deleteFile). Used by Demo mode so the
// entire domain data layer (domain/data.ts) reads and writes a sandbox in the
// visitor's own browser instead of the GitHub data repo — nothing leaves the
// device, and a Reset wipes it. Paths are stored verbatim (e.g. "data/students.csv")
// keyed in one JSON blob under StorageKeys.demoFs.
import { storage, StorageKeys } from "./storage";
import type { DataClient, DirEntry, FileContent } from "./github";

interface FsState {
  files: Record<string, FileContent>;
  seq: number; // monotonic counter backing fake blob shas
}

function load(): FsState {
  try {
    const raw = storage.get(StorageKeys.demoFs);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.files) return parsed as FsState;
    }
  } catch {
    // fall through to empty
  }
  return { files: {}, seq: 0 };
}

function save(state: FsState): void {
  storage.set(StorageKeys.demoFs, JSON.stringify(state));
}

export function clearDemoFs(): void {
  storage.remove(StorageKeys.demoFs);
}

export class LocalFsClient implements DataClient {
  async readFile(path: string): Promise<FileContent | null> {
    return load().files[path] ?? null;
  }

  // Immediate children of `path` (one level), mirroring GitHub's contents API.
  async listDir(path: string): Promise<DirEntry[]> {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const { files } = load();
    const seen = new Set<string>();
    const out: DirEntry[] = [];
    for (const full of Object.keys(files)) {
      if (!full.startsWith(prefix)) continue;
      const rest = full.slice(prefix.length);
      const slash = rest.indexOf("/");
      const name = slash === -1 ? rest : rest.slice(0, slash);
      const entryPath = `${prefix}${name}`;
      if (seen.has(entryPath)) continue;
      seen.add(entryPath);
      out.push({ name, path: entryPath, type: slash === -1 ? "file" : "dir" });
    }
    return out;
  }

  async writeFile(path: string, content: string, _message: string, _sha?: string): Promise<string> {
    const state = load();
    state.seq += 1;
    const sha = `demo-${state.seq}`;
    state.files[path] = { text: content, sha };
    save(state);
    return sha;
  }

  async deleteFile(path: string, _message: string, _sha: string): Promise<void> {
    const state = load();
    delete state.files[path];
    save(state);
  }
}
