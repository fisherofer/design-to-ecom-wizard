import { getApiBase } from "@/lib/apiConfig";
/**
 * portableStorage — one storage surface for both runtimes.
 *
 *  - Desktop (Electron): reads/writes a local SQLite file inside the folder
 *    the user picked. Nothing leaves the machine.
 *  - Browser (Lovable preview / web): falls back to localStorage.
 *
 * The desktop bridge is async, so we keep a synchronous in-memory mirror that
 * is hydrated once at boot. That lets every existing `localStorage.getItem`
 * call site migrate to `portableGet` without becoming async.
 */

export interface PortableInfo {
  engine: "sqlite" | "json" | "localStorage";
  dataDir: string;
  file: string;
  bytes: number;
  keys: number;
  platform: string;
  appVersion?: string;
}

interface DesktopBridge {
  isDesktop: true;
  info(): Promise<PortableInfo>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  all(): Promise<Record<string, string>>;
  logAppend(kind: string, payload: unknown): Promise<boolean>;
  logRead(kind: string, limit?: number): Promise<Array<{ kind: string; payload: string; created_at: number }>>;
  chooseDataDir(): Promise<PortableInfo>;
  revealDataDir(): Promise<boolean>;
  migrate(entries: Record<string, string>): Promise<PortableInfo>;
}

function bridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { oferDesktop?: DesktopBridge }).oferDesktop ?? null;
}

export function isDesktop(): boolean {
  return bridge() !== null;
}

/** Synchronous mirror of the desktop store, hydrated by `initPortableStorage`. */
const mirror = new Map<string, string>();
let hydrated = false;

export function isHydrated(): boolean {
  return hydrated || !isDesktop();
}

// ---- write-through to the local VENV SQL store (/api/local-store/kv) -------
const SQL_SKIP = ["ofer.secret.", "ofer.keys.", "ofer.vault.", "ofer.cloudsync.session"];
const pendingSql = new Map<string, string | null>();
let sqlTimer: ReturnType<typeof setTimeout> | null = null;

function sqlBase(): string | null {
  if (typeof window === "undefined") return null;
  return getApiBase().replace(/\/$/, "");
}

function sqlEligible(key: string) {
  return key.startsWith("ofer.") && !SQL_SKIP.some((p) => key.startsWith(p));
}

function queueSql(key: string, value: string | null) {
  if (!sqlEligible(key)) return;
  pendingSql.set(key, value);
  if (sqlTimer) return;
  sqlTimer = setTimeout(() => void flushSql(), 800);
}

async function flushSql() {
  sqlTimer = null;
  const base = sqlBase();
  if (!base) return;
  const batch = Array.from(pendingSql.entries());
  pendingSql.clear();
  for (const [key, value] of batch) {
    try {
      const r = await fetch(`${base}/api/local-store/kv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "system", key, value }),
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      // Local hub offline: keep the value queued for the next write.
      pendingSql.set(key, value);
      sqlStatus = "offline";
      return;
    }
  }
  sqlStatus = "synced";
}

export let sqlStatus: "unknown" | "synced" | "offline" = "unknown";

/** Pull settings saved in the local SQL store back into this browser. */
async function hydrateFromSql() {
  const base = sqlBase();
  if (!base) return;
  try {
    const r = await fetch(`${base}/api/local-store/kv/system`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(String(r.status));
    const data = (await r.json()) as { items?: Record<string, unknown> };
    for (const [k, v] of Object.entries(data.items ?? {})) {
      if (!sqlEligible(k) || typeof v !== "string") continue;
      if (window.localStorage.getItem(k) === null) window.localStorage.setItem(k, v);
    }
    sqlStatus = "synced";
  } catch {
    sqlStatus = "offline";
  }
}

/** Load the whole store into memory once. Call from a top-level useEffect. */
export async function initPortableStorage(): Promise<PortableInfo | null> {
  const api = bridge();
  if (!api) {
    await hydrateFromSql();
    return null;
  }
  const all = await api.all();
  mirror.clear();
  for (const [k, v] of Object.entries(all)) mirror.set(k, v);
  hydrated = true;
  return api.info();
}

export function portableGet(key: string): string | null {
  const api = bridge();
  if (api) return mirror.has(key) ? (mirror.get(key) as string) : null;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function portableSet(key: string, value: string): void {
  const api = bridge();
  if (api) {
    mirror.set(key, value);
    void api.set(key, value);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* quota or private mode */
  }
  queueSql(key, value);
}

export function portableRemove(key: string): void {
  const api = bridge();
  if (api) {
    mirror.delete(key);
    void api.remove(key);
    return;
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  queueSql(key, null);
}

export function portableGetJson<T>(key: string, fallback: T): T {
  const raw = portableGet(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function portableSetJson(key: string, value: unknown): void {
  portableSet(key, JSON.stringify(value));
}

/** Append-only event log (agent runs, chats, trades). Desktop only; no-op on web. */
export async function portableLog(kind: string, payload: unknown): Promise<void> {
  const api = bridge();
  if (api) await api.logAppend(kind, payload);
}

export async function portableLogRead(kind: string, limit = 200) {
  const api = bridge();
  if (!api) return [];
  return api.logRead(kind, limit);
}

export async function getPortableInfo(): Promise<PortableInfo> {
  const api = bridge();
  if (api) return api.info();
  let keys = 0;
  let bytes = 0;
  if (typeof window !== "undefined") {
    try {
      keys = window.localStorage.length;
      for (let i = 0; i < keys; i++) {
        const k = window.localStorage.key(i);
        if (k) bytes += k.length + (window.localStorage.getItem(k)?.length ?? 0);
      }
    } catch {
      /* ignore */
    }
  }
  return {
    engine: "localStorage",
    dataDir: "browser profile (not portable)",
    file: "—",
    bytes,
    keys,
    platform: typeof navigator === "undefined" ? "unknown" : navigator.platform,
  };
}

export async function chooseDataDir(): Promise<PortableInfo | null> {
  const api = bridge();
  if (!api) return null;
  const info = await api.chooseDataDir();
  await initPortableStorage();
  return info;
}

export async function revealDataDir(): Promise<void> {
  await bridge()?.revealDataDir();
}

/** Copy everything currently in browser localStorage into the desktop store. */
export async function migrateLocalStorageToDesktop(): Promise<PortableInfo | null> {
  const api = bridge();
  if (!api || typeof window === "undefined") return null;
  const entries: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      const v = window.localStorage.getItem(k);
      if (v !== null) entries[k] = v;
    }
  } catch {
    /* ignore */
  }
  const info = await api.migrate(entries);
  await initPortableStorage();
  return info;
}

/** Full profile snapshot (settings + chats + agents) as a JSON string. */
export async function exportProfile(): Promise<string> {
  const api = bridge();
  const kv = api ? await api.all() : Object.fromEntries(
    typeof window === "undefined"
      ? []
      : Array.from({ length: window.localStorage.length }, (_, i) => {
          const k = window.localStorage.key(i) as string;
          return [k, window.localStorage.getItem(k) ?? ""] as const;
        }),
  );
  return JSON.stringify({ exportedAt: new Date().toISOString(), kv }, null, 2);
}

/** Restore a profile snapshot produced by `exportProfile`. */
export async function importProfile(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { kv?: Record<string, string> };
  const kv = parsed.kv ?? {};
  const api = bridge();
  if (api) {
    await api.migrate(kv);
    await initPortableStorage();
  } else if (typeof window !== "undefined") {
    for (const [k, v] of Object.entries(kv)) window.localStorage.setItem(k, v);
  }
  return Object.keys(kv).length;
}
