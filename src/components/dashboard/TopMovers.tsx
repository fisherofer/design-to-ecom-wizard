import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { alpaca, type AlpacaMover } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
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
  const state = useWidgetData<AlpacaMover[]>({
    kind: "movers",
    refreshId: "ticker",
    fetcher: () => alpaca.movers(kind).then((r) => r.slice(0, 8)),
    initial: [],
  });

  return (
    <div className="rounded-xl border border-border glass p-4">
      <WidgetHeader
        title={label}
        subtitle="Top 8"
        Icon={Icon}
        accent={accent}
        kind="movers"
        source={state.source}
        onSourceChange={state.setSource}
        updatedAt={state.updatedAt}
        nextInMs={state.nextInMs}
        intervalMs={state.intervalMs}
        loading={state.loading}
        onRefresh={state.refresh}
      />
      <table className="w-full text-xs">
        <tbody>
          {state.data.map((r) => {
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
          {state.data.length === 0 && (
            <tr><td colSpan={3} className="py-4 text-center text-muted-foreground">Loading…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
