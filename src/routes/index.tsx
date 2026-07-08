import { createFileRoute } from "@tanstack/react-router";
import { Ticker } from "@/components/dashboard/Ticker";
import { LiveKpis } from "@/components/dashboard/LiveKpis";
import { LiveTrackedTickers } from "@/components/dashboard/LiveTrackedTickers";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { RefreshButton } from "@/components/dashboard/RefreshButton";
import { MarketClock } from "@/components/dashboard/MarketClock";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AI Executive OS" },
      { name: "description", content: "Live algorithmic trading command center powered by Alpaca." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="flex flex-col">
      <Ticker />

      <div className="px-6 py-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Real-time intelligence · Alpaca market data · Local-first execution
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MarketClock />
            <RefreshButton />
          </div>
        </div>

        <LiveKpis />

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Top Movers</h2>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Alpaca · US Equities
            </span>
          </div>
          <TopMovers />
        </div>

        <div className="mt-6">
          <LiveTrackedTickers />
        </div>
      </div>
    </div>
  );
}
