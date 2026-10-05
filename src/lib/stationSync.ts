/** Client for hub/station_sync_routes.py + Drive relay between stations. */
import { getApiBase } from "./apiConfig";
import { stationDrivePull, stationDrivePush } from "./driveSync.functions";

export interface Peer { station_id: string; name: string | null; url: string | null; last_seen: number; cursor: number; folder: string | null; via: string | null }
export interface LogEntry { id: number; ts: number; direction: "in" | "out"; peer: string | null; via: string | null; scope: string; key: string; hlc: number; outcome: string }
export interface SyncLog { ok: boolean; entries: LogEntry[]; last_in: number | null; last_out: number | null; errors: number }
export interface SyncStatus { ok: boolean; self: string; peers: Peer[]; head: number; folder: { id: string; name: string | null } | null }
export interface RelayStatus { ok: boolean; url: string | null; folder_id: string | null; enabled: boolean; passphrase_set: boolean; running?: boolean; last_run?: number | null; last_ok?: boolean | null; last_error?: string | null; pushed?: number; applied?: number; stations?: number }
type Res<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<Res<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`${getApiBase()}/api/station-sync${path}`, {
      ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json" },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (j as { error?: string }).error ?? `HTTP ${r.status}` };
    return { ok: true, data: j as T };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "השרת המקומי לא ענה בזמן" : "השרת המקומי לא זמין" };
  } finally { clearTimeout(t); }
}

export const stationSync = {
  status: () => call<SyncStatus>("/status"),
  log: (limit = 300, direction?: "in" | "out") => call<SyncLog>(`/log?limit=${limit}${direction ? `&direction=${direction}` : ""}`),
  pull: (url: string, token: string) => call<{ applied: number; cursor: number }>("/pull", { method: "POST", body: JSON.stringify({ url, token, cursor: 0 }) }),
  relayStatus: () => call<RelayStatus>("/relay"),
  relaySave: (b: { url: string; folder_id: string; enabled: boolean; passphrase?: string }) =>
    call<RelayStatus>("/relay", { method: "POST", body: JSON.stringify(b) }),
  relayRun: () => call<{ ok: boolean; pushed?: number; applied?: number; stations?: number; error?: string }>("/relay/run", { method: "POST" }),
  /** Push this station's full change log to Drive and apply other stations' logs. */
  async viaDrive(folderId: string): Promise<Res<{ pushed: number; applied: number; stations: number }>> {
    const st = await this.status();
    if (!st.ok) return st;
    const ch = await call<{ changes: unknown[] }>("/changes?cursor=0");
    if (!ch.ok) return ch;
    try {
      const sid = st.data.self;
      const push = await stationDrivePush({ data: { folderId, stationId: sid, payload: JSON.stringify({ station_id: sid, changes: ch.data.changes }) } });
      if (!push.ok) return { ok: false, error: push.error };
      await call("/sent", { method: "POST", body: JSON.stringify({ changes: ch.data.changes, peer: "drive", via: "drive", folder: folderId }) });
      const pulled = await stationDrivePull({ data: { folderId, stationId: sid } });
      if (!pulled.ok) return { ok: false, error: pulled.error };
      let applied = 0;
      for (const f of pulled.files) {
        const j = JSON.parse(f.content) as { station_id: string; changes: unknown[] };
        const a = await call<{ applied: number }>("/apply", { method: "POST", body: JSON.stringify({ changes: j.changes, origin: j.station_id, origin_name: "drive", via: "drive", folder: folderId }) });
        if (a.ok) applied += a.data.applied;
      }
      return { ok: true, data: { pushed: ch.data.changes.length, applied, stations: pulled.files.length } };
    } catch (e) { return { ok: false, error: (e as Error).message }; }
  },
};
