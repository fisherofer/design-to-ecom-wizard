import { createFileRoute } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";
import { HotNews } from "@/components/dashboard/HotNews";
import { FearGreedGauge } from "@/components/dashboard/FearGreedGauge";
import { MarketClock } from "@/components/dashboard/MarketClock";
import { AiRecommendedTickers } from "@/components/dashboard/AiRecommendedTickers";

export const Route = createFileRoute("/news")({
  head: () => ({
    meta: [
      { title: "News Intelligence — Market-Moving Headlines" },
      {
        name: "description",
        content:
          "Market-moving headlines with impact scoring, session clock and AI-ranked tickers derived from the current news flow.",
      },
      { property: "og:title", content: "News Intelligence — Market-Moving Headlines" },
      {
        property: "og:description",
        content: "Live headlines, impact scoring and AI-ranked tickers from the news flow.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewsPage,
});

function NewsPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Newspaper className="h-5 w-5 text-primary" />
            מרכז חדשות
          </h1>
          <p className="text-sm text-muted-foreground">כותרות מזיזות שוק, מדד פחד/חמדנות וטיקרים מדורגים.</p>
        </div>
        <MarketClock />
      </header>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <HotNews />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-border glass p-5">
            <h2 className="mb-3 text-sm font-semibold">סנטימנט שוק</h2>
            <FearGreedGauge />
          </div>
        </div>
      </div>

      <AiRecommendedTickers />
    </div>
  );
}
