import { useEffect, useState } from "react";
import { Activity, Gauge, Zap } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { FearGreedGauge } from "./FearGreedGauge";
import { MarketClock } from "./MarketClock";
import { alpaca, formatCountdown, type AlpacaClock, type FearGreed } from "@/lib/alpaca";
import { useRefreshInterval } from "@/lib/refreshIntervals";
import { DASHBOARD_REFRESH_EVENT } from "./RefreshButton";
import { CheckCircle2, Circle } from "lucide-react";

export function LiveKpis() {
  const [clock, setClock] = useState<AlpacaClock | null>(null);
  const [fg, setFg] = useState<FearGreed | null>(null);
  const [spy, setSpy] = useState<number | null>(null);
  const ms = useRefreshInterval("kpi");
  const fgMs = useRefreshInterval("fearGreed");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [c, quotes] = await Promise.all([alpaca.clock(), alpaca.quotes(["SPY", "QQQ", "BTC"])]);
      if (cancelled) return;
      setClock(c);
      const s = quotes.find((q) => q.symbol === "SPY");
      setSpy(s?.changePct ?? null);
    };
    load();
    const id = ms > 0 ? setInterval(load, ms) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => { cancelled = true; if (id) clearInterval(id); window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual); };
  }, [ms]);

  useEffect(() => {
    let cancelled = false;
    const load = () => alpaca.fearGreed().then((f) => !cancelled && setFg(f));
    load();
    const id = fgMs > 0 ? setInterval(load, fgMs) : null;
    const onManual = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    return () => { cancelled = true; if (id) clearInterval(id); window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual); };
  }, [fgMs]);

  const marketStatus = clock?.is_open ? "OPEN" : "CLOSED";
  const target = clock ? (clock.is_open ? clock.next_close : clock.next_open) : null;
  const countdown = target ? formatCountdown(new Date(target).getTime() - Date.now()) : "—";

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <KpiCard title="System Health" icon={Activity} accent="success">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tabular-nums">12</span>
          <span className="text-sm text-muted-foreground">active triggers</span>
        </div>
        <div className="mt-4 space-y-2">
          <Row label="Ensemble" value="Healthy" status="ok" />
          <Row label="Risk Engine" value="Nominal" status="ok" />
          <Row label="Execution Bridge" value="Online" status="ok" />
          <Row label="Webhook Queue" value="0 pending" status="idle" />
        </div>
      </KpiCard>

      <KpiCard title="Market Pulse" icon={Gauge} accent="primary">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold tabular-nums text-glow">
            {spy !== null ? `${spy >= 0 ? "+" : ""}${spy.toFixed(2)}%` : "—"}
          </span>
          <span className="text-sm text-muted-foreground">SPY today</span>
        </div>
        <div className="mt-4 space-y-2">
          <Row label="US Equities" value={marketStatus} status={clock?.is_open ? "ok" : "idle"} />
          <Row label={clock?.is_open ? "Closes in" : "Opens in"} value={countdown} status="idle" />
          <Row label="Crypto 24/7" value="LIVE" status="ok" />
          <Row label="Data Source" value="Alpaca" status="ok" />
        </div>
      </KpiCard>

      <KpiCard title="Fear & Greed Index" icon={Zap} accent="accent">
        <FearGreedGauge value={fg?.value ?? 50} />
        <div className="mt-2 flex justify-center">
          <MarketClock />
        </div>
      </KpiCard>
    </div>
  );
}

function Row({ label, value, status }: { label: string; value: string; status: "ok" | "idle" | "err" }) {
  const Icon = status === "ok" ? CheckCircle2 : Circle;
  const color = status === "ok" ? "text-success" : status === "err" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 font-mono ${color}`}>
        <Icon className="h-3 w-3" />
        {value}
      </span>
    </div>
  );
}
