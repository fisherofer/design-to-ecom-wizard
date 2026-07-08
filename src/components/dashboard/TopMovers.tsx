import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type AlpacaMover } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
import { cn } from "@/lib/utils";

type Kind = "gainers" | "losers" | "active";

const TABS: { id: Kind; label: string; icon: typeof TrendingUp; accent: string }[] = [
  { id: "gainers", label: "Top Gainers", icon: TrendingUp, accent: "text-success" },
  { id: "losers", label: "Top Losers", icon: TrendingDown, accent: "text-destructive" },
  { id: "active", label: "Most Active", icon: Activity, accent: "text-primary" },
];

export function TopMovers() {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {TABS.map((t) => <MoversCard key={t.id} kind={t.id} label={t.label} Icon={t.icon} accent={t.accent} />)}
    </div>
  );
}

function MoversCard({ kind, label, Icon, accent }: { kind: Kind; label: string; Icon: typeof TrendingUp; accent: string }) {
  const [rows, setRows] = useState<AlpacaMover[]>([]);
  const ms = useRefreshInterval("ticker");

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.movers(kind).then((r) => !cancelled && setRows(r.slice(0, 8)));
    load();
    const id = ms > 0 ? setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    };
  }, [kind, ms]);

  return (
    <div className="rounded-xl border border-border glass p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", accent)} />
          <h3 className="font-display text-sm font-semibold">{label}</h3>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Top 8</span>
      </div>
      <table className="w-full text-xs">
        <tbody>
          {rows.map((r) => {
            const up = r.changePct >= 0;
            return (
              <tr key={r.symbol} className="border-b border-border/30 last:border-0">
                <td className="py-1.5">
                  <Link
                    to="/ticker/$symbol"
                    params={{ symbol: r.symbol }}
                    className="font-mono font-semibold hover:text-primary"
                  >
                    {r.symbol}
                  </Link>
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums">${r.price.toFixed(2)}</td>
                <td className={cn("py-1.5 text-right font-mono tabular-nums", up ? "text-success" : "text-destructive")}>
                  {up ? "+" : ""}{r.changePct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Loading…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
