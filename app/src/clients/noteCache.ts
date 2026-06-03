// Generated note narrative is never stored in the repo (only session metadata
// is). It lives here, in IndexedDB, so copy-all / regenerate / recent-notes
// export keep working across page navigation, and survive a refresh. This is a
// convenience cache — safe to wipe (Settings → Reset session cache).

export interface CachedNote {
  // `${date}|${teacherId}|${timeSlot}|${studentId}` — one note per student/session.
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  timeSlot: string;
  studentId: string;
  studentName: string;
  note: string;
  generatedAt: number;
}

const DB_NAME = "sesis";
const STORE = "notes";

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

export async function saveNotes(notes: CachedNote[]): Promise<void> {
  if (notes.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      for (const n of notes) store.put(n);
    });
  } finally {
    db.close();
  }
}

export async function getAllNotes(): Promise<CachedNote[]> {
  const db = await openDb();
  try {
    const all = await new Promise<CachedNote[]>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as CachedNote[]);
      req.onerror = () => reject(req.error);
    });
    return all.sort((a, b) => b.generatedAt - a.generatedAt);
  } finally {
    db.close();
  }
}

// Cached notes for one session (date · teacher · time slot), in roster order.
export async function getSessionNotes(
  date: string,
  teacherId: string,
  timeSlot: string,
): Promise<CachedNote[]> {
  const all = await getAllNotes();
  return all
    .filter((n) => n.date === date && n.teacherId === teacherId && n.timeSlot === timeSlot)
    .sort((a, b) => a.generatedAt - b.generatedAt);
}

export async function clearNotes(): Promise<void> {
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
