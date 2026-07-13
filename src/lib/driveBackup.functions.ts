/**
 * driveBackup.functions — server functions that mirror source code to
 * Google Drive using the linked Google Drive connector, preserving the
 * same folder structure as GitHub (AI/LOVEABLE/<repo>/<path>).
 *
 * Auth:
 *   Authorization: Bearer $LOVABLE_API_KEY
 *   X-Connection-Api-Key: $GOOGLE_DRIVE_API_KEY
 *
 * Failure mode: returns { ok:false, error } — never throws to the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GW = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_V3 = `${GW}/drive/v3`;
const DRIVE_UPLOAD = `${GW}/upload/drive/v3/files?uploadType=multipart`;

// -------- helpers --------

function gatewayHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${process.env.LOVABLE_API_KEY ?? ""}`,
    "X-Connection-Api-Key": process.env.GOOGLE_DRIVE_API_KEY ?? "",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const parentClause = parentId ? `'${parentId}' in parents` : "'root' in parents";
  const q = [
    `name='${name.replace(/'/g, "\\'")}'`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    parentClause,
  ].join(" and ");
  const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`;
  const r = await fetch(url, { headers: gatewayHeaders() });
  if (!r.ok) return null;
  const j = (await r.json()) as { files?: Array<{ id: string; name: string }> };
  return j.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const body = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : ["root"],
  };
  const r = await fetch(`${DRIVE_V3}/files?fields=id`, {
    method: "POST",
    headers: gatewayHeaders(true),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Drive folder create ${r.status}: ${await r.text()}`);
  return ((await r.json()) as { id: string }).id;
}

const folderCache = new Map<string, string>();

async function ensurePath(segments: string[]): Promise<string> {
  const key = segments.join("/");
  const cached = folderCache.get(key);
  if (cached) return cached;
  let parent: string | null = null;
  for (let i = 0; i < segments.length; i++) {
    const partial = segments.slice(0, i + 1).join("/");
    const cachedPartial = folderCache.get(partial);
    if (cachedPartial) {
      parent = cachedPartial;
      continue;
    }
    const found = await findFolder(segments[i], parent);
    parent = found ?? (await createFolder(segments[i], parent));
    folderCache.set(partial, parent);
  }
  return parent!;
}

async function uploadFile(
  parentId: string,
  name: string,
  content: string,
  mimeType = "text/plain; charset=utf-8",
): Promise<{ id: string } | { error: string }> {
  const boundary = "----lovableBackup" + Math.random().toString(36).slice(2);
  const metadata = { name, parents: [parentId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`;
  const r = await fetch(DRIVE_UPLOAD, {
    method: "POST",
    headers: {
      ...gatewayHeaders(),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!r.ok) return { error: `${r.status}: ${(await r.text()).slice(0, 200)}` };
  return { id: ((await r.json()) as { id: string }).id };
}

// -------- parsing (mirrors repoAnalyzer) --------

function parseGithub(raw: string): { owner: string; repo: string; ref: string } | null {
  const m = raw.trim().replace(/\.git$/, "").match(/github\.com\/([^/]+)\/([^/]+?)(?:\/(?:tree)\/([^/]+))?\/?$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2], ref: m[3] || "HEAD" };
}

function isBinaryPath(p: string): boolean {
  return /\.(png|jpe?g|gif|webp|ico|pdf|zip|tar|gz|bin|woff2?|ttf|otf|mp4|mov|wav|mp3)$/i.test(p);
}

function mimeFor(path: string): string {
  if (/\.tsx?$/i.test(path)) return "application/typescript";
  if (/\.jsx?$/i.test(path)) return "application/javascript";
  if (/\.(md|txt)$/i.test(path)) return "text/plain; charset=utf-8";
  if (/\.json$/i.test(path)) return "application/json";
  if (/\.(ya?ml)$/i.test(path)) return "text/yaml";
  if (/\.(css|scss)$/i.test(path)) return "text/css";
  if (/\.html?$/i.test(path)) return "text/html";
  return "text/plain; charset=utf-8";
}

// -------- syncRepoToDrive --------

const SyncInput = z.object({
  repoUrl: z.string().min(1),
  token: z.string().optional(),
  rootFolder: z.string().default("AI/LOVEABLE"),
  maxFiles: z.number().int().min(1).max(500).default(300),
  maxFileBytes: z.number().int().min(1024).max(2_000_000).default(400_000),
});

export interface SyncResult {
  ok: boolean;
  driveFolderId?: string;
  uploaded: number;
  skipped: number;
  errors: Array<{ path: string; error: string }>;
  error?: string;
}

export const syncRepoToDrive = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SyncInput.parse(raw))
  .handler(async ({ data }): Promise<SyncResult> => {
    if (!process.env.LOVABLE_API_KEY || !process.env.GOOGLE_DRIVE_API_KEY) {
      return { ok: false, uploaded: 0, skipped: 0, errors: [], error: "Google Drive connector not linked." };
    }
    const gh = parseGithub(data.repoUrl);
    if (!gh) {
      return { ok: false, uploaded: 0, skipped: 0, errors: [], error: "Only GitHub URLs supported for Drive backup." };
    }

    // Enumerate files
    const treeUrl = `https://api.github.com/repos/${gh.owner}/${gh.repo}/git/trees/${gh.ref}?recursive=1`;
    const treeR = await fetch(treeUrl, {
      headers: {
        "User-Agent": "OferTradingBot/drive-backup",
        ...(data.token ? { Authorization: `Bearer ${data.token}` } : {}),
      },
    });
    if (!treeR.ok) {
      return { ok: false, uploaded: 0, skipped: 0, errors: [], error: `GitHub ${treeR.status}: ${await treeR.text()}` };
    }
    const tree = (await treeR.json()) as { tree?: Array<{ path: string; type: string; size?: number }> };
    const files = (tree.tree ?? [])
      .filter((n) => n.type === "blob" && !isBinaryPath(n.path))
      .filter((n) => (n.size ?? 0) <= data.maxFileBytes)
      .slice(0, data.maxFiles);

    // Ensure root folder chain: AI / LOVEABLE / <repo>
    const rootSegments = data.rootFolder.split("/").filter(Boolean);
    let rootId: string;
    try {
      rootId = await ensurePath([...rootSegments, `${gh.owner}__${gh.repo}`]);
    } catch (e) {
      return { ok: false, uploaded: 0, skipped: 0, errors: [], error: `Drive folder setup failed: ${(e as Error).message}` };
    }

    // Upload sequentially (avoids parallel folder-race). Cache dedups folder lookups.
    const errors: Array<{ path: string; error: string }> = [];
    let uploaded = 0;
    let skipped = 0;

    for (const f of files) {
      try {
        const parts = f.path.split("/");
        const fileName = parts.pop() as string;
        const parentPath = [...rootSegments, `${gh.owner}__${gh.repo}`, ...parts];
        const parentId = parts.length ? await ensurePath(parentPath) : rootId;

        const rawR = await fetch(`https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${gh.ref}/${f.path}`, {
          headers: data.token ? { Authorization: `Bearer ${data.token}` } : {},
        });
        if (!rawR.ok) { skipped++; errors.push({ path: f.path, error: `raw ${rawR.status}` }); continue; }
        const content = await rawR.text();
        const up = await uploadFile(parentId, fileName, content, mimeFor(f.path));
        if ("error" in up) { skipped++; errors.push({ path: f.path, error: up.error }); }
        else uploaded++;
      } catch (e) {
        skipped++;
        errors.push({ path: f.path, error: (e as Error).message });
      }
    }

    return { ok: true, driveFolderId: rootId, uploaded, skipped, errors: errors.slice(0, 20) };
  });
