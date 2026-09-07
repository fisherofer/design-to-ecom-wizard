/**
 * RiskGuardPanel — portfolio-level risk limits and live utilisation.
 *
 * Shows how much of each limit the open book is consuming, breaks exposure
 * down by sector, and lets the operator move the limits. The daily loss stop
 * can halt trading automatically.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  getRiskLimits,
  setRiskLimits,
  useRiskAssessment,
  type RiskLimits,
} from "@/lib/riskGuard";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function Bar({ used, limit, label, value }: { used: number; limit: number; label: string; value: string }) {
  const ratio = limit > 0 ? Math.min(used / limit, 1.5) : 0;
  const tone =
    ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
    </div>
  );
}

export function RiskGuardPanel() {
  const risk = useRiskAssessment(5000);
  const [limits, setLimitsState] = useState<RiskLimits>(() => getRiskLimits());
  const [editing, setEditing] = useState(false);

  const worst = risk.worstUtilisationPct;
  const status = useMemo(() => {
    if (risk.breaches.some((b) => b.severity === "critical")) return { label: "Limit breached", tone: "destructive" as const };
    if (risk.breaches.length) return { label: "Concentration warning", tone: "secondary" as const };
    if (worst >= 80) return { label: "Near limit", tone: "secondary" as const };
    return { label: "Within limits", tone: "outline" as const };
  }, [risk.breaches, worst]);

  const update = (patch: Partial<RiskLimits>) => {
    const next = setRiskLimits(patch);
    setLimitsState(next);
  };

  const numField = (key: keyof RiskLimits, label: string, suffix: string) => (
    <div className="space-y-1">
      <Label htmlFor={`risk-${key}`} className="text-xs text-muted-foreground">
        {label} <span className="opacity-60">({suffix})</span>
      </Label>
      <Input
        id={`risk-${key}`}
        type="number"
        inputMode="decimal"
        value={String(limits[key] as number)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) update({ [key]: v } as Partial<RiskLimits>);
        }}
        className="h-8 font-mono text-sm"
      />
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {risk.breaches.length ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-primary" />
          )}
          <h2 className="font-display text-sm font-semibold tracking-tight">Portfolio Risk Guard</h2>
          <Badge variant={status.tone}>{status.label}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
          {editing ? "Done" : "Limits"}
        </Button>
      </header>

      {risk.breaches.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {risk.breaches.map((b) => (
            <li
              key={`${b.code}-${b.label}`}
              className={cn(
                "rounded-md border px-3 py-2 text-xs",
                b.severity === "critical"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
              )}
            >
              <span className="font-semibold">{b.label}: </span>
              {b.detail}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Bar
            label="Total exposure"
            used={risk.grossPct}
            limit={limits.maxGrossExposurePct}
            value={`${risk.grossPct}% / ${limits.maxGrossExposurePct}%`}
          />
          <Bar
            label="Largest single name"
            used={risk.largest?.pctOfEquity ?? 0}
            limit={limits.maxSinglePositionPct}
            value={
              risk.largest
                ? `${risk.largest.symbol} ${risk.largest.pctOfEquity}% / ${limits.maxSinglePositionPct}%`
                : `— / ${limits.maxSinglePositionPct}%`
            }
          />
          <Bar
            label="Open positions"
            used={risk.openPositions}
            limit={limits.maxOpenPositions}
            value={`${risk.openPositions} / ${limits.maxOpenPositions}`}
          />
          <Bar
            label="Daily loss stop"
            used={risk.dailyLossPct}
            limit={limits.maxDailyLossPct}
            value={`${risk.dailyLossPct}% / ${limits.maxDailyLossPct}%`}
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Exposure by sector</p>
          {risk.sectors.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open positions.</p>
          ) : (
            <ul className="space-y-1.5">
              {risk.sectors.map((s) => (
                <li key={s.sector}>
                  <Bar
                    label={`${s.sector} · ${s.symbols.join(", ")}`}
                    used={s.pctOfEquity}
                    limit={limits.maxSectorExposurePct}
                    value={`${s.pctOfEquity}% · ${usd(s.notionalUsd)}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Equity base</dt>
          <dd className="font-mono tabular-nums">{usd(risk.equityUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Open notional</dt>
          <dd className="font-mono tabular-nums">{usd(risk.grossNotionalUsd)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Unrealised</dt>
          <dd className={cn("font-mono tabular-nums", risk.unrealizedUsd < 0 ? "text-destructive" : "text-primary")}>
            {usd(risk.unrealizedUsd)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Realised today</dt>
          <dd className={cn("font-mono tabular-nums", risk.dailyRealizedUsd < 0 ? "text-destructive" : "text-primary")}>
            {usd(risk.dailyRealizedUsd)}
          </dd>
        </div>
      </dl>

      {editing && (
        <div className="mt-4 space-y-3 rounded-lg border border-dashed border-border p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {numField("accountEquityUsd", "Equity base", "USD")}
            {numField("maxGrossExposurePct", "Max total exposure", "% of equity")}
            {numField("maxSinglePositionPct", "Max single name", "% of equity")}
            {numField("maxSectorExposurePct", "Max per sector", "% of equity")}
            {numField("maxOpenPositions", "Max open positions", "count")}
            {numField("maxDailyLossPct", "Daily loss stop", "% of equity")}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
            <Label htmlFor="risk-autohalt" className="text-xs">
              Halt trading automatically when the daily loss stop is hit
            </Label>
            <Switch
              id="risk-autohalt"
              checked={limits.autoHaltOnDailyLoss}
              onCheckedChange={(v) => update({ autoHaltOnDailyLoss: v })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
