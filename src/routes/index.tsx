import { createFileRoute } from "@tanstack/react-router";
import { Ticker } from "@/components/dashboard/Ticker";
import { LiveKpis } from "@/components/dashboard/LiveKpis";
import { LiveTrackedTickers } from "@/components/dashboard/LiveTrackedTickers";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { RefreshButton } from "@/components/dashboard/RefreshButton";
import { MarketClock } from "@/components/dashboard/MarketClock";
import { HotNews } from "@/components/dashboard/HotNews";
import { BreakoutCandidates } from "@/components/dashboard/BreakoutCandidates";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { SectorsIndicesPanel } from "@/components/dashboard/SectorsIndicesPanel";
import { WatchlistPanel } from "@/components/dashboard/WatchlistPanel";
import { SmartMoneyTracker } from "@/components/dashboard/SmartMoneyTracker";
import { MissingApiBanner } from "@/components/dashboard/MissingApiBanner";

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
          <MissingApiBanner />
        </div>

        {/* Smart Money Tracker — follow the flow */}
        <div className="mt-6">
          <SmartMoneyTracker />
        </div>

        {/* Watchlist + Breakout side-by-side */}
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <WatchlistPanel />
          </div>
          <div>
            <BreakoutCandidates />
          </div>
        </div>

        {/* AI Market Heatmap — curated picks, not full S&P */}
        <div className="mt-6">
          <MarketHeatmap />
        </div>

        {/* Sectors / Indices / Baskets / Funds */}
        <div className="mt-6">
          <SectorsIndicesPanel />
        </div>


        {/* Top Movers */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Top Movers</h2>
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Alpaca · US Equities
            </span>
          </div>
          <TopMovers />
        </div>

        {/* News + Tracked side-by-side */}
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <HotNews />
          <LiveTrackedTickers />
        </div>
      </div>
    </div>
  );
}
