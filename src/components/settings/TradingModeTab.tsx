/**
 * Trading Mode tab — master enable/disable for live-trading surfaces.
 */
import { ShieldCheck, ShieldOff, TrendingUp } from "lucide-react";
import { useTradingEnabled, TRADING_ROUTES } from "@/lib/tradingMode";

export function TradingModeTab() {
  const [enabled, setEnabled] = useTradingEnabled();

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Live Trading Mode
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When disabled, the Trading Hub, Portfolio, AI Triggers and Alerts pages are
              removed from the sidebar and the app runs in research-only mode.
            </p>
          </div>

          <button
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative h-8 w-14 rounded-full border transition-colors ${
              enabled ? "bg-success/80 border-success" : "bg-muted border-border"
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                enabled ? "translate-x-7" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        <div
          className={`mt-5 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
            enabled
              ? "border-success/40 bg-success/5 text-success"
              : "border-warning/40 bg-warning/5 text-warning"
          }`}
        >
          {enabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
          {enabled
            ? "Trading surfaces are visible. Orders can be prepared and dispatched."
            : "Trading is OFF. All order-entry surfaces are hidden from navigation."}
        </div>

        <div className="mt-5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Controlled routes
          </div>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {TRADING_ROUTES.map((r) => (
              <li
                key={r}
                className="rounded border border-border bg-surface px-3 py-1.5 font-mono text-xs"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
