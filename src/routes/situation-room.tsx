import { createFileRoute } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { SystemHealthBanner } from "@/components/quant/SystemHealthBanner";
import { MarketClock } from "@/components/dashboard/MarketClock";
import { LiveKpis } from "@/components/dashboard/LiveKpis";
import { MarketHeatmap } from "@/components/dashboard/MarketHeatmap";
import { HotNews } from "@/components/dashboard/HotNews";
import { AgentStatusBoard } from "@/components/agents/AgentStatusBoard";
import { RiskGuardPanel } from "@/components/trading/RiskGuardPanel";

export const Route = createFileRoute("/situation-room")({
  head: () => ({
    meta: [
      { title: "Situation Room — Live Market & System Overview" },
      {
        name: "description",
        content:
          "One war-room view: system health, live KPIs, market heatmap, breaking headlines, agent status and risk guard state.",
      },
      { property: "og:title", content: "Situation Room — Live Market & System Overview" },
      {
        property: "og:description",
        content: "War-room overview of market, agents, risk and system health in a single screen.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SituationRoomPage,
});

function SituationRoomPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Radar className="h-5 w-5 text-primary" />
            חדר מצב
          </h1>
          <p className="text-sm text-muted-foreground">כל התמונה במסך אחד — מערכת, שוק, סוכנים וסיכון.</p>
        </div>
        <MarketClock />
      </header>

      <SystemHealthBanner />
      <LiveKpis />

      <div className="grid gap-4 xl:grid-cols-2">
        <MarketHeatmap />
        <HotNews />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AgentStatusBoard />
        <RiskGuardPanel />
      </div>
    </div>
  );
}
