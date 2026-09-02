/**
 * CloudSyncCard — two-way sync between the local Portable profile (SQLite /
 * localStorage) and the cloud, so the profile is portable in the cloud too.
 */
import { useEffect, useState } from "react";
import { Cloud, CloudUpload, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  countSyncableKeys,
  getDeviceId,
  getSyncSession,
  getSyncState,
  isAutoSyncOn,
  setAutoSync,
  setSyncSession,
  syncProfile,
  type SyncState,
} from "@/lib/cloudSync";

export function CloudSyncCard() {
  const [session, setSession] = useState("");
  const [device, setDevice] = useState("");
  const [state, setState] = useState<SyncState | null>(null);
  const [keys, setKeys] = useState(0);
  const [auto, setAutoState] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSession(getSyncSession());
    setDevice(getDeviceId());
    setState(getSyncState());
    setAutoState(isAutoSyncOn());
    void countSyncableKeys().then(setKeys);
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const res = await syncProfile();
      setState(res);
      void countSyncableKeys().then(setKeys);
      if (res.ok) toast.success(`Synced — ↑${res.pushed} ↓${res.pulled} (${res.conflicts} conflicts resolved)`);
      else toast.error(res.lastError ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void syncProfile().then(setState), 120000);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Cloud className="h-4 w-4 text-primary" />
            Cloud profile sync (two-way)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mirrors the local profile to the cloud and back, last-write-wins per key. API keys and
            vault entries are never uploaded.
          </p>
        </div>
        <Badge variant="outline">{keys} syncable keys</Badge>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Profile ID (paste on another machine)</Label>
          <div className="flex gap-2">
            <Input
              value={session}
              onChange={(e) => setSession(e.target.value)}
              onBlur={() => {
                if (session.trim().length >= 8) {
                  setSyncSession(session);
                  toast.success("Profile ID saved");
                } else {
                  toast.error("Profile ID must be at least 8 characters");
                }
              }}
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                void navigator.clipboard.writeText(session);
                toast.success("Copied");
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Device</Label>
          <Input value={device} readOnly className="font-mono text-xs" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy} className="gap-2">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          Sync now
        </Button>
        <div className="flex items-center gap-2">
          <Switch
            checked={auto}
            onCheckedChange={(v) => {
              setAutoState(v);
              setAutoSync(v);
            }}
          />
          <span className="text-sm text-muted-foreground">Auto-sync every 2 minutes</span>
        </div>
      </div>

      {state ? (
        <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div>Last run: {state.lastRunAt ? new Date(state.lastRunAt).toLocaleString() : "—"}</div>
          <div>Pushed: {state.pushed}</div>
          <div>Pulled: {state.pulled}</div>
          <div>Conflicts: {state.conflicts}</div>
          {state.lastError ? (
            <div className="text-destructive sm:col-span-4">Error: {state.lastError}</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
