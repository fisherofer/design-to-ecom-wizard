import { createFileRoute } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import { SmartMoneyTracker } from "@/components/dashboard/SmartMoneyTracker";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { TopMovers } from "@/components/dashboard/TopMovers";
import { SectorsIndicesPanel } from "@/components/dashboard/SectorsIndicesPanel";

export const Route = createFileRoute("/money-flow")({
  head: () => ({
    meta: [
      { title: "Money Flow — Smart Money, Sectors & Movers" },
      {
        name: "description",
        content:
          "Institutional money flow in one board: smart-money moves, sector rotation, heatmap and the day's biggest movers.",
      },
      { property: "og:title", content: "Money Flow — Smart Money, Sectors & Movers" },
      {
        property: "og:description",
        content: "Where capital is rotating right now: smart money, sectors, heatmap and movers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MoneyFlowPage,
});

function MoneyFlowPage() {
  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Waves className="h-5 w-5 text-primary" />
          תזרים כספים
        </h1>
        <p className="text-sm text-muted-foreground">לאן הכסף הגדול זורם — כסף חכם, רוטציית סקטורים ומובילי תנועה.</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-2">
        <SmartMoneyTracker />
        <SectorsIndicesPanel />
      </div>
      <MarketHeatmap />
      <TopMovers />
    </div>
  );
}
