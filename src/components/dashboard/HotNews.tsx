import { useEffect, useState } from "react";
import { Newspaper, TrendingUp, TrendingDown, ExternalLink, Flame } from "lucide-react";
import { alpaca, type NewsItem } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
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
  const [news, setNews] = useState<NewsItem[]>([]);
  const ms = useRefreshInterval("news");

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.news(10).then((n) => !cancelled && setNews(n));
    load();
    const id = ms > 0 ? window.setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => {
      cancelled = true;
      if (id) window.clearInterval(id);
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    };
  }, [ms]);

  return (
    <div className="rounded-xl border border-border glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-destructive" />
          <h3 className="font-display text-base font-semibold">Hot News</h3>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Market-moving headlines
        </span>
      </div>
      <ul className="space-y-3">
        {news.map((n) => {
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
