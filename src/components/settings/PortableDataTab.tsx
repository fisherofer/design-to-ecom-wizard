/**
 * PortableDataTab — control panel for running the OS outside Lovable.
 * Shows the active storage engine, lets the user pick the data folder,
 * migrate browser data into it, and export/import the whole profile.
 */
import { useEffect, useRef, useState } from "react";
import { HardDrive, FolderOpen, Download, Upload, RefreshCw, Database, Laptop, Globe } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  chooseDataDir,
  exportProfile,
  getPortableInfo,
  importProfile,
  isDesktop,
  migrateLocalStorageToDesktop,
  revealDataDir,
  type PortableInfo,
} from "@/lib/portableStorage";
import { CloudSyncCard } from "@/components/settings/CloudSyncCard";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function PortableDataTab() {
  const [info, setInfo] = useState<PortableInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();

  const refresh = async () => setInfo(await getPortableInfo());

  useEffect(() => {
    void refresh();
  }, []);

  const onChooseDir = async () => {
    setBusy(true);
    try {
      const next = await chooseDataDir();
      if (next) {
        setInfo(next);
        toast.success(`Data folder set to ${next.dataDir}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onMigrate = async () => {
    setBusy(true);
    try {
      const next = await migrateLocalStorageToDesktop();
      if (next) {
        setInfo(next);
        toast.success(`Migrated ${next.keys} keys into the local database`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    const json = await exportProfile();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ofer-profile-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Profile exported");
  };

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const count = await importProfile(await file.text());
      await refresh();
      toast.success(`Restored ${count} keys`);
    } catch {
      toast.error("Invalid profile file");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {desktop ? <Laptop className="h-5 w-5 text-primary" /> : <Globe className="h-5 w-5 text-muted-foreground" />}
            <h3 className="text-sm font-semibold">Portable Mode</h3>
          </div>
          <Badge variant={desktop ? "default" : "secondary"}>{desktop ? "Desktop app" : "Browser"}</Badge>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          {desktop
            ? "All settings, chats, agents and logs are stored in a local database inside your chosen folder. Nothing is synced to the cloud."
            : "Running in a browser — data lives in this browser profile only. Launch the desktop build to store everything in a folder of your choice."}
        </p>

        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Engine</dt>
            <dd className="flex items-center gap-1 font-mono">
              <Database className="h-3.5 w-3.5" />
              {info?.engine ?? "…"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Data folder</dt>
            <dd className="truncate font-mono text-xs" title={info?.dataDir}>
              {info?.dataDir ?? "…"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Size / Keys</dt>
            <dd className="font-mono">
              {info ? `${formatBytes(info.bytes)} · ${info.keys}` : "…"}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={onChooseDir} disabled={!desktop || busy}>
            <FolderOpen className="mr-1.5 h-4 w-4" />
            Choose data folder
          </Button>
          <Button size="sm" variant="outline" onClick={() => void revealDataDir()} disabled={!desktop}>
            <HardDrive className="mr-1.5 h-4 w-4" />
            Open folder
          </Button>
          <Button size="sm" variant="outline" onClick={onMigrate} disabled={!desktop || busy}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Import browser data
          </Button>
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-2 text-sm font-semibold">Profile backup</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          A single JSON with every setting, conversation, agent and watchlist. Works in both runtimes — export here,
          import on another machine.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onExport} disabled={busy}>
            <Download className="mr-1.5 h-4 w-4" />
            Export profile
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import profile
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-5 text-sm">
        <h3 className="mb-2 font-semibold">Run it anywhere</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Download the full backup from the Code Export tab.</li>
          <li>
            <code className="font-mono text-xs">bun install</code> then{" "}
            <code className="font-mono text-xs">bun run desktop:build</code>.
          </li>
          <li>Launch the packaged app and pick your data folder on first run.</li>
          <li>The Python engine bootstraps its own isolated venv on first start.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">See PORTABLE.md in the bundle for the full guide.</p>
      </div>

      <CloudSyncCard />
    </div>

  );
}
