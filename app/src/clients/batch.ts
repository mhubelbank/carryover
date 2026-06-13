// A lightweight, per-day "batch" of sessions she queues up and generates together
// to keep the prompt cache warm (and costs low). Membership only — the actual form
// inputs live in Generate's per-session snapshots; the batch stepper is where any
// blanks get filled. Persisted as one localStorage blob: { [date]: ["teacherId|timeSlot", …] }.

import { storage, StorageKeys } from "./storage";

type BatchMap = Record<string, string[]>;

// Session ref within a day, "teacherId|timeSlot".
function ref(teacherId: string, timeSlot: string): string {
  return `${teacherId}|${timeSlot}`;
}

function readAll(): BatchMap {
  try {
    const s = storage.get(StorageKeys.sessionBatch);
    return s ? (JSON.parse(s) as BatchMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: BatchMap): void {
  storage.set(StorageKeys.sessionBatch, JSON.stringify(map));
}

export function getBatch(date: string): string[] {
  return readAll()[date] ?? [];
}

export function isInBatch(date: string, teacherId: string, timeSlot: string): boolean {
  return getBatch(date).includes(ref(teacherId, timeSlot));
}

export function addToBatch(date: string, teacherId: string, timeSlot: string): void {
  const map = readAll();
  const r = ref(teacherId, timeSlot);
  const list = map[date] ?? [];
  if (list.includes(r)) return; // dedupe
  map[date] = [...list, r];
  writeAll(map);
}

export function removeFromBatch(date: string, teacherId: string, timeSlot: string): void {
  const map = readAll();
  const list = map[date];
  if (!list) return;
  const next = list.filter((x) => x !== ref(teacherId, timeSlot));
  if (next.length === 0) delete map[date];
  else map[date] = next;
  writeAll(map);
}

export function clearBatch(date: string): void {
  const map = readAll();
  if (!(date in map)) return;
  delete map[date];
  writeAll(map);
}
