/**
 * driveSync.functions — full Google Drive backup + file-level active sync.
 *
 * Uses the linked Google Drive connector through the Lovable connector gateway:
 *   Authorization: Bearer $LOVABLE_API_KEY
 *   X-Connection-Api-Key: $GOOGLE_DRIVE_API_KEY
 *
 * Three capabilities:
 *   1. listDriveFolders  — graphical folder browser (drill-down picker).
 *   2. driveFullBackup   — ZIP + JSON snapshot into <target>/YYYY-MM-DD/HH-00/.
 *   3. driveActiveSync   — per-file mirror of the project tree; only files whose
 *                          content hash differs from Drive are uploaded.
 *
 * Never throws to the client — every handler returns { ok, ... , error? }.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GW = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_V3 = `${GW}/drive/v3`;
const UPLOAD_MULTIPART = `${GW}/upload/drive/v3/files?uploadType=multipart&fields=id,name`;
const UPLOAD_MEDIA = (id: string) => `${GW}/upload/drive/v3/files/${id}?uploadType=media&fields=id,name`;
const FOLDER_MIME = "application/vnd.google-apps.folder";
const TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------- gateway ---

function creds(): { lovable: string; conn: string } | null {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !conn) return null;
  return { lovable, conn };
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const c = creds();
  return {
    Authorization: `Bearer ${c?.lovable ?? ""}`,
    "X-Connection-Api-Key": c?.conn ?? "",
    ...extra,
  };
}

async function gw(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ---------------------------------------------------------------- folders ---

interface DriveEntry {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
}

async function findChild(name: string, parentId: string, folderOnly: boolean): Promise<DriveEntry | null> {
  const q = [
    `name='${esc(name)}'`,
    `'${parentId}' in parents`,
    "trashed=false",
    ...(folderOnly ? [`mimeType='${FOLDER_MIME}'`] : []),
  ].join(" and ");
  const r = await gw(
    `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,md5Checksum,modifiedTime)&pageSize=1`,
    { headers: headers() },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { files?: DriveEntry[] };
  return j.files?.[0] ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const r = await gw(`${DRIVE_V3}/files?fields=id`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!r.ok) throw new Error(`Drive folder create ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()) as { id: string }).id;
}

/** Resolve (creating as needed) a chain of folder names under a parent. */
async function ensureChain(parentId: string, segments: string[], cache: Map<string, string>): Promise<string> {
  let cur = parentId;
  let key = parentId;
  for (const seg of segments) {
    key = `${key}/${seg}`;
    const hit = cache.get(key);
    if (hit) {
      cur = hit;
      continue;
    }
    const found = await findChild(seg, cur, true);
    cur = found?.id ?? (await createFolder(seg, cur));
    cache.set(key, cur);
  }
  return cur;
}

async function uploadBytes(
  parentId: string,
  name: string,
  bytes: Uint8Array | string,
  mimeType: string,
  existingId?: string,
): Promise<{ id: string; name: string }> {
  const payload = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  if (existingId) {
    const r = await gw(UPLOAD_MEDIA(existingId), {
      method: "PATCH",
      headers: headers({ "Content-Type": mimeType }),
      body: payload as unknown as BodyInit,
    });
    if (!r.ok) throw new Error(`Drive update ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as { id: string; name: string };
  }
  const boundary = `----lovableDrive${Date.now().toString(36)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify({ name, parents: [parentId], mimeType })}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Blob([head as BlobPart, payload as BlobPart, tail as BlobPart]);
  const r = await gw(UPLOAD_MULTIPART, {
    method: "POST",
    headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }),
    body,
  });
  if (!r.ok) throw new Error(`Drive upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as { id: string; name: string };
}

// ------------------------------------------------------------ project tree ---

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".wrangler",
  ".venv",
  "__pycache__",
  "user_data",
  ".lovable",
]);
const SKIP_EXT = new Set([".lock", ".lockb", ".log", ".pyc", ".woff", ".woff2", ".ttf", ".otf"]);
const MAX_FILE_BYTES = 1_000_000;

interface LocalFile {
  path: string;
  bytes: number;
  content: string;
}

async function collectProject(limit: number): Promise<LocalFile[]> {
  const fs = await import("fs/promises");
  const path = await import("path");
  const root = process.cwd();
  const out: LocalFile[] = [];

  async function walk(rel: string) {
    if (out.length >= limit) return;
    const abs = path.join(root, rel);
    let st;
    try {
      st = await fs.stat(abs);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      const entries = await fs.readdir(abs);
      for (const name of entries.sort()) {
        if (SKIP_DIRS.has(name)) continue;
        await walk(rel ? path.join(rel, name) : name);
      }
      return;
    }
    if (SKIP_EXT.has(path.extname(rel).toLowerCase())) return;
    if (st.size > MAX_FILE_BYTES) return;
    try {
      out.push({ path: rel.replace(/\\/g, "/"), bytes: st.size, content: await fs.readFile(abs, "utf8") });
    } catch {
      /* binary / unreadable — skipped on purpose */
    }
  }

  for (const top of ["src", "supabase", "public", "electron"]) await walk(top);
  for (const f of [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "components.json",
    "wrangler.jsonc",
    "eslint.config.js",
    "README.md",
    "roadmap.md",
    "PORTABLE.md",
  ]) {
    await walk(f);
  }
  return out;
}

function mimeFor(p: string): string {
  if (/\.tsx?$/i.test(p)) return "text/plain; charset=utf-8";
  if (/\.json$/i.test(p)) return "application/json";
  if (/\.css$/i.test(p)) return "text/css";
  if (/\.html?$/i.test(p)) return "text/html";
  return "text/plain; charset=utf-8";
}

async function md5(content: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("md5").update(content, "utf8").digest("hex");
}

function stamp(now = new Date()) {
  const iso = now.toISOString();
  return {
    day: iso.slice(0, 10), // YYYY-MM-DD
    hourFolder: `${iso.slice(11, 13)}-00`, // HH-00
    minute: iso.slice(11, 16).replace(":", "-"), // HH-MM
    iso,
  };
}

// ------------------------------------------------------- 1. folder browser ---

export const listDriveFolders = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ parentId: z.string().default("root") }).parse(raw))
  .handler(async ({ data }): Promise<{ ok: boolean; folders: DriveEntry[]; error?: string }> => {
    if (!creds()) return { ok: false, folders: [], error: "Google Drive is not connected yet." };
    const q = `'${esc(data.parentId)}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
    const r = await gw(
      `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&orderBy=name&pageSize=200`,
      { headers: headers() },
    );
    if (!r.ok) return { ok: false, folders: [], error: `Drive ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const j = (await r.json()) as { files?: DriveEntry[] };
    return { ok: true, folders: j.files ?? [] };
  });

/** Create a sub-folder inside the currently browsed folder. */
export const createDriveFolder = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z.object({ parentId: z.string().min(1), name: z.string().min(1).max(120) }).parse(raw),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!creds()) return { ok: false, error: "Google Drive is not connected yet." };
    try {
      return { ok: true, id: await createFolder(data.name, data.parentId) };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

// --------------------------------------------------------- 2. full backup ---

export interface FullBackupResult {
  ok: boolean;
  folderPath?: string;
  zipName?: string;
  jsonName?: string;
  fileCount?: number;
  zipBytes?: number;
  jsonBytes?: number;
  error?: string;
}

export const driveFullBackup = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        folderId: z.string().min(1),
        /** Client-side memory payload (profile, conversations, settings) as JSON string. */
        memory: z.string().max(12_000_000).optional(),
        label: z.string().max(60).optional(),
        maxFiles: z.number().int().min(1).max(4000).default(2500),
      })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<FullBackupResult> => {
    if (!creds()) return { ok: false, error: "Google Drive is not connected yet." };
    try {
      const { default: JSZip } = await import("jszip");
      const s = stamp();
      const cache = new Map<string, string>();
      const targetId = await ensureChain(data.folderId, [s.day, s.hourFolder], cache);

      const files = await collectProject(data.maxFiles);
      const memory = data.memory ? (JSON.parse(data.memory) as unknown) : null;

      const snapshot = {
        meta: {
          app: "AI Executive OS",
          format: "aios-full-backup/v1",
          createdAt: s.iso,
          label: data.label ?? null,
          fileCount: files.length,
          totalBytes: files.reduce((a, f) => a + f.bytes, 0),
        },
        memory,
        manifest: files.map((f) => ({ path: f.path, bytes: f.bytes })),
        files,
      };

      const zip = new JSZip();
      zip.file("snapshot.json", JSON.stringify(snapshot, null, 2));
      for (const f of files) zip.file(`source/${f.path}`, f.content);
      if (memory) zip.file("memory.json", JSON.stringify(memory, null, 2));
      const zipBytes = (await zip.generateAsync({ type: "uint8array" })) as Uint8Array;

      const base = `backup-${s.minute}`;
      const jsonText = JSON.stringify(snapshot);
      const zipUp = await uploadBytes(targetId, `${base}.zip`, zipBytes, "application/zip");
      const jsonUp = await uploadBytes(targetId, `${base}.json`, jsonText, "application/json");

      return {
        ok: true,
        folderPath: `${s.day}/${s.hourFolder}`,
        zipName: zipUp.name,
        jsonName: jsonUp.name,
        fileCount: files.length,
        zipBytes: zipBytes.byteLength,
        jsonBytes: new TextEncoder().encode(jsonText).byteLength,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

// -------------------------------------------------------- 3. active sync ---

export interface ActiveSyncResult {
  ok: boolean;
  scanned: number;
  uploaded: number;
  updated: number;
  unchanged: number;
  failed: Array<{ path: string; error: string }>;
  error?: string;
}

export const driveActiveSync = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        folderId: z.string().min(1),
        /** Sub-folder inside the chosen location that mirrors the project. */
        mirrorFolder: z.string().min(1).max(60).default("live-mirror"),
        maxFiles: z.number().int().min(1).max(4000).default(2500),
      })
      .parse(raw),
  )
  .handler(async ({ data }): Promise<ActiveSyncResult> => {
    const empty = { scanned: 0, uploaded: 0, updated: 0, unchanged: 0, failed: [] as Array<{ path: string; error: string }> };
    if (!creds()) return { ok: false, ...empty, error: "Google Drive is not connected yet." };
    try {
      const cache = new Map<string, string>();
      const rootId = await ensureChain(data.folderId, [data.mirrorFolder], cache);
      const files = await collectProject(data.maxFiles);
      const res: ActiveSyncResult = { ok: true, scanned: files.length, uploaded: 0, updated: 0, unchanged: 0, failed: [] };

      for (const f of files) {
        try {
          const parts = f.path.split("/");
          const name = parts.pop() as string;
          const parentId = parts.length ? await ensureChain(rootId, parts, cache) : rootId;
          const existing = await findChild(name, parentId, false);
          if (existing?.md5Checksum && existing.md5Checksum === (await md5(f.content))) {
            res.unchanged += 1;
            continue;
          }
          await uploadBytes(parentId, name, f.content, mimeFor(f.path), existing?.id);
          if (existing) res.updated += 1;
          else res.uploaded += 1;
        } catch (e) {
          res.failed.push({ path: f.path, error: (e as Error).message });
        }
      }
      res.failed = res.failed.slice(0, 25);
      return res;
    } catch (e) {
      return { ok: false, ...empty, error: (e as Error).message };
    }
  });
