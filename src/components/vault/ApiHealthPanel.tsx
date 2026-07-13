/**
 * ApiHealthPanel — live health probe for every configured provider key.
 *
 * Groups results by category, shows status/reason/latency/quota/token counts,
 * and re-probes on demand.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, HelpCircle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { probeAllApis, type ApiHealthResult, type ApiHealthStatus } from "@/lib/apiHealth.functions";

const STATUS_ICON: Record<ApiHealthStatus, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle,
  missing: HelpCircle,
};

const STATUS_CLASS: Record<ApiHealthStatus, string> = {
  ok: "text-success border-success/40 bg-success/10",
  warn: "text-warning border-warning/40 bg-warning/10",
  error: "text-destructive border-destructive/40 bg-destructive/10",
  missing: "text-muted-foreground border-border bg-muted/30",
};

export function ApiHealthPanel() {
  const probe = useServerFn(probeAllApis);
  const [results, setResults] = useState<ApiHealthResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ranAt, setRanAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await probe();
      setResults(r);
      setRanAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [probe]);

  useEffect(() => {
    run();
  }, [run]);

  const byCategory = useMemo(() => {
    const map = new Map<string, ApiHealthResult[]>();
    for (const r of results) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  }, [results]);

  const summary = useMemo(() => {
    const s = { ok: 0, warn: 0, error: 0, missing: 0 };
    for (const r of results) s[r.status]++;
    return s;
  }, [results]);

  return (
    <section className="mb-6 rounded-xl border border-border glass p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold">Provider Health · Live Probe</h2>
            <p className="text-[11px] font-mono text-muted-foreground">
              {results.length ? `${results.length} providers checked` : "Probing…"}
              {ranAt ? ` · ${new Date(ranAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Legend label="OK" count={summary.ok} tone="ok" />
          <Legend label="Warn" count={summary.warn} tone="warn" />
          <Legend label="Error" count={summary.error} tone="error" />
          <Legend label="Missing" count={summary.missing} tone="missing" />
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs font-mono hover:text-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-probe
          </button>
        </div>
      </header>

      {err && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Probe failed: {err}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {Array.from(byCategory.entries()).map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{cat}</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {list.map((r) => (
                <HealthCard key={r.id} r={r} />
              ))}
            </div>
          </div>
        ))}
        {!loading && results.length === 0 && !err && (
          <div className="rounded-md border border-border bg-card/40 px-3 py-6 text-center text-xs font-mono text-muted-foreground">
            No providers detected.
          </div>
        )}
      </div>
    </section>
  );
}

function HealthCard({ r }: { r: ApiHealthResult }) {
  const Icon = STATUS_ICON[r.status];
  const cls = STATUS_CLASS[r.status];
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-sm text-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{r.provider}</span>
          </div>
          <div className="mt-0.5 text-[11px] font-mono opacity-80 truncate">{r.reason}</div>
        </div>
        <span className="rounded border border-current/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
          {r.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
        {typeof r.latencyMs === "number" && (
          <span title="Round-trip latency">⏱ {r.latencyMs}ms</span>
        )}
        {typeof r.modelsCount === "number" && (
          <span title="Models exposed">◇ {r.modelsCount} models</span>
        )}
        {r.quota && (
          <span title={r.quota.period} className="col-span-3">
            🎫 {r.quota.remaining?.toLocaleString() ?? "?"} / {r.quota.limit?.toLocaleString() ?? "?"}{" "}
            {r.quota.period ? `· ${r.quota.period}` : ""}
          </span>
        )}
        {r.hint && <span className="col-span-3 opacity-90">💡 {r.hint}</span>}
      </div>
    </div>
  );
}

function Legend({ label, count, tone }: { label: string; count: number; tone: ApiHealthStatus }) {
  return (
    <span className={`hidden sm:inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] ${STATUS_CLASS[tone]}`}>
      {label} <span className="tabular-nums">{count}</span>
    </span>
  );
}
