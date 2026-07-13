import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { alpaca, formatCountdown, type AlpacaClock } from "@/lib/alpaca";
import { cn } from "@/lib/utils";

export function MarketClock() {
  const [clock, setClock] = useState<AlpacaClock | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.clock().then((c) => !cancelled && setClock(c));
    load();
    const poll = setInterval(load, 60_000);
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { cancelled = true; clearInterval(poll); clearInterval(timer); };
  }, []);

  if (!clock) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs font-mono">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Loading market clock…</span>
      </div>
    );
  }

  void tick; // force re-render each second
  const target = clock.is_open ? new Date(clock.next_close) : new Date(clock.next_open);
  const remaining = target.getTime() - Date.now();
  const label = clock.is_open ? "Closes in" : "Opens in";
  const dot = clock.is_open ? "bg-success" : "bg-warning";

  const now = new Date();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localTime = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const nyTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });

  return (
    <div
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono"
      title={`Your timezone: ${tz}\nNY: ${nyTime}\nLocal: ${localTime}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full pulse-dot", dot)} />
      <span className="text-muted-foreground uppercase tracking-wider">
        {clock.is_open ? "Open" : "Closed"}
      </span>
      <span className="text-border-strong">·</span>
      <span className="text-foreground tabular-nums">{localTime}</span>
      <span className="text-[9px] text-muted-foreground uppercase">local</span>
      <span className="text-border-strong">·</span>
      <span className="text-muted-foreground tabular-nums">NY {nyTime}</span>
      <span className="text-border-strong">·</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{formatCountdown(remaining)}</span>
    </div>
  );
}
