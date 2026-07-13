import { Newspaper, TrendingUp, TrendingDown, ExternalLink, Flame } from "lucide-react";
import { alpaca, type NewsItem } from "@/lib/alpaca";
import { useWidgetData } from "@/hooks/useWidgetData";
import { WidgetHeader } from "@/components/dashboard/WidgetHeader";
import { cn } from "@/lib/utils";

const IMPACT_STYLE: Record<NewsItem["impact"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function HotNews() {
  const state = useWidgetData<NewsItem[]>({
    kind: "news",
    refreshId: "news",
    fetcher: () => alpaca.news(10),
    initial: [],
  });

  return (
    <div className="rounded-xl border border-border glass p-5">
      <WidgetHeader
        title="Hot News"
        subtitle="Market-moving headlines"
        Icon={Flame}
        accent="text-destructive"
        kind="news"
        source={state.source}
        onSourceChange={state.setSource}
        updatedAt={state.updatedAt}
        nextInMs={state.nextInMs}
        intervalMs={state.intervalMs}
        loading={state.loading}
        onRefresh={state.refresh}
      />
      <ul className="space-y-3">
        {state.data.map((n) => {
          const bull = n.sentiment > 0.15;
          const bear = n.sentiment < -0.15;
          const Icon = bull ? TrendingUp : bear ? TrendingDown : Newspaper;
          const color = bull ? "text-success" : bear ? "text-destructive" : "text-muted-foreground";
          return (
            <li key={n.id} className="group flex gap-3 rounded-md p-2 -mx-2 hover:bg-card/40 transition-colors">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <a
                    href={n.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium leading-snug hover:text-primary line-clamp-2"
                  >
                    {n.headline}
                    {n.url && <ExternalLink className="ml-1 inline h-3 w-3 opacity-60" />}
                  </a>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span className={cn("rounded px-1.5 py-0.5 uppercase", IMPACT_STYLE[n.impact])}>{n.impact}</span>
                  <span>{n.source}</span>
                  <span>·</span>
                  <span>{timeAgo(n.publishedAt)} ago</span>
                  {n.symbols.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-primary">{n.symbols.slice(0, 3).join(", ")}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
