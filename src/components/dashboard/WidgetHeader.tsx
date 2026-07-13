/**
 * WidgetHeader
 * ============
 * Reusable header strip for every dashboard widget. Shows title, icon, a
 * live source picker, last-updated timestamp, countdown to next auto refresh
 * and a manual refresh button.
 */
import { RefreshCw, ChevronDown, Radio } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortAgo } from "@/hooks/useWidgetData";
import { SOURCE_REGISTRY, type WidgetKind } from "@/lib/widgetSources";

interface Props {
  title: string;
  subtitle?: string;
  Icon: LucideIcon;
  accent?: string;
  kind: WidgetKind;
  source: string;
  onSourceChange: (s: string) => void;
  updatedAt: number | null;
  nextInMs: number;
  intervalMs: number;
  loading: boolean;
  onRefresh: () => void;
  right?: React.ReactNode;
}

export function WidgetHeader({
  title, subtitle, Icon, accent = "text-primary",
  kind, source, onSourceChange,
  updatedAt, nextInMs, intervalMs, loading, onRefresh, right,
}: Props) {
  const sources = SOURCE_REGISTRY[kind];
  const active = sources.find((s) => s.id === source) ?? sources[0];
  const agoMs = updatedAt ? Date.now() - updatedAt : 0;

  return (
    <div className="mb-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", accent)} />
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {right}
          <button
            onClick={onRefresh}
            title="Refresh now"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/60 hover:bg-card"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <div className="relative inline-flex items-center">
          <Radio className={cn("mr-1 h-3 w-3", active.live ? "text-success" : "text-warning")} />
          <select
            value={source}
            onChange={(e) => onSourceChange(e.target.value)}
            className="appearance-none rounded-md border border-border bg-card/60 pl-2 pr-6 py-1 text-[10px] font-mono hover:bg-card focus:border-primary/50 focus:outline-none"
            title={active.hint ?? active.label}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}{s.live ? "" : " (soon)"}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-muted-foreground" />
        </div>

        <span className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5">
          Updated {updatedAt ? `${formatShortAgo(agoMs)} ago` : "…"}
        </span>
        <span className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5">
          {intervalMs > 0 ? `Next in ${formatShortAgo(nextInMs)}` : "Paused"}
        </span>
      </div>
    </div>
  );
}
