/**
 * Budget tab — global / per-provider / per-key monthly spend caps.
 * Default global cap is $0 = free tier only (hard-stop enabled).
 */
import { useEffect, useState } from "react";
import { DollarSign, ShieldAlert, RotateCcw } from "lucide-react";
import { apiBudget, currentMonthKey, useApiBudget } from "@/lib/apiBudget";
import { api, type ApiKey } from "@/lib/api";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/modelDiscovery";
import { Field } from "@/components/settings/Field";

export function BudgetTab() {
  const state = useApiBudget();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  useEffect(() => { api.listKeys().then(setKeys); }, []);

  const mk = currentMonthKey();
  const month = state.usage.months[mk] ?? { total: 0, providers: {}, keys: {} };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" /> Monthly Budget
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Estimated spend for <span className="font-mono">{mk}</span> · caps apply per calendar month.
            </p>
          </div>
          <button
            onClick={() => apiBudget.resetMonth()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-elevated"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset this month
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Spent" value={`$${month.total.toFixed(2)}`} />
          <Stat label="Global Cap" value={state.caps.globalUsd === 0 ? "Free only" : `$${state.caps.globalUsd}`} />
          <Stat label="Hard Stop" value={state.caps.hardStop ? "Enabled" : "Off"} tone={state.caps.hardStop ? "good" : "warn"} />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Global monthly cap (USD)">
            <input
              type="number"
              min={0}
              step={1}
              value={state.caps.globalUsd}
              onChange={(e) => apiBudget.setGlobal(Number(e.target.value) || 0)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">0 = block anything with cost, free-tier only.</p>
          </Field>
          <Field label="Enforcement">
            <label className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={state.caps.hardStop}
                onChange={(e) => apiBudget.setHardStop(e.target.checked)}
              />
              <ShieldAlert className="h-4 w-4 text-warning" />
              Hard-stop when cap is reached
            </label>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Per-Provider Caps</h2>
        <p className="mt-1 text-sm text-muted-foreground">Optional. Leave 0 to inherit the global cap.</p>
        <div className="mt-4 grid gap-2">
          {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => {
            const cap = state.caps.perProviderUsd[p] ?? 0;
            const spent = month.providers[p] ?? 0;
            return (
              <div key={p} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{PROVIDER_LABELS[p]}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">spent ${spent.toFixed(2)}</div>
                </div>
                <input
                  type="number" min={0} step={1} value={cap}
                  onChange={(e) => apiBudget.setProvider(p, Number(e.target.value) || 0)}
                  className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                />
                <span className="text-right text-[10px] font-mono text-muted-foreground">USD / month</span>
              </div>
            );
          })}
        </div>
      </section>

      {keys.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
          <h2 className="font-display text-lg font-semibold">Per-Key Caps</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fine-grained per API key limit — useful for paid emergency keys.</p>
          <div className="mt-4 grid gap-2">
            {keys.map((k) => {
              const cap = state.caps.perKeyUsd[k.id] ?? 0;
              const spent = month.keys[k.id] ?? 0;
              return (
                <div key={k.id} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center gap-3 rounded-md border border-border bg-surface px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {k.provider} <span className="font-mono text-[10px] text-muted-foreground">{k.maskedKey}</span>
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">spent ${spent.toFixed(2)} · {k.tier}{k.paid ? " · paid" : ""}</div>
                  </div>
                  <input
                    type="number" min={0} step={1} value={cap}
                    onChange={(e) => apiBudget.setKey(k.id, Number(e.target.value) || 0)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs"
                  />
                  <span className="text-right text-[10px] font-mono text-muted-foreground">USD / month</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}
