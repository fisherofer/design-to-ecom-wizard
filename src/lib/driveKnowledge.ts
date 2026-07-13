/**
 * driveKnowledge.ts — Read the OferTradingBot AI knowledge base straight from
 * Google Drive using the token already stored by `googleDrive.ts`.
 *
 * Folder IDs are taken from `CLAUDE_CONTINUITY_PROTOCOL.md`:
 *   AI root:                  1PERf8YqaKurSU7aYmFaY3nEaVfJ5NFBN
 *   AI/CLAUDE-FINAL/OferTradingBot/: 1P9L4zUEsASG4r8J43B0TA1eLUMyCxyT-
 *
 * Files considered canonical continuity docs (order matters for handoff):
 *   MASTER_HANDOFF.md → GOOSE_TASKS.md → CONTINUITY_LOG.md
 */
import { getStoredToken } from "@/lib/googleDrive";

export const AI_ROOT_FOLDER_ID = "1PERf8YqaKurSU7aYmFaY3nEaVfJ5NFBN";
export const OFER_HANDOFF_FOLDER_ID = "1P9L4zUEsASG4r8J43B0TA1eLUMyCxyT-";

export const CANONICAL_DOCS = [
  "MASTER_HANDOFF.md",
  "GOOSE_TASKS.md",
  "CONTINUITY_LOG.md",
  "CLAUDE_CONTINUITY_PROTOCOL.md",
] as const;

export interface KnowledgeFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

async function driveGet<T>(path: string): Promise<T> {
  const token = getStoredToken();
  if (!token) throw new Error("Connect Google Drive first (Settings → Google Drive).");
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function driveGetText(path: string): Promise<string> {
  const token = getStoredToken();
  if (!token) throw new Error("Connect Google Drive first.");
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.text();
}

/** List files inside a Drive folder (defaults to the OferTradingBot handoff folder). */
export async function listKnowledgeFiles(
  folderId: string = OFER_HANDOFF_FOLDER_ID,
): Promise<KnowledgeFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const res = await driveGet<{ files: KnowledgeFile[] }>(
    `/files?q=${q}&orderBy=modifiedTime desc&pageSize=100&fields=${fields}`,
  );
  return res.files;
}

/** Fetch text content of a Drive file. Handles Google Docs via export. */
export async function readKnowledgeFile(file: Pick<KnowledgeFile, "id" | "mimeType">): Promise<string> {
  if (file.mimeType === "application/vnd.google-apps.document") {
    return driveGetText(`/files/${file.id}/export?mimeType=text/plain`);
  }
  return driveGetText(`/files/${file.id}?alt=media`);
}

/** Search across the AI root folder tree (name contains query, non-recursive Drive search). */
export async function searchKnowledge(query: string): Promise<KnowledgeFile[]> {
  const safe = query.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name contains '${safe}' and trashed=false`);
  const fields = encodeURIComponent("files(id,name,mimeType,modifiedTime,size)");
  const res = await driveGet<{ files: KnowledgeFile[] }>(
    `/files?q=${q}&orderBy=modifiedTime desc&pageSize=50&fields=${fields}`,
  );
  return res.files;
}
