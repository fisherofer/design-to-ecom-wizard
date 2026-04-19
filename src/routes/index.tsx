import { createFileRoute } from "@tanstack/react-router";
import { Activity, Gauge, Zap, CheckCircle2, Circle } from "lucide-react";
import { Ticker } from "@/components/dashboard/Ticker";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { FearGreedGauge } from "@/components/dashboard/FearGreedGauge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AI Executive OS" },
      { name: "description", content: "Live algorithmic trading command center." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="flex flex-col">
      <Ticker />

      <div className="px-6 py-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Command Center
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              Real-time intelligence · Local-first execution
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-1.5 text-xs font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
            <span className="text-muted-foreground">SESSION</span>
            <span className="text-foreground">ACTIVE</span>
          </div>
        </div>

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
              <span className="font-display text-4xl font-bold tabular-nums text-glow">14.2</span>
              <span className="text-sm text-muted-foreground">VIX</span>
            </div>
            <div className="mt-4 space-y-2">
              <Row label="US Equities" value="OPEN" status="ok" />
              <Row label="Crypto 24/7" value="LIVE" status="ok" />
              <Row label="FX Majors" value="OPEN" status="ok" />
              <Row label="Volatility" value="Calm" status="idle" />
            </div>
          </KpiCard>

          <KpiCard title="Fear & Greed Index" icon={Zap} accent="accent">
            <FearGreedGauge value={68} />
          </KpiCard>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-border glass p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold">Recent Signal Stream</h3>
              <span className="text-xs font-mono text-muted-foreground">last 24h</span>
            </div>
            <div className="space-y-2">
              {SIGNALS.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-md border border-border/50 bg-card/30 px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-card/60"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-md font-mono text-xs font-bold ${
                        s.action === "BUY"
                          ? "bg-success/15 text-success"
                          : s.action === "SELL"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-warning/15 text-warning"
                      }`}
                    >
                      {s.action[0]}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{s.sym}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {s.strategy}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums font-mono">${s.price}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      conf {s.conf}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border glass p-5">
            <h3 className="mb-4 font-display text-base font-semibold">Engine Routing</h3>
            <EngineBar label="Ollama 8B (local)" value={62} color="bg-success" />
            <EngineBar label="Gemini 1.5 Pro" value={28} color="bg-primary" />
            <EngineBar label="Groq Llama-70B" value={8} color="bg-accent" />
            <EngineBar label="Perplexity Sonar" value={2} color="bg-warning" />
            <div className="mt-5 rounded-md border border-border/50 bg-card/30 p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Cost / 1k req
              </div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                $0.142
              </div>
              <div className="text-[11px] text-success font-mono">↓ 38% vs cloud-only</div>
            </div>
          </div>
        </div>
      </div>
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

function EngineBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

const SIGNALS = [
  { action: "BUY", sym: "NVDA", strategy: "Momentum · 5m breakout", price: "945.32", conf: 87 },
  { action: "SELL", sym: "TSLA", strategy: "Mean reversion · RSI overbought", price: "178.90", conf: 74 },
  { action: "BUY", sym: "BTC-USD", strategy: "Ensemble vote · 4 of 5", price: "71,240", conf: 91 },
  { action: "HOLD", sym: "AAPL", strategy: "Low conviction · wait", price: "226.45", conf: 52 },
  { action: "BUY", sym: "SOL-USD", strategy: "Sentiment surge", price: "168.22", conf: 81 },
];
