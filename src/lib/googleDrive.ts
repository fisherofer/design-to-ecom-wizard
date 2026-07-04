/**
 * Google Drive backup client (browser-only, OAuth token pasted by user).
 * ----------------------------------------------------------------------
 * The user pastes a Google OAuth access token (from
 *   https://developers.google.com/oauthplayground → Drive API v3 → "drive.file")
 * and we upload backup JSON into a dedicated "AI Executive OS Backups" folder.
 *
 * For a fully automated flow we'd need a hosted OAuth client ID; that's opt-in
 * via VITE_GOOGLE_CLIENT_ID and lives in `initGis()` below.
 */
const FOLDER_NAME = "AI Executive OS Backups";
const TOKEN_KEY = "ai-os.gdrive.token";
const FOLDER_KEY = "ai-os.gdrive.folderId";
const CLIENT_ID_KEY = "ai-os.gdrive.clientId";

export interface DriveFile { id: string; name: string; modifiedTime?: string; size?: string }

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setStoredToken(t: string | null) {
  if (!t) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, t);
}
export function getStoredClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CLIENT_ID_KEY) ?? (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? null;
}
export function setStoredClientId(id: string | null) {
  if (!id) localStorage.removeItem(CLIENT_ID_KEY);
  else localStorage.setItem(CLIENT_ID_KEY, id);
}

async function driveFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  if (!token) throw new Error("No Google access token. Paste one or connect first.");
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function verifyToken(): Promise<{ email?: string; ok: boolean; error?: string }> {
  try {
    const info = await driveFetch<{ user: { emailAddress?: string; displayName?: string } }>(
      "/about?fields=user(emailAddress,displayName)",
    );
    return { ok: true, email: info.user?.emailAddress ?? info.user?.displayName };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function ensureFolder(): Promise<string> {
  const cached = typeof window !== "undefined" ? localStorage.getItem(FOLDER_KEY) : null;
  if (cached) return cached;
  const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const list = await driveFetch<{ files: DriveFile[] }>(`/files?q=${q}&spaces=drive&fields=files(id,name)`);
  let id = list.files[0]?.id;
  if (!id) {
    const created = await driveFetch<DriveFile>("/files?fields=id,name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    });
    id = created.id;
  }
  localStorage.setItem(FOLDER_KEY, id);
  return id;
}

export async function uploadBackup(name: string, jsonContent: string): Promise<DriveFile> {
  return uploadBlob(name, new Blob([jsonContent], { type: "application/json" }), "application/json");
}

/** Upload any Blob (e.g. a ZIP produced by the /backup route) into the shared folder. */
export async function uploadBlob(name: string, blob: Blob, mimeType?: string): Promise<DriveFile> {
  const folderId = await ensureFolder();
  const token = getStoredToken();
  const type = mimeType ?? blob.type ?? "application/octet-stream";
  const boundary = `----AIOS${Date.now()}`;
  const enc = new TextEncoder();
  const metadata = { name, parents: [folderId], mimeType: type };
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Blob([head, blob, tail]);
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,size",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${await res.text()}`);
  return res.json() as Promise<DriveFile>;
}

export async function listBackups(): Promise<DriveFile[]> {
  const folderId = await ensureFolder();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch<{ files: DriveFile[] }>(
    `/files?q=${q}&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,size)&pageSize=25`,
  );
  return res.files;
}

/** Optional: token client via Google Identity Services. Requires VITE_GOOGLE_CLIENT_ID or user-supplied id. */
export async function connectWithGis(): Promise<string> {
  const clientId = getStoredClientId();
  if (!clientId) throw new Error("Missing Google OAuth Client ID.");
  await loadScript("https://accounts.google.com/gsi/client");
  return new Promise<string>((resolve, reject) => {
    const g = (window as unknown as { google?: { accounts: { oauth2: {
      initTokenClient: (o: {
        client_id: string; scope: string; callback: (r: { access_token?: string; error?: string }) => void;
      }) => { requestAccessToken: () => void };
    } } } }).google;
    if (!g) return reject(new Error("Google Identity Services failed to load"));
    const tc = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r) => {
        if (r.access_token) { setStoredToken(r.access_token); resolve(r.access_token); }
        else reject(new Error(r.error ?? "OAuth flow cancelled"));
      },
    });
    tc.requestAccessToken();
  });
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
