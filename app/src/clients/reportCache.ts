// Generated progress-report narratives are never stored in the data repo (same
// privacy stance as notes). They live here, in IndexedDB, so a refresh restores
// the last-generated report without re-calling the LLM. The numeric/chart half is
// always recomputed from live data — only the narrative text is cached.
//
// Its own database (separate from noteCache's "sesis" DB) so the two can evolve
// their schemas independently without version coordination. Safe to wipe.

export interface CachedReport {
  // `${studentId}|${rangeStart}|${rangeEnd}` — one entry per student/date-range.
  id: string;
  studentId: string;
  rangeStart: string;
  rangeEnd: string;
  summary: string; // overall opening paragraph
  goals: Record<string, string>; // goalId -> narrative paragraph
  generatedAt: number;
}

const DB_NAME = "sesis-reports";
const STORE = "reports";

export function reportCacheKey(studentId: string, rangeStart: string, rangeEnd: string): string {
  return `${studentId}|${rangeStart}|${rangeEnd}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveReport(report: CachedReport): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(report);
    });
  } finally {
    db.close();
  }
}

export async function getReport(id: string): Promise<CachedReport | null> {
  const db = await openDb();
  try {
    return await new Promise<CachedReport | null>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as CachedReport) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearReports(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).clear();
    });
  } finally {
    db.close();
  }
}
