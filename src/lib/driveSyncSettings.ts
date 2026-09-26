/**
 * Client-side settings + triggers for the Google Drive backup / active sync.
 * Stored in the portable profile so they travel with the folder.
 */
import { portableGet, portableSet, exportProfile } from "@/lib/portableStorage";

const K_FOLDER_ID = "ofer.drive.sync.folderId.v1";
const K_FOLDER_NAME = "ofer.drive.sync.folderName.v1";
const K_ON_START = "ofer.drive.sync.onStart.v1";
const K_ON_CHANGE = "ofer.drive.sync.onChange.v1";
const K_MIRROR = "ofer.drive.sync.mirror.v1";
const K_LAST = "ofer.drive.sync.last.v1";
const K_HASH = "ofer.drive.sync.profileHash.v1";

export interface DriveSyncSettings {
  folderId: string | null;
  folderName: string | null;
  backupOnStart: boolean;
  syncOnChange: boolean;
  mirrorFolder: string;
  lastRunAt: string | null;
}

export function readSettings(): DriveSyncSettings {
  return {
    folderId: portableGet(K_FOLDER_ID) || null,
    folderName: portableGet(K_FOLDER_NAME) || null,
    backupOnStart: portableGet(K_ON_START) !== "0",
    syncOnChange: portableGet(K_ON_CHANGE) !== "0",
    mirrorFolder: portableGet(K_MIRROR) || "live-mirror",
    lastRunAt: portableGet(K_LAST) || null,
  };
}

export function setTargetFolder(id: string, name: string) {
  portableSet(K_FOLDER_ID, id);
  portableSet(K_FOLDER_NAME, name);
}

export function setBackupOnStart(on: boolean) {
  portableSet(K_ON_START, on ? "1" : "0");
}

export function setSyncOnChange(on: boolean) {
  portableSet(K_ON_CHANGE, on ? "1" : "0");
}

export function setMirrorFolder(name: string) {
  portableSet(K_MIRROR, name.trim() || "live-mirror");
}

export function markRun(at = new Date().toISOString()) {
  portableSet(K_LAST, at);
}

/** Everything the system remembers on this machine, as a JSON string. */
export async function collectMemoryPayload(): Promise<string> {
  const profile = JSON.parse(await exportProfile()) as unknown;
  const local: Record<string, string> = {};
  if (typeof window !== "undefined") {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      // Never back up decrypted secrets — only the encrypted vault blob.
      if (k.startsWith("ofer.secret.") || k.startsWith("ofer.keys.")) continue;
      local[k] = window.localStorage.getItem(k) ?? "";
    }
  }
  return JSON.stringify({ capturedAt: new Date().toISOString(), profile, localStorage: local });
}

/** Cheap fingerprint of the local state, used to detect "something changed". */
export function profileFingerprint(): string {
  if (typeof window === "undefined") return "";
  let acc = 0;
  let len = 0;
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (!k || k.startsWith("ofer.drive.sync.")) continue;
    const v = window.localStorage.getItem(k) ?? "";
    len += v.length;
    for (let j = 0; j < v.length; j += 97) acc = (acc * 31 + v.charCodeAt(j)) % 2_147_483_647;
  }
  return `${len}:${acc}`;
}

export function readStoredFingerprint(): string {
  return portableGet(K_HASH) || "";
}

export function writeStoredFingerprint(fp: string) {
  portableSet(K_HASH, fp);
}
