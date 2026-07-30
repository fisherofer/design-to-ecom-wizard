/**
 * ApiPreflightPanel — endpoint-level readiness verification.
 *
 * For every connected provider it shows which concrete endpoints answer,
 * which required response fields are present, which env vars are still
 * missing, and whether the fleet is cleared to run agents.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  MinusCircle,
  Plug,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { preflightApis, type PreflightProvider, type PreflightReport, type PreflightStatus } from "@/lib/apiPreflight.functions";
import { ApiConnectModal } from "@/components/vault/ApiConnectModal";

const TONE: Record<PreflightStatus, string> = {
  pass: "text-success border-success/40 bg-success/10",
  fail: "text-destructive border-destructive/40 bg-destructive/10",
  skipped: "text-muted-foreground border-border bg-muted/30",
};

const ICON: Record<PreflightStatus, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  skipped: MinusCircle,
};

export function ApiPreflightPanel() {
  const run = useServerFn(preflightApis);
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [connect, setConnect] = useState<PreflightProvider | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setReport(await run());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const t = report?.totals;

  return (
    <section className="mb-6 rounded-xl border border-border glass p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
            {report?.readyForAgents ? (
              <ShieldCheck className="h-4 w-4 text-success" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-warning" />
            )}
          </div>
          <div>
            <h2 className="font-display text-sm font-semibold">Interface Preflight · Endpoint Verification</h2>
            <p className="text-[11px] font-mono text-muted-foreground">
              {t
                ? `${t.endpointsPass}/${t.endpoints} endpoints OK · ${t.pass} ready · ${t.fail} failing · ${t.skipped} not configured · ${report!.durationMs}ms`
                : "Verifying endpoints…"}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs font-mono disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Re-verify
        </button>
      </header>

      {err && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Preflight failed: {err}
        </div>
      )}

      {report && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs font-mono ${
            report.readyForAgents ? TONE.pass : TONE.fail
          }`}
        >
          {report.readyForAgents
            ? "All critical interfaces verified — agents are cleared to run."
            : `Agents blocked · ${report.blockers.join(" · ")}`}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {report?.providers.map((p) => {
          const Icon = ICON[p.status];
          const expanded = open[p.id] ?? p.status === "fail";
          return (
            <div key={p.id} className={`rounded-lg border ${TONE[p.status]}`}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [p.id]: !expanded }))}
                className="flex w-full items-start justify-between gap-2 p-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{p.provider}</span>
                    {p.critical && (
                      <span className="rounded border border-current/40 px-1 py-0.5 font-mono text-[9px] uppercase">
                        required
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 pl-5 text-[11px] font-mono opacity-80">
                    {p.category} · {p.reason}
                  </div>
                </div>
                <span className="rounded border border-current/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider">
                  {p.status}
                </span>
              </button>

              {expanded && (
                <div className="space-y-1.5 border-t border-current/20 p-3 pt-2.5">
                  {p.missingEnv.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                      <span className="opacity-80">Missing fields:</span>
                      {p.missingEnv.map((e) => (
                        <code key={e} className="rounded border border-current/40 px-1 py-0.5 text-[10px]">
                          {e}
                        </code>
                      ))}
                      <button
                        onClick={() => setConnect(p)}
                        className="ml-auto inline-flex items-center gap-1 rounded border border-current/40 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-current/10"
                      >
                        <Plug className="h-3 w-3" /> Connect
                      </button>
                    </div>
                  )}

                  {p.endpoints.map((e) => {
                    const EIcon = ICON[e.status];
                    return (
                      <div
                        key={e.id}
                        className="rounded border border-current/20 bg-background/30 px-2 py-1.5 text-[11px] font-mono"
                      >
                        <div className="flex items-center gap-1.5">
                          <EIcon className="h-3 w-3 shrink-0" />
                          <span className="font-semibold text-foreground">{e.method}</span>
                          <span className="truncate">{e.label}</span>
                          <span className="ml-auto opacity-70">
                            {e.httpStatus ?? "—"}
                            {typeof e.latencyMs === "number" ? ` · ${e.latencyMs}ms` : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate pl-4 opacity-70">{e.url}</div>
                        <div className="pl-4 opacity-80">{e.reason}</div>
                        {e.requiredFields.length > 0 && (
                          <div className="pl-4 opacity-70">
                            fields: {e.requiredFields.join(", ")}
                            {e.missingFields.length ? ` · missing: ${e.missingFields.join(", ")}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {!loading && !report && !err && (
          <div className="rounded-md border border-border bg-card/40 px-3 py-6 text-center text-xs font-mono text-muted-foreground">
            No preflight data.
          </div>
        )}
      </div>

      <ApiConnectModal
        providerId={connect?.id ?? null}
        providerName={connect?.provider}
        reason={connect?.reason}
        onClose={() => setConnect(null)}
        onSaved={refresh}
      />
    </section>
  );
}
