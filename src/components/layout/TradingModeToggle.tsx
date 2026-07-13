/**
 * Compact live-trading toggle for the top header.
 */
import { Link } from "@tanstack/react-router";
import { TrendingUp, ShieldOff } from "lucide-react";
import { useTradingEnabled } from "@/lib/tradingMode";

export function TradingModeToggle() {
  const [enabled, setEnabled] = useTradingEnabled();

  return (
    <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-card/50 pl-2 pr-1 py-1">
      <Link
        to="/settings"
        className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
        title="Trading mode settings"
      >
        {enabled ? (
          <TrendingUp className="h-3.5 w-3.5 text-success" />
        ) : (
          <ShieldOff className="h-3.5 w-3.5 text-warning" />
        )}
        <span className="hidden lg:inline">Trading</span>
      </Link>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle live trading"
        onClick={() => setEnabled(!enabled)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          enabled ? "bg-success/80" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform ${
            enabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
