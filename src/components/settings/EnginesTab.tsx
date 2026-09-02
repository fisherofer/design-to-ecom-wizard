/**
 * EnginesTab — control surface for the two imported Python engines:
 * mock_data_guard_engine.py and smart_llm_execution_engine.py.
 * Includes the dual-loop parameters, circuit-breaker policy, a run-status
 * dashboard and downloadable logs.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Download,
  FlaskConical,
  Gauge,
  Play,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  atrVarUsd,
  buildLogBundle,
  buildLogCsv,
  clearRuns,
  importEngineProfile,
  recordRun,
  seededAt,
  summarizeRuns,
  useEngineRuns,
  useGuardConfig,
  useSmartConfig,
  type GuardMode,
  type SmartLlmConfig,
} from "@/lib/engineConfig";

const GUARD_MODES: Array<{ id: GuardMode; label: string; hint: string }> = [
  { id: "SIMULATION", label: "Simulation (דמה)", hint: "All snapshots are marked simulated; orders stay in paper mode." },
  { id: "BLOCK_LIVE", label: "Block live orders (חסום מסחר חי)", hint: "Live orders are rejected whenever the payload is simulated or stale." },
  { id: "LIVE_STRICT", label: "Live strict", hint: "Live orders allowed only with fresh, verified, non-simulated data." },
];

function NumField({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  step?: number;
  min?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">
        {label} {suffix ? <span className="font-mono">({suffix})</span> : null}
      </Label>
      <Input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 font-mono text-sm"
      />
    </div>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function EnginesTab() {
  const [guard, patchGuard] = useGuardConfig();
  const [smart, patchSmart] = useSmartConfig();
  const runs = useEngineRuns();
  const [seed, setSeed] = useState<{ at: string | null; files: number; tests: number }>({
    at: null,
    files: 0,
    tests: 0,
  });

  // Auto-import engine configs + captured tests into the Portable profile once.
  useEffect(() => {
    const res = importEngineProfile(false);
    setSeed({
      at: seededAt(),
      files: res.files.filter((f) => f.kind === "engine").length,
      tests: res.files.filter((f) => f.kind === "test").length,
    });
    if (res.seeded) toast.success("Engine settings & tests imported into the portable profile");
  }, []);

  const summary = useMemo(() => summarizeRuns(runs), [runs]);
  const weightSum = smart.weightTechnical + smart.weightMicha + smart.weightAi;
  const sample = atrVarUsd(smart, 4);

  const dryRun = () => {
    const atr = 3 + Math.random() * 4;
    const { varUsd } = atrVarUsd(smart, atr);
    const technical = 35 + Math.random() * 60;
    const micha = 35 + Math.random() * 60;
    const ai = 30 + Math.random() * 70;
    const final =
      (technical * smart.weightTechnical + micha * smart.weightMicha + ai * smart.weightAi) /
      (weightSum || 1);
    const drawdown = Math.max(0, summary.maxDd + Math.random() * 1.2 - 0.4);
    const breaker = drawdown >= smart.maxDrawdownPct;
    const blockedByGuard = guard.enabled && guard.mode !== "LIVE_STRICT" && guard.blockLiveOnSimulated;
    recordRun({
      symbol: ["AAPL", "NVDA", "TSLA", "MSFT", "AMD"][Math.floor(Math.random() * 5)],
      action: breaker || blockedByGuard ? "BLOCKED" : final >= smart.minScore ? "BUY" : "HOLD",
      finalScore: Number(final.toFixed(1)),
      technicalScore: Number(technical.toFixed(1)),
      michaScore: Number(micha.toFixed(1)),
      aiScore: Number(ai.toFixed(1)),
      atrVarUsd: Number(varUsd.toFixed(2)),
      equityUsd: smart.initialEquityUsd * (1 - drawdown / 100),
      drawdownPct: Number(drawdown.toFixed(2)),
      breaker,
      simulated: true,
      note: breaker
        ? "Circuit breaker: drawdown limit exceeded"
        : blockedByGuard
          ? `Mock data guard (${guard.mode})`
          : `dual-loop ${smart.fastLoopMs}ms / ${smart.slowLoopSec}s`,
    });
    toast.success("Dry-run recorded");
  };

  return (
    <div className="space-y-6">
      {/* ---------------- Mock data guard ---------------- */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Mock Data Guard Engine
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enforces the simulated-data contract before any order leaves the system
              (<code className="font-mono text-xs">mock_data_guard_engine.py</code>).
            </p>
          </div>
          <Switch checked={guard.enabled} onCheckedChange={(v) => patchGuard({ enabled: v })} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Execution mode</Label>
            <Select value={guard.mode} onValueChange={(v) => patchGuard({ mode: v as GuardMode })}>
              <SelectTrigger className="h-9" disabled={!guard.enabled}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GUARD_MODES.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {GUARD_MODES.find((m) => m.id === guard.mode)?.hint}
            </p>
          </div>
          <NumField
            label="Max snapshot age"
            suffix="sec"
            value={guard.maxSnapshotAgeSec}
            onChange={(n) => patchGuard({ maxSnapshotAgeSec: n })}
          />
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Block live orders when payload is simulated
            <Switch
              checked={guard.blockLiveOnSimulated}
              disabled={!guard.enabled}
              onCheckedChange={(v) => patchGuard({ blockLiveOnSimulated: v })}
            />
          </label>
          <label className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
            Use dynamic SQLite watchlist from the engine
            <Switch
              checked={guard.useDynamicWatchlist}
              disabled={!guard.enabled}
              onCheckedChange={(v) => patchGuard({ useDynamicWatchlist: v })}
            />
          </label>
        </div>

        <div
          className={`mt-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            !guard.enabled
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : guard.mode === "LIVE_STRICT"
                ? "border-warning/40 bg-warning/5 text-warning"
                : "border-success/40 bg-success/5 text-success"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {!guard.enabled
            ? "Guard disabled — simulated data can reach live order paths."
            : guard.mode === "LIVE_STRICT"
              ? "Live strict: only verified real-time data is allowed to trade."
              : "Guard active before every run — simulated data cannot trade live."}
        </div>
      </section>

      {/* ---------------- Smart LLM execution engine ---------------- */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Zap className="h-5 w-5 text-primary" />
              Smart LLM Execution Engine
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Dual loop: a slow AI sentiment loop feeding a fast technical execution loop
              (<code className="font-mono text-xs">smart_llm_execution_engine.py</code>).
            </p>
          </div>
          <Switch checked={smart.enabled} onCheckedChange={(v) => patchSmart({ enabled: v })} />
        </div>

        <h3 className="mt-5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Dual loop
        </h3>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="Slow AI loop" suffix="sec" value={smart.slowLoopSec} onChange={(n) => patchSmart({ slowLoopSec: n })} />
          <NumField label="Fast execution loop" suffix="ms" value={smart.fastLoopMs} step={10} onChange={(n) => patchSmart({ fastLoopMs: n })} />
          <NumField label="Min score to act" value={smart.minScore} onChange={(n) => patchSmart({ minScore: n })} />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Router mode</Label>
            <Select
              value={smart.routerMode}
              onValueChange={(v) => patchSmart({ routerMode: v as SmartLlmConfig["routerMode"] })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local-first">Local first (Ollama → cloud)</SelectItem>
                <SelectItem value="cloud-first">Cloud first</SelectItem>
                <SelectItem value="local-only">Local only</SelectItem>
                <SelectItem value="cloud-only">Cloud only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="Weight · technical" value={smart.weightTechnical} step={0.05} onChange={(n) => patchSmart({ weightTechnical: n })} />
          <NumField label="Weight · micha" value={smart.weightMicha} step={0.05} onChange={(n) => patchSmart({ weightMicha: n })} />
          <NumField label="Weight · AI sentiment" value={smart.weightAi} step={0.05} onChange={(n) => patchSmart({ weightAi: n })} />
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Ollama endpoint</Label>
            <Input
              value={smart.ollamaEndpoint}
              onChange={(e) => patchSmart({ ollamaEndpoint: e.target.value })}
              className="h-9 font-mono text-xs"
            />
          </div>
        </div>
        {Math.abs(weightSum - 1) > 0.001 && (
          <p className="mt-2 text-xs text-warning">
            Weights sum to {weightSum.toFixed(2)} — scores are normalised, but 1.00 is recommended.
          </p>
        )}

        <h3 className="mt-6 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Circuit breaker &amp; risk policy
        </h3>
        <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumField label="Initial equity" suffix="USD" value={smart.initialEquityUsd} step={1000} onChange={(n) => patchSmart({ initialEquityUsd: n })} />
          <NumField label="Max drawdown" suffix="%" value={smart.maxDrawdownPct} step={0.5} onChange={(n) => patchSmart({ maxDrawdownPct: n })} />
          <NumField label="Risk per trade" suffix="%" value={smart.riskPerTradePct} step={0.1} onChange={(n) => patchSmart({ riskPerTradePct: n })} />
          <NumField label="Max open positions" value={smart.maxOpenPositions} onChange={(n) => patchSmart({ maxOpenPositions: n })} />
          <NumField label="ATR stop multiple" value={smart.atrStopMultiple} step={0.1} onChange={(n) => patchSmart({ atrStopMultiple: n })} />
          <NumField label="ATR target multiple" value={smart.atrTargetMultiple} step={0.1} onChange={(n) => patchSmart({ atrTargetMultiple: n })} />
          <NumField label="Cooldown after breaker" suffix="min" value={smart.cooldownMin} onChange={(n) => patchSmart({ cooldownMin: n })} />
          <label className="flex items-end justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            Auto-reset breaker
            <Switch checked={smart.autoResetBreaker} onCheckedChange={(v) => patchSmart({ autoResetBreaker: v })} />
          </label>
        </div>

        <div className="mt-4 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
          ATR(4.00) sizing preview → risk ${sample.riskUsd.toFixed(0)} · stop ${sample.stopDistance.toFixed(2)} ·
          {" "}{sample.shares} shares · VaR ${sample.varUsd.toFixed(0)}
        </div>
      </section>

      {/* ---------------- Run dashboard ---------------- */}
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            Execution status
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={dryRun}>
              <Play className="mr-1.5 h-4 w-4" />
              Dry run
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`smart-llm-log-${Date.now()}.json`, buildLogBundle(), "application/json")}
            >
              <Download className="mr-1.5 h-4 w-4" />
              JSON log
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => download(`smart-llm-runs-${Date.now()}.csv`, buildLogCsv(), "text/csv")}
            >
              <Download className="mr-1.5 h-4 w-4" />
              CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { clearRuns(); toast.success("Run log cleared"); }}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { k: "Runs", v: String(summary.total) },
            { k: "Decisions", v: String(summary.decisions) },
            { k: "Blocked", v: String(summary.blocked) },
            { k: "Avg ATR VaR", v: `$${summary.avgVar.toFixed(0)}` },
            { k: "Max drawdown", v: `${summary.maxDd.toFixed(2)}%` },
            { k: "Breaker hits", v: String(summary.breakerHits) },
          ].map((c) => (
            <div key={c.k} className="rounded-md border border-border bg-muted/20 p-3">
              <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{c.k}</dt>
              <dd className="mt-1 font-mono text-lg">{c.v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          Circuit breaker:
          <Badge variant={summary.last?.breaker ? "destructive" : "secondary"}>
            {summary.last?.breaker ? "TRIPPED" : "ARMED"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            limit {smart.maxDrawdownPct}% · cooldown {smart.cooldownMin}m ·{" "}
            {smart.autoResetBreaker ? "auto reset" : "manual reset"}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                {["Time", "Symbol", "Action", "Score", "ATR VaR", "DD %", "Breaker", "Note"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 25).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                    {new Date(r.ts).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-2 font-mono">{r.symbol}</td>
                  <td className="px-3 py-2">
                    <Badge variant={r.action === "BLOCKED" ? "destructive" : r.action === "BUY" ? "default" : "secondary"}>
                      {r.action}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.finalScore.toFixed(1)}</td>
                  <td className="px-3 py-2 font-mono">${r.atrVarUsd.toFixed(0)}</td>
                  <td className="px-3 py-2 font-mono">{r.drawdownPct.toFixed(2)}</td>
                  <td className="px-3 py-2">{r.breaker ? "🚨" : "—"}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-xs text-muted-foreground">{r.note}</td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No runs recorded yet — use “Dry run” to validate the current policy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- Portable profile import ---------------- */}
      <section className="rounded-lg border border-border bg-muted/30 p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <FlaskConical className="h-4 w-4 text-primary" />
          Portable profile import
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Engine defaults plus the captured Python sources and unit tests are copied into the
          Portable Data profile, so they travel with the desktop build.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Badge variant="secondary">{seed.files} engines</Badge>
          <Badge variant="secondary">{seed.tests} test suites</Badge>
          <span className="font-mono">
            {seed.at ? `imported ${new Date(seed.at).toLocaleString()}` : "not imported"}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const res = importEngineProfile(true);
              setSeed({
                at: seededAt(),
                files: res.files.filter((f) => f.kind === "engine").length,
                tests: res.files.filter((f) => f.kind === "test").length,
              });
              toast.success(`Re-imported ${res.files.length} files into the profile`);
            }}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Re-import
          </Button>
        </div>
      </section>
    </div>
  );
}
