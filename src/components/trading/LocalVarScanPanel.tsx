/**
 * LocalVarScanPanel — load GGUF weights from the local models dir and run a
 * local-model risk scan against the engine's real ATR VaR.
 */
import { useCallback, useEffect, useState } from "react";
import { Cpu, Download, HardDrive, Loader2, Play, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getLocalAiStatus,
  loadGgufModel,
  loadedModels,
  runLocalVarScan,
  unloadGgufModel,
  type LocalAiStatus,
  type ScanResult,
} from "@/lib/localAiScan";
import { cn } from "@/lib/utils";

const SCAN_UNIVERSE = ["AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

const mb = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GB`;
const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function LocalVarScanPanel() {
  const [status, setStatus] = useState<LocalAiStatus | null>(null);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);

  const refresh = useCallback(async () => {
    const [s, l] = await Promise.all([
      getLocalAiStatus(),
      loadedModels().catch(() => ({ ok: false, models: [] as { path: string }[] })),
    ]);
    setStatus(s);
    setLoaded(l.models.map((m) => m.path));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const ggufs = (status?.local_files.models ?? []).filter((m) => m.format === "gguf");

  const onLoad = async (path: string) => {
    setBusy(path);
    try {
      const res = await loadGgufModel(path);
      toast.success(res.already_loaded ? `${res.name} already resident` : `Loaded ${res.name}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(null);
    }
  };

  const onUnload = async (path: string) => {
    setBusy(path);
    try {
      await unloadGgufModel(path);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const onScan = async () => {
    setBusy("scan");
    try {
      const res = await runLocalVarScan(SCAN_UNIVERSE);
      setScan(res);
      if (!res.ok) toast.error(res.error ?? "Local scan produced no comparable rows");
      else toast.success(`Local scan via ${res.runtime} — avg |Δ| ${res.avgAbsDeltaPct}% vs ATR VaR`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Cpu className="h-4 w-4 text-primary" />
        <span className="font-display text-sm font-semibold">Local AI · GGUF VaR scan</span>
        <Badge variant={status?.ready ? "default" : "secondary"} className="gap-1">
          <HardDrive className="h-3 w-3" />
          {status?.models_dir ?? "…"}
        </Badge>
        {status?.ollama.running ? <Badge variant="outline">Ollama up</Badge> : null}
        {status?.lmstudio.running ? <Badge variant="outline">LM Studio up</Badge> : null}
        {status?.error ? <Badge variant="destructive">backend offline</Badge> : null}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refresh()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" disabled={busy === "scan"} onClick={() => void onScan()}>
            {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run local scan
          </Button>
        </div>
      </div>

      {/* models */}
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        {ggufs.map((m) => {
          const isLoaded = loaded.includes(m.path);
          return (
            <div
              key={m.path}
              className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{m.name}</div>
                <div className="text-xs text-muted-foreground">{mb(m.size_bytes)}</div>
              </div>
              <Badge variant={isLoaded ? "default" : "secondary"}>{isLoaded ? "resident" : "on disk"}</Badge>
              <Button
                size="icon"
                variant="ghost"
                disabled={busy === m.path}
                onClick={() => void (isLoaded ? onUnload(m.path) : onLoad(m.path))}
                aria-label={isLoaded ? `Unload ${m.name}` : `Load ${m.name}`}
              >
                {busy === m.path ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isLoaded ? (
                  <Trash2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        })}
        {ggufs.length === 0 ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {status?.error
              ? `Local AI backend unreachable (${status.error}) — start the hub to scan GGUF weights.`
              : `No .gguf weights found in ${status?.local_files.dir ?? "the models dir"}. Drop files there or point OFER_LOCAL_MODELS_DIR at your own drive.`}
          </p>
        ) : null}
      </div>

      {/* comparison */}
      {scan ? (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-start">Symbol</th>
                <th className="p-2 text-end">Price</th>
                <th className="p-2 text-end">ATR(14)</th>
                <th className="p-2 text-end">Engine VaR</th>
                <th className="p-2 text-end">Model VaR</th>
                <th className="p-2 text-end">Δ%</th>
                <th className="p-2 text-start">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {scan.rows.map((r) => (
                <tr key={r.symbol} className="border-b border-border/60 last:border-0">
                  <td className="p-2 font-mono text-xs">{r.symbol}</td>
                  <td className="p-2 text-end tabular-nums">{r.price.toFixed(2)}</td>
                  <td className="p-2 text-end tabular-nums">{r.atr14}</td>
                  <td className="p-2 text-end tabular-nums">{usd(r.engineVarUsd)}</td>
                  <td className="p-2 text-end tabular-nums">
                    {r.modelVarUsd === null ? "—" : usd(r.modelVarUsd)}
                  </td>
                  <td
                    className={cn(
                      "p-2 text-end tabular-nums",
                      r.deltaPct !== null && Math.abs(r.deltaPct) > 10 && "text-amber-500",
                    )}
                  >
                    {r.deltaPct === null ? "—" : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%`}
                  </td>
                  <td className="p-2">
                    <Badge variant={r.verdict === "ALIGNED" ? "default" : r.verdict === "NO_MODEL" ? "destructive" : "secondary"}>
                      {r.verdict}
                    </Badge>
                  </td>
                </tr>
              ))}
              {scan.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    {scan.error ?? "No comparable rows — the quote feed returned nothing."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="border-t border-border p-3 text-xs text-muted-foreground">
            {scan.runtime
              ? `runtime ${scan.runtime} · model ${scan.model} · avg |Δ| ${scan.avgAbsDeltaPct}% vs the engine ATR VaR · ${new Date(scan.ranAt).toLocaleTimeString()}`
              : (scan.error ?? "no local runtime answered")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
