import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { PRESETS, refreshConfig } from "@/lib/refreshIntervals";

/**
 * Global Dashboard refresh — dispatches a window event that all live widgets
 * listen for, and lets the user pick the interval inline.
 */
export const DASHBOARD_REFRESH_EVENT = "ai-os:dashboard-refresh";

export function fireDashboardRefresh() {
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}

export function RefreshButton() {
  const [spinning, setSpinning] = useState(false);
  const [interval, setInterval] = useState<number>(() => refreshConfig.get().globalMs);

  const handle = () => {
    setSpinning(true);
    fireDashboardRefresh();
    setTimeout(() => setSpinning(false), 700);
  };

  const changeInterval = (ms: number) => {
    setInterval(ms);
    refreshConfig.setGlobal(ms);
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
        title="Auto-refresh interval"
      >
        {PRESETS.map((p) => (
          <option key={p.label} value={p.ms}>{p.label === "Paused" ? "Paused" : `Auto: ${p.label}`}</option>
        ))}
      </select>
    </div>
  );
}
