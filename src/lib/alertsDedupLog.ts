/**
 * alertsDedupLog — IndexedDB-backed persistent log for notifications/alerts with
 * built-in dedupe by content-hash within a rolling window. Adapted from the
 * OFERTRADINGBOT workspace (LiveAlertsCenter.AlertsDeduplicatorDB). Survives
 * reloads so the bell/history panel can show *why* an alert was suppressed.
 */
export interface DedupLogEntry {
  id?: number;
  ts: string;
  title: string;
  message: string;
  level: string;
  hash: string;
  action: "stored" | "duplicate-suppressed";
  reason?: string;
}

const DB_NAME = "ai-os.alertsDedupLog";
const STORE = "log";
const DEFAULT_WINDOW_MS = 10 * 60_000; // 10 minutes

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return (h >>> 0).toString(36);
}

async function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        s.createIndex("hash", "hash");
        s.createIndex("ts", "ts");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const alertsDedupLog = {
  /**
   * Record an alert. Returns true when stored, false when suppressed as a
   * duplicate seen within `windowMs`.
   */
  async record(input: { title: string; message: string; level: string; windowMs?: number }): Promise<boolean> {
    const db = await openDb();
    if (!db) return true;
    const key = hash(`${input.level}|${input.title}|${input.message}`);
    const cutoff = Date.now() - (input.windowMs ?? DEFAULT_WINDOW_MS);
    const entries = await this.recent(200);
    const dup = entries.find((e) => e.hash === key && new Date(e.ts).getTime() >= cutoff);
    const entry: DedupLogEntry = {
      ts: new Date().toISOString(),
      title: input.title,
      message: input.message,
      level: input.level,
      hash: key,
      action: dup ? "duplicate-suppressed" : "stored",
      reason: dup ? `matched entry from ${dup.ts}` : undefined,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return !dup;
  },
  async recent(limit = 50): Promise<DedupLogEntry[]> {
    const db = await openDb();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).openCursor(null, "prev");
      const out: DedupLogEntry[] = [];
      req.onsuccess = () => {
        const c = req.result;
        if (c && out.length < limit) {
          out.push(c.value as DedupLogEntry);
          c.continue();
        } else resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
  },
  async clear() {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
