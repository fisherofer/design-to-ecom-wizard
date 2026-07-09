import { RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PRESETS, refreshConfig } from "@/lib/refreshIntervals";
import { marketPhase } from "@/lib/marketPhase";

/**
 * Global Dashboard refresh — dispatches a window event that all live widgets
 * listen for, and lets the user pick the interval + smart mode inline.
 */
export const DASHBOARD_REFRESH_EVENT = "ai-os:dashboard-refresh";

export function fireDashboardRefresh() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const [interval, setInterval] = useState<number>(() => refreshConfig.get().globalMs);
  const [smart, setSmart] = useState<boolean>(() => refreshConfig.get().smart);
  const [phase, setPhase] = useState(() => marketPhase());

  useEffect(() => {
    const id = window.setInterval(() => setPhase(marketPhase()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const handle = () => {
    setSpinning(true);
    fireDashboardRefresh();
    setTimeout(() => setSpinning(false), 700);
  };

  const changeInterval = (ms: number) => {
    setInterval(ms);
    refreshConfig.setGlobal(ms);
  };

  const toggleSmart = () => {
    const next = !smart;
    setSmart(next);
    refreshConfig.setSmart(next);
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={handle}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono uppercase tracking-wider",
          "hover:bg-card hover:border-border-strong transition-colors",
        )}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", spinning && "animate-spin")} />
        Refresh
      </button>
      <select
        value={interval}
        onChange={(e) => changeInterval(Number(e.target.value))}
        className="rounded-md border border-border bg-card/60 px-2 py-1.5 text-xs font-mono hover:bg-card"
        title="Base auto-refresh interval"
      >
        {PRESETS.map((p) => (
          <option key={p.label} value={p.ms}>{p.label === "Paused" ? "Paused" : `Auto: ${p.label}`}</option>
        ))}
      </select>
      <button
        onClick={toggleSmart}
        title={smart
          ? `Smart engine ON — scales rate by market phase (${phase.label}, ×${phase.multiplier})`
          : "Smart engine OFF — fixed interval regardless of market hours"}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors",
          smart
            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-border bg-card/60 text-muted-foreground hover:bg-card",
        )}
      >
        <Sparkles className="h-3 w-3" />
        Smart {smart ? "· " + phase.phase.toUpperCase() : "OFF"}
      </button>
    </div>
  );
}
