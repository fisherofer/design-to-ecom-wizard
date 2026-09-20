import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CloudUpload,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  listDriveFolders,
  createDriveFolder,
  driveFullBackup,
  driveActiveSync,
  type FullBackupResult,
  type ActiveSyncResult,
} from "@/lib/driveSync.functions";
import {
  collectMemoryPayload,
  markRun,
  readSettings,
  setBackupOnStart,
  setMirrorFolder,
  setSyncOnChange,
  setTargetFolder,
  type DriveSyncSettings,
} from "@/lib/driveSyncSettings";

export const Route = createFileRoute("/drive-sync")({
  head: () => ({
    meta: [
      { title: "Drive Sync — AI Executive OS" },
      {
        name: "description",
        content:
          "Choose a Google Drive folder and keep a full ZIP + JSON backup by date and hour, plus a file-level live mirror of the whole system.",
      },
      { property: "og:title", content: "Drive Sync — AI Executive OS" },
      {
        property: "og:description",
        content: "Full Google Drive backup by date and hour, plus a file-level live mirror of the system.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriveSyncPage,
});

interface Crumb {
  id: string;
  name: string;
}

function DriveSyncPage() {
  const [settings, setSettings] = useState<DriveSyncSettings | null>(null);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: "root", name: "My Drive" }]);
  const [folders, setFolders] = useState<Crumb[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [backingUp, setBackingUp] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastBackup, setLastBackup] = useState<FullBackupResult | null>(null);
  const [lastSync, setLastSync] = useState<ActiveSyncResult | null>(null);

  const current = crumbs[crumbs.length - 1];

  const load = useCallback(async (parentId: string) => {
    setBrowsing(true);
    setBrowseError(null);
    try {
      const r = await listDriveFolders({ data: { parentId } });
      if (!r.ok) {
        setBrowseError(r.error ?? "Drive unavailable");
        setFolders([]);
      } else {
        setFolders(r.folders.map((f) => ({ id: f.id, name: f.name })));
      }
    } catch (e) {
      setBrowseError((e as Error).message);
    } finally {
      setBrowsing(false);
    }
  }, []);

  useEffect(() => {
    setSettings(readSettings());
    void load("root");
  }, [load]);

  const enter = (f: Crumb) => {
    setCrumbs((c) => [...c, f]);
    void load(f.id);
  };

  const jump = (idx: number) => {
    const next = crumbs.slice(0, idx + 1);
    setCrumbs(next);
    void load(next[next.length - 1].id);
  };

  const chooseHere = () => {
    setTargetFolder(current.id, crumbs.map((c) => c.name).join(" / "));
    setSettings(readSettings());
    toast.success(`Backup location set: ${crumbs.map((c) => c.name).join(" / ")}`);
  };

  const addFolder = async () => {
    const name = newFolder.trim();
    if (!name) return;
    const r = await createDriveFolder({ data: { parentId: current.id, name } });
    if (!r.ok) {
      toast.error(r.error ?? "Could not create the folder");
      return;
    }
    setNewFolder("");
    toast.success(`Created "${name}"`);
    void load(current.id);
  };

  const runBackup = async () => {
    const s = readSettings();
    if (!s.folderId) {
      toast.error("Choose a Google Drive folder first");
      return;
    }
    setBackingUp(true);
    try {
      const memory = await collectMemoryPayload();
      const r = await driveFullBackup({ data: { folderId: s.folderId, memory, label: "manual" } });
      setLastBackup(r);
      if (r.ok) {
        markRun();
        setSettings(readSettings());
        toast.success(`Backup saved in ${r.folderPath} (${r.fileCount} files)`);
      } else {
        toast.error(r.error ?? "Backup failed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBackingUp(false);
    }
  };

  const runSync = async () => {
    const s = readSettings();
    if (!s.folderId) {
      toast.error("Choose a Google Drive folder first");
      return;
    }
    setSyncing(true);
    try {
      const r = await driveActiveSync({ data: { folderId: s.folderId, mirrorFolder: s.mirrorFolder } });
      setLastSync(r);
      if (r.ok) {
        markRun();
        setSettings(readSettings());
        toast.success(`Mirror updated — ${r.uploaded} new, ${r.updated} changed, ${r.unchanged} identical`);
      } else {
        toast.error(r.error ?? "Sync failed");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Drive Sync</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Pick a folder in your Google Drive. Full snapshots (ZIP + JSON, including the system memory) are filed
            under <span className="font-mono text-foreground">date / hour</span>, and a live mirror keeps every changed
            file up to date at file level.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {settings?.folderId ? "target selected" : "no target yet"}
        </Badge>
      </div>

      {/* Folder picker */}
      <Card className="border-border/60 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider">Choose backup location</h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={`${c.id}-${i}`} className="flex items-center gap-1">
              <button
                onClick={() => jump(i)}
                className="rounded px-1.5 py-0.5 hover:bg-muted/40 hover:text-foreground"
              >
                {c.name}
              </button>
              {i < crumbs.length - 1 && <ChevronRight className="h-3 w-3" />}
            </span>
          ))}
        </div>

        <Separator className="my-3" />

        {browseError ? (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>Google Drive folders unavailable — {browseError}</div>
          </div>
        ) : (
          <ScrollArea className="h-56 rounded-md border border-border/60 bg-background/40">
            <div className="divide-y divide-border/40">
              {browsing && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
                </div>
              )}
              {!browsing && folders.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">No sub-folders here.</div>
              )}
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => enter(f)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/30"
                >
                  <span className="flex items-center gap-2">
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                    {f.name}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={chooseHere} size="sm">
            Use this folder
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load(current.id)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              placeholder="New folder name"
              className="h-8 w-44 text-xs"
            />
            <Button variant="outline" size="sm" onClick={() => void addFolder()} disabled={!newFolder.trim()}>
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" /> Create
            </Button>
          </div>
        </div>

        {settings?.folderName && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="text-muted-foreground">Backups go to</span>
            <span className="font-mono">{settings.folderName}</span>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Full backup */}
        <Card className="border-border/60 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <CloudUpload className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Full backup (ZIP + JSON)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Saves the whole system — source, configuration and memory — as{" "}
            <span className="font-mono">YYYY-MM-DD / HH-00 / backup-HH-MM.zip</span> and the matching{" "}
            <span className="font-mono">.json</span>. Encrypted secret material is excluded.
          </p>
          <Button className="mt-4 w-full" size="lg" onClick={() => void runBackup()} disabled={backingUp}>
            {backingUp ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Building snapshot…
              </>
            ) : (
              <>
                <CloudUpload className="mr-2 h-4 w-4" /> Back up now
              </>
            )}
          </Button>

          {lastBackup && (
            <div className="mt-4 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              {lastBackup.ok ? (
                <>
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="font-mono">{lastBackup.folderPath}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-muted-foreground">
                    <div>{lastBackup.zipName}</div>
                    <div>{Math.round((lastBackup.zipBytes ?? 0) / 1024)} KB</div>
                    <div>{lastBackup.jsonName}</div>
                    <div>{Math.round((lastBackup.jsonBytes ?? 0) / 1024)} KB</div>
                    <div className="col-span-2">{lastBackup.fileCount} files</div>
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>{lastBackup.error}</div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Active sync */}
        <Card className="border-border/60 bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-accent" />
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Active sync (file level)</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Mirrors every project file into the chosen folder and uploads only what actually changed, comparing content
            hashes against the copies already in Drive.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Mirror folder</span>
            <Input
              defaultValue={settings?.mirrorFolder ?? "live-mirror"}
              onBlur={(e) => {
                setMirrorFolder(e.target.value);
                setSettings(readSettings());
              }}
              className="h-8 w-40 text-xs"
            />
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            size="lg"
            onClick={() => void runSync()}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Comparing files…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" /> Sync changed files
              </>
            )}
          </Button>

          {lastSync && (
            <div className="mt-4 rounded-md border border-border/60 bg-background/60 p-3 text-xs">
              {lastSync.ok ? (
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  <div>Scanned: {lastSync.scanned}</div>
                  <div>New: {lastSync.uploaded}</div>
                  <div>Updated: {lastSync.updated}</div>
                  <div>Identical: {lastSync.unchanged}</div>
                  {lastSync.failed.length > 0 && (
                    <div className="col-span-2 text-warning">
                      {lastSync.failed.length} file(s) failed: {lastSync.failed.map((f) => f.path).join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>{lastSync.error}</div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Automation */}
      <Card className="border-border/60 bg-card/40 p-5">
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">Automatic backup</h3>
        </div>
        <div className="space-y-3">
          <label className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3">
            <div>
              <div className="text-sm font-medium">On every start</div>
              <div className="text-xs text-muted-foreground">
                Runs a full backup and a mirror pass a few seconds after the system opens.
              </div>
            </div>
            <Switch
              checked={settings?.backupOnStart ?? false}
              onCheckedChange={(v) => {
                setBackupOnStart(v);
                setSettings(readSettings());
              }}
            />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-md border border-border/60 bg-background/40 p-3">
            <div>
              <div className="text-sm font-medium">After every change</div>
              <div className="text-xs text-muted-foreground">
                Watches the local state and backs up whenever something actually changed (checked every minute).
              </div>
            </div>
            <Switch
              checked={settings?.syncOnChange ?? false}
              onCheckedChange={(v) => {
                setSyncOnChange(v);
                setSettings(readSettings());
              }}
            />
          </label>
        </div>
        {settings?.lastRunAt && (
          <div className="mt-3 text-xs text-muted-foreground">
            Last automatic or manual run: {new Date(settings.lastRunAt).toLocaleString()}
          </div>
        )}
      </Card>
    </div>
  );
}
