// Which provider pipeline the user picked (Claude / ChatGPT), persisted in
// localStorage. Non-secret, so it lives here (not in AuthContext alongside the
// keys). Read at generation time and in Settings; the Generate page reads it fresh
// on each visit.
import { storage, StorageKeys } from "./storage";
import { DEFAULT_PIPELINE, PIPELINES, type PipelineId } from "./models";

// Map a stored value to a pipeline id. Handles legacy single-model choices saved
// before the switch (e.g. "claude-sonnet", "chatgpt-pro") by routing them to their
// provider's pipeline, so existing users keep a sensible default.
function toPipelineId(v: string | null): PipelineId | null {
  if (!v) return null;
  if (PIPELINES.some((p) => p.id === v)) return v as PipelineId;
  if (v.startsWith("chatgpt") || v.startsWith("gpt")) return "chatgpt";
  if (v.startsWith("claude")) return "claude";
  return null;
}

export function getPipelineId(): PipelineId {
  return toPipelineId(storage.get(StorageKeys.modelChoice)) ?? DEFAULT_PIPELINE;
}

export function setPipelineId(id: PipelineId): void {
  storage.set(StorageKeys.modelChoice, id);
}
