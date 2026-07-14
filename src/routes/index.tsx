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
import { DriveGapReport } from "@/components/dashboard/DriveGapReport";
import { AiRecommendedTickers } from "@/components/dashboard/AiRecommendedTickers";
import { SortableDashboard, type DashboardWidget } from "@/components/dashboard/SortableDashboard";

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
  const widgets: DashboardWidget[] = [
    { id: "drive-gap", label: "Drive Gap Report", span: "full", render: () => <DriveGapReport /> },
    { id: "smart-money", label: "Smart Money Tracker", span: "full", render: () => <SmartMoneyTracker /> },
    { id: "watchlist", label: "Alpaca Watchlist", span: "full", render: () => <WatchlistPanel /> },
    { id: "ai-recs", label: "AI Recommended Tickers", span: "full", render: () => <AiRecommendedTickers /> },
    { id: "breakouts", label: "AI Breakout Candidates", span: "full", render: () => <BreakoutCandidates /> },
    { id: "heatmap", label: "AI Market Heatmap", span: "full", render: () => <MarketHeatmap /> },
    { id: "sectors", label: "Sectors & Indices", span: "full", render: () => <SectorsIndicesPanel /> },
    { id: "movers", label: "Top Movers", span: "full", render: () => (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Top Movers</h2>
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Alpaca · US Equities
          </span>
        </div>
        <TopMovers />
      </div>
    ) },
    { id: "news", label: "Hot News", span: "half", render: () => <HotNews /> },
    { id: "tracked", label: "Live Tracked Tickers", span: "half", render: () => <LiveTrackedTickers /> },
  ];

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

        <div className="mt-6">
          <SortableDashboard storageKey="dashboard-widget-order-v2" widgets={widgets} />
        </div>
      </div>
    </div>
  );
}

