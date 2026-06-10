// Which curated model the user picked, persisted in localStorage. Non-secret, so
// it lives here (not in AuthContext alongside the keys). Read at generation time
// and in Settings; the Generate page reads it fresh on each visit.
import { storage, StorageKeys } from "./storage";
import { DEFAULT_MODEL_CHOICE, MODEL_CHOICES } from "./models";

export function getModelChoiceId(): string {
  const v = storage.get(StorageKeys.modelChoice);
  return v && MODEL_CHOICES.some((c) => c.id === v) ? v : DEFAULT_MODEL_CHOICE;
}

export function setModelChoiceId(id: string): void {
  storage.set(StorageKeys.modelChoice, id);
}
