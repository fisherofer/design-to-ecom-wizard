/**
 * Google Drive tab — connect + push backup JSON to a "AI Executive OS Backups" folder.
 * Two paths: paste an OAuth access token, OR configure a Client ID and use Google Identity Services.
 */
import { useEffect, useState } from "react";
import { Cloud, CheckCircle2, XCircle, Loader2, Upload, LogOut, Link as LinkIcon, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  connectWithGis, ensureFolder, getStoredClientId, getStoredToken, listBackups,
  setStoredClientId, setStoredToken, uploadBackup, verifyToken, type DriveFile,
} from "@/lib/googleDrive";
import { buildSourceBundle } from "@/lib/sourceExport";
import { Field } from "@/components/settings/Field";
import { DriveKnowledgeBrowser } from "@/components/settings/DriveKnowledgeBrowser";

export function GoogleDriveTab() {
  const [token, setToken] = useState(() => getStoredToken() ?? "");
  const [clientId, setClientId] = useState(() => getStoredClientId() ?? "");
  const [status, setStatus] = useState<{ ok: boolean; email?: string; error?: string } | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [busy, setBusy] = useState<null | "verify" | "connect" | "upload" | "list">(null);

  async function verify() {
    setBusy("verify");
    const s = await verifyToken();
    setStatus(s);
    if (s.ok) toast.success(`Connected as ${s.email}`);
    else toast.error(s.error ?? "Verification failed");
    setBusy(null);
  }

  async function connect() {
    setBusy("connect");
    try {
      const t = await connectWithGis();
      setToken(t);
      await verify();
      toast.success("Google Drive connected");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refreshList() {
    setBusy("list");
    try { setFiles(await listBackups()); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  async function pushBackup() {
    setBusy("upload");
    try {
      await ensureFolder();
      const bundle = buildSourceBundle();
      const name = `ai-os-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      await uploadBackup(name, JSON.stringify(bundle, null, 2));
      toast.success(`Uploaded ${name}`);
      await refreshList();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => { if (token && !status) verify().catch(() => {}); /* one-shot */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold">Google Drive Backup</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Push project source + logs JSON straight into a dedicated Drive folder.
        </p>

        <div className="mt-5 grid gap-4">
          <Field label="OAuth Client ID (optional – enables one-click connect)">
            <input
              value={clientId}
              onChange={(e) => { setClientId(e.target.value); setStoredClientId(e.target.value || null); }}
              placeholder="xxxxxxx.apps.googleusercontent.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Create at console.cloud.google.com → OAuth 2.0 Client IDs · scope <span className="font-mono">drive.file</span>.
            </p>
          </Field>

          <Field label="Access token (fallback if no Client ID)">
            <input
              type="password"
              value={token}
              onChange={(e) => { setToken(e.target.value); setStoredToken(e.target.value || null); }}
              placeholder="ya29.a0AfB_..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Get a temporary token from <span className="font-mono">developers.google.com/oauthplayground</span> (Drive API v3 → drive.file).
            </p>
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={connect}
              disabled={busy === "connect" || !clientId}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              Connect Google
            </button>
            <button
              onClick={verify}
              disabled={busy === "verify" || !token}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50"
            >
              {busy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Verify token
            </button>
            <button
              onClick={pushBackup}
              disabled={busy === "upload" || !token}
              className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Push backup now
            </button>
            <button
              onClick={refreshList}
              disabled={busy === "list" || !token}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated disabled:opacity-50"
            >
              {busy === "list" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              List backups
            </button>
            {token && (
              <button
                onClick={() => { setStoredToken(null); setToken(""); setStatus(null); toast.info("Signed out"); }}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            )}
          </div>

          {status && (
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs">
              {status.ok ? (
                <><CheckCircle2 className="h-4 w-4 text-success" /><span className="text-success">Connected</span><span className="text-muted-foreground">· {status.email}</span></>
              ) : (
                <><XCircle className="h-4 w-4 text-destructive" /><span className="text-destructive">Not connected</span><span className="text-muted-foreground">· {status.error}</span></>
              )}
            </div>
          )}
        </div>
      </section>

      {files.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <h3 className="font-display text-base font-semibold">Recent backups</h3>
          <div className="mt-3 divide-y divide-border">
            {files.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-mono text-xs truncate">{f.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {f.modifiedTime ? new Date(f.modifiedTime).toLocaleString() : ""}
                  {f.size ? ` · ${(Number(f.size) / 1024).toFixed(1)} KB` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <DriveKnowledgeBrowser />
    </div>
  );
}
