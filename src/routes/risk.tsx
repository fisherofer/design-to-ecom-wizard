import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert, RefreshCw, AlertTriangle } from "lucide-react";
import { RiskGuardPanel } from "@/components/trading/RiskGuardPanel";
import { getQuantApiBase } from "@/lib/apiConfig";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk Management — Exposure, Limits & Circuit Breaker" },
      {
        name: "description",
        content:
          "Pre-trade risk limits, gross and single-name exposure, daily loss stop and the backend circuit breaker in one control room.",
      },
      { property: "og:title", content: "Risk Management — Exposure, Limits & Circuit Breaker" },
      {
        property: "og:description",
        content: "Portfolio risk gate: exposure limits, daily loss stop and backend circuit breaker state.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RiskPage,
});

interface BackendRisk {
  success?: boolean;
  equity?: number;
  circuit_breaker?: boolean;
  daily_pnl?: number;
  max_daily_loss?: number;
  [k: string]: unknown;
}

function RiskPage() {
  const [backend, setBackend] = useState<BackendRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${getQuantApiBase()}/api/risk/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`hub returned ${res.status}`);
      setBackend((await res.json()) as BackendRisk);
    } catch (e) {
      setBackend(null);
      setError((e as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const resetBreaker = async () => {
    try {
      await fetch(`${getQuantApiBase()}/api/risk/reset-circuit-breaker`, { method: "POST" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldAlert className="h-5 w-5 text-primary" />
            ניהול סיכונים
          </h1>
          <p className="text-sm text-muted-foreground">מגבלות חשיפה, עצירת הפסד יומית ומפסק זרם בצד השרת.</p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          רענן
        </button>
      </header>

      <RiskGuardPanel />

      <section className="rounded-xl border border-border glass p-4">
        <h2 className="text-sm font-semibold">מנוע הסיכון בשרת המקומי</h2>
        {error && (
          <p className="mt-2 flex items-center gap-2 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            אין חיבור לשרת המקומי ({error}). המגבלות בדפדפן ממשיכות לפעול.
          </p>
        )}
        {backend && (
          <>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">הון</dt>
                <dd className="font-mono">{backend.equity != null ? `$${Number(backend.equity).toLocaleString()}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">P&amp;L יומי</dt>
                <dd className="font-mono">{backend.daily_pnl != null ? `$${Number(backend.daily_pnl).toFixed(2)}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">מפסק זרם</dt>
                <dd className={backend.circuit_breaker ? "font-mono text-destructive" : "font-mono text-success"}>
                  {backend.circuit_breaker ? "מופעל" : "פתוח"}
                </dd>
              </div>
            </dl>
            {backend.circuit_breaker && (
              <button
                onClick={() => void resetBreaker()}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                אפס מפסק זרם
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
