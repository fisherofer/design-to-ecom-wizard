/**
 * cloudSync — two-way sync between the local Portable profile (SQLite on the
 * desktop, localStorage in the browser) and the cloud table
 * `portable_profile_sync`.
 *
 * Conflict resolution is last-write-wins per key, using a local revision clock
 * stored alongside the value. The profile therefore travels with the folder
 * (USB / Portable Mode) *and* through the cloud.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  exportProfile,
  portableGet,
  portableGetJson,
  portableSet,
  portableSetJson,
} from "@/lib/portableStorage";

const SESSION_KEY = "ofer.cloudsync.session.v1";
const DEVICE_KEY = "ofer.cloudsync.device.v1";
const CLOCK_KEY = "ofer.cloudsync.clock.v1";
const STATE_KEY = "ofer.cloudsync.state.v1";
const AUTO_KEY = "ofer.cloudsync.auto.v1";

/** Keys that must never leave the machine. */
const EXCLUDE_PREFIXES = ["ofer.cloudsync.", "ofer.vault.", "ofer.keys.", "ofer.secret."];

export interface SyncState {
  lastRunAt: string | null;
  pushed: number;
  pulled: number;
  conflicts: number;
  lastError: string | null;
}

export interface SyncResult extends SyncState {
  ok: boolean;
}

function rid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function getSyncSession(): string {
  let s = portableGet(SESSION_KEY);
  if (!s || s.length < 8) {
    s = rid("profile");
    portableSet(SESSION_KEY, s);
  }
  return s;
}

export function setSyncSession(value: string) {
  portableSet(SESSION_KEY, value.trim());
}

export function getDeviceId(): string {
  let d = portableGet(DEVICE_KEY);
  if (!d) {
    d = rid("device");
    portableSet(DEVICE_KEY, d);
  }
  return d;
}

export function getSyncState(): SyncState {
  return portableGetJson<SyncState>(STATE_KEY, {
    lastRunAt: null,
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    lastError: null,
  });
}

export function isAutoSyncOn(): boolean {
  return portableGet(AUTO_KEY) === "1";
}

export function setAutoSync(on: boolean) {
  portableSet(AUTO_KEY, on ? "1" : "0");
}

/** Local per-key revision clock (ISO timestamps). */
function clock(): Record<string, string> {
  return portableGetJson<Record<string, string>>(CLOCK_KEY, {});
}

function touchClock(keys: string[]) {
  const c = clock();
  const now = new Date().toISOString();
  for (const k of keys) c[k] = now;
  portableSetJson(CLOCK_KEY, c);
}

function syncable(key: string) {
  return key.startsWith("ofer.") && !EXCLUDE_PREFIXES.some((p) => key.startsWith(p));
}

async function localEntries(): Promise<Record<string, string>> {
  const snapshot = JSON.parse(await exportProfile()) as { kv: Record<string, string> };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(snapshot.kv ?? {})) if (syncable(k)) out[k] = v;
  return out;
}

/**
 * Runs a full two-way sync: pulls newer cloud rows into the local profile and
 * pushes locally-newer keys back up.
 */
export async function syncProfile(): Promise<SyncResult> {
  const owner = getSyncSession();
  const device = getDeviceId();
  const state: SyncState = { lastRunAt: new Date().toISOString(), pushed: 0, pulled: 0, conflicts: 0, lastError: null };

  try {
    const local = await localEntries();
    const localClock = clock();

    const { data: remote, error } = await supabase
      .from("portable_profile_sync")
      .select("key, value, updated_at, deleted, device_id")
      .eq("owner_session", owner);
    if (error) throw error;

    const remoteMap = new Map((remote ?? []).map((r) => [r.key as string, r]));

    // 1. Pull — cloud row newer than local clock wins.
    for (const row of remote ?? []) {
      const key = row.key as string;
      if (!syncable(key) || row.deleted) continue;
      const localTs = localClock[key];
      const remoteTs = row.updated_at as string;
      const localHas = key in local;
      if (!localHas || !localTs || new Date(remoteTs) > new Date(localTs)) {
        const value = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
        if (local[key] !== value) {
          portableSet(key, value);
          state.pulled += 1;
          if (localHas) state.conflicts += 1;
        }
        localClock[key] = remoteTs;
      }
    }

    // 2. Push — local newer (or absent upstream).
    const upserts: Array<{ owner_session: string; key: string; value: string; device_id: string; deleted: boolean }> = [];
    for (const [key, value] of Object.entries(local)) {
      const row = remoteMap.get(key);
      const localTs = localClock[key];
      const remoteTs = row?.updated_at as string | undefined;
      const remoteValue = row ? (typeof row.value === "string" ? row.value : JSON.stringify(row.value)) : undefined;
      const newer = !row || !remoteTs || !localTs || new Date(localTs) > new Date(remoteTs);
      if (remoteValue !== value && newer) {
        upserts.push({ owner_session: owner, key, value, device_id: device, deleted: false });
      }
    }

    if (upserts.length) {
      const { error: upErr } = await supabase
        .from("portable_profile_sync")
        .upsert(upserts, { onConflict: "owner_session,key" });
      if (upErr) throw upErr;
      state.pushed = upserts.length;
      touchClock(upserts.map((u) => u.key));
    } else {
      portableSetJson(CLOCK_KEY, localClock);
    }

    portableSetJson(STATE_KEY, state);
    return { ...state, ok: true };
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    portableSetJson(STATE_KEY, state);
    return { ...state, ok: false };
  }
}

/** Number of keys eligible for cloud sync right now. */
export async function countSyncableKeys(): Promise<number> {
  return Object.keys(await localEntries()).length;
}
