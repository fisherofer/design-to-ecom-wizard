/**
 * VenvManager — real UI for hub/venv_manager.py exposed via hub/venv_routes.py.
 * Renders live backend state only. Never fabricates package lists client-side.
 *
 * Adds a periodic health poller with a user-configurable interval, a
 * "last checked" timestamp, latency measurement, and a one-shot toast when
 * the backend transitions offline → recovers, or online → drops.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Boxes,
  RefreshCw,
  Wand2,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Package,
  Activity,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { venvApi, type VenvStatus } from "@/lib/venvApi";

const INTERVAL_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5s", value: 5_000 },
  { label: "15s", value: 15_000 },
  { label: "30s", value: 30_000 },
  { label: "1m", value: 60_000 },
  { label: "5m", value: 300_000 },
];
const STORAGE_KEY = "venvManager.pollMs";

export function VenvManager() {
  const [status, setStatus] = useState<VenvStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pkgInput, setPkgInput] = useState("");
  const [filter, setFilter] = useState("");
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pollMs, setPollMs] = useState<number>(() => {
    if (typeof window === "undefined") return 30_000;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : 30_000;
  });
  const wasOnlineRef = useRef<boolean | null>(null);

  const refresh = useCallback(async () => {
    setBusy((b) => b ?? "status");
    const started = performance.now();
    const res = await venvApi.status();
    const took = Math.round(performance.now() - started);
    setLatencyMs(took);
    setLastChecked(new Date());
    if (res.ok) {
      setStatus(res.data);
      setError(null);
      if (wasOnlineRef.current === false) {
        toast.success("Backend online — venv status recovered");
      }
      wasOnlineRef.current = true;
    } else {
      setStatus(null);
      setError(res.error);
      if (wasOnlineRef.current === true || wasOnlineRef.current === null) {
        // Only alert when we transition to offline, not on every poll
        if (wasOnlineRef.current === true) {
          toast.error(`Backend unreachable: ${res.error}`);
        }
      }
      wasOnlineRef.current = false;
    }
    setBusy(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(pollMs));
    }
  }, [pollMs]);

  async function run(
    label: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg: string,
  ) {
    setBusy(label);
    const res = await fn();
    if (res.ok) toast.success(successMsg);
    else toast.error(res.error || `${label} failed`);
    setBusy(null);
    await refresh();
  }

  async function handleInstall() {
    const pkg = pkgInput.trim();
    if (!pkg) return;
    await run("install", () => venvApi.install(pkg), `Installed ${pkg}`);
    setPkgInput("");
  }

  async function handleUninstall(pkg: string) {
    if (!confirm(`Uninstall ${pkg} from the venv?`)) return;
    await run(`uninstall:${pkg}`, () => venvApi.uninstall(pkg), `Removed ${pkg}`);
  }

  async function handleRecreate() {
    if (
      !confirm(
        "Delete the .venv and rebuild it from requirements.txt? This wipes all installed packages.",
      )
    )
      return;
    await run("recreate", () => venvApi.recreate(), "Venv recreated");
  }

  const packages = status?.packages ?? [];
  const visible = filter
    ? packages.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : packages;

  const online = !!status && !error;

  return (
    <Card className="border-border/60 bg-card/40 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Python VENV Manager
          </h3>
          {online ? (
            status!.venv_exists ? (
              <Badge variant="outline" className="border-success/40 text-success text-[10px]">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Ready
              </Badge>
            ) : (
              <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">
                <AlertTriangle className="mr-1 h-3 w-3" /> Not Created
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="border-destructive/40 text-destructive text-[10px]">
              <WifiOff className="mr-1 h-3 w-3" /> Offline
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
            <Activity className="h-3 w-3" />
            <span>
              {lastChecked ? lastChecked.toLocaleTimeString() : "—"}
              {latencyMs != null && online ? ` · ${latencyMs}ms` : ""}
            </span>
          </div>
          <Select
            value={String(pollMs)}
            onValueChange={(v) => setPollMs(Number(v))}
          >
            <SelectTrigger className="h-7 w-[88px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)} className="text-[11px]">
                  Poll: {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={busy !== null}>
            {busy === "status" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => run("heal", () => venvApi.heal(), "Venv healed")}
            disabled={busy !== null || !online}
          >
            {busy === "heal" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Heal
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecreate}
            disabled={busy !== null || !online}
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            {busy === "recreate" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Recreate
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-semibold">Backend unreachable</div>
            <div className="mt-0.5 font-mono text-[11px] opacity-80">{error}</div>
            <div className="mt-1 text-muted-foreground">
              Start the local FastAPI backend (see BOOTSTRAP_README.md → run{" "}
              <span className="font-mono">python system_orchestrator.py</span>).
              {pollMs > 0 && (
                <> Auto-retrying every {Math.round(pollMs / 1000)}s.</>
              )}
            </div>
          </div>
        </div>
      )}

      {status && (
        <>
          <div className="mb-4 grid gap-3 text-[11px] font-mono sm:grid-cols-4">
            <Stat label="OS" value={status.os} />
            <Stat label="Host Python" value={status.host_python} />
            <Stat label="Venv Python" value={status.venv_python_version ?? "—"} />
            <Stat
              label="Disk"
              value={`${(status.disk_usage_bytes / 1024 / 1024).toFixed(1)} MB`}
            />
          </div>
          <div className="mb-4 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-[10px] font-mono text-muted-foreground">
            <span className="uppercase tracking-wider">Venv path:</span>{" "}
            <span className="text-foreground">{status.venv_dir}</span>
          </div>

          {status.health.missing && status.health.missing.length > 0 && (
            <div className="mb-3 rounded-md border border-warning/40 bg-warning/5 p-2 text-[11px]">
              <span className="font-semibold text-warning">
                {status.health.missing.length} missing:
              </span>{" "}
              <span className="font-mono text-muted-foreground">
                {status.health.missing.join(", ")}
              </span>
            </div>
          )}

          <div className="mb-3 flex gap-2">
            <Input
              placeholder="pandas==2.2.0"
              value={pkgInput}
              onChange={(e) => setPkgInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInstall()}
              className="h-8 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={handleInstall}
              disabled={busy !== null || !pkgInput.trim()}
            >
              {busy === "install" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Install
            </Button>
          </div>

          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              <Package className="mr-1 inline h-3 w-3" />
              {packages.length} installed
              {status.health.required_count != null && (
                <> · {status.health.installed_count ?? packages.length}/{status.health.required_count} required</>
              )}
            </span>
            <Input
              placeholder="filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-6 w-40 font-mono text-[11px]"
            />
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-border/60 bg-background/40">
            {visible.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {status.venv_exists ? "No matching packages." : "Venv not created yet."}
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {visible.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-mono"
                  >
                    <span className="truncate">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{p.version}</span>
                      <button
                        onClick={() => handleUninstall(p.name)}
                        disabled={busy !== null}
                        className="text-destructive/70 hover:text-destructive disabled:opacity-40"
                        title={`Uninstall ${p.name}`}
                      >
                        {busy === `uninstall:${p.name}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-foreground">{value}</div>
    </div>
  );
}
