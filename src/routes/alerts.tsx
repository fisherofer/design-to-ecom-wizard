import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Brain, Percent, Plus, RotateCcw, Trash2, TrendingDown, Zap } from "lucide-react";
import { alerts, useAlerts, evaluateRule, KIND_LABELS, type AlertRule, type AlertKind } from "@/lib/alerts";
import { useChannels } from "@/lib/alertChannels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { NotWiredBadge } from "@/components/common/NotWiredBadge";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — OferTradingBot" },
      { name: "description", content: "Percent, trailing %, price crossover, RSI, MA-cross, ATR, volume spike and AI-driven alerts with Telegram / WhatsApp / Push delivery." },
    ],
  }),
  component: AlertsPage,
});

const KIND_OPTIONS: AlertKind[] = ["percent", "trailing", "price", "drawdown", "volume", "rsi", "ma_cross", "atr", "ai"];

function emptyDraft(): Partial<AlertRule> {
  return { kind: "percent", symbol: "", direction: "either", channels: ["bell"], enabled: true, cooldownSec: 300, thresholdPct: 3, anchor: "day_open" };
}

function AlertsPage() {
  const { rules, events } = useAlerts();
  const channels = useChannels();
  const [draft, setDraft] = useState<Partial<AlertRule>>(emptyDraft());

  const enabledChannels = useMemo(() => channels.filter((c) => c.enabled), [channels]);

  function save() {
    if (!draft.symbol || !draft.kind) return;
    alerts.upsert(draft as AlertRule);
    setDraft(emptyDraft());
  }

  function simulate(rule: AlertRule) {
    // For non-AI rules, build a synthetic tick that guarantees firing.
    if (rule.kind === "ai") {
      alerts.fire({
        ruleId: rule.id, symbol: rule.symbol, kind: "ai",
        reason: `AI hint fired: ${rule.aiHint ?? "market shift detected"}.`,
        aiExplanation: "Volume spike + narrative alignment across 3 sources · sentiment turned bullish.",
      });
      return;
    }
    const price = 100;
    const tick = {
      price,
      dayOpen: rule.kind === "percent" || rule.kind === "atr" ? 100 * (1 - (rule.thresholdPct ?? 3) / 100 - 0.01) : price,
      prevClose: price * 0.97,
      volume: 1_000_000 * (rule.volumeMultiplier ?? 3),
      avgVolume: 1_000_000,
      rsi: rule.direction === "down" ? (rule.rsiOversold ?? 30) - 1 : (rule.rsiOverbought ?? 70) + 1,
      maFast: 101, maSlow: 100, prevMaFast: 99, prevMaSlow: 100,
      atr: 1,
    };
    // Seed peak/trough so trailing/drawdown fire
    const working: AlertRule = {
      ...rule,
      peakPrice: rule.kind === "trailing" || rule.kind === "drawdown" ? price * (1 + (rule.thresholdPct ?? 3) / 100 + 0.01) : rule.peakPrice,
      troughPrice: rule.kind === "trailing" ? price / (1 + (rule.thresholdPct ?? 3) / 100 + 0.01) : rule.troughPrice,
      priceLevel: rule.priceLevel ?? price,
      lastFiredAt: undefined,
    };
    const ev = evaluateRule(working, tick);
    if (ev) alerts.fire({ ruleId: ev.ruleId, symbol: ev.symbol, kind: ev.kind, changePct: ev.changePct, reason: ev.reason, aiExplanation: ev.aiExplanation });
    else alerts.fire({ ruleId: rule.id, symbol: rule.symbol, kind: rule.kind, reason: `Simulated ${KIND_LABELS[rule.kind]} — configure thresholds to fire on live ticks.` });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-col gap-2 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Alerts</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">התראות מסחר חכמות</h1>
            <NotWiredBadge detail="Backend evaluator (/api/alerts/evaluate) not wired — rules + trailing state are stored locally and can be fired manually via Simulate." />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">%, Trailing %, Price, Drawdown, Volume spike, RSI, MA-cross, ATR, AI · שליחה ל-{enabledChannels.map((c) => c.label).join(" · ") || "Bell"}</p>
        </div>
      </header>

      <section className="rounded-xl border border-border glass p-5">
        <h2 className="mb-4 text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> חוק חדש</h2>
        <div className="grid gap-3 md:grid-cols-[160px_1fr_140px_auto]">
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...emptyDraft(), symbol: draft.symbol, direction: draft.direction, kind: e.target.value as AlertKind })}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm" dir="ltr"
          >
            {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </select>
          <Input placeholder="Symbol (e.g. NVDA)" value={draft.symbol ?? ""} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} dir="ltr" />
          <select
            value={draft.direction}
            onChange={(e) => setDraft({ ...draft, direction: e.target.value as AlertRule["direction"] })}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm" dir="ltr"
          >
            <option value="either">Either</option>
            <option value="up">Up only</option>
            <option value="down">Down only</option>
          </select>
          <Button onClick={save}><Plus /> הוסף</Button>
        </div>

        <KindFields draft={draft} setDraft={setDraft} />

        <div className="mt-3 grid gap-3 md:grid-cols-[200px_1fr]">
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            Cooldown (sec)
            <Input type="number" min={0} value={draft.cooldownSec ?? 300} onChange={(e) => setDraft({ ...draft, cooldownSec: parseInt(e.target.value) || 0 })} className="h-8" dir="ltr" />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border glass p-5">
        <h2 className="mb-3 text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> חוקים פעילים ({rules.length})</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין חוקים. הוסף אחד למעלה.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => <RuleRow key={r.id} r={r} onSim={() => simulate(r)} />)}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border glass p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> היסטוריית התראות ({events.length})</h2>
          {events.length > 0 && <Button size="sm" variant="ghost" onClick={() => alerts.clearEvents()}>Clear</Button>}
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין אירועים.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-border bg-card/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm font-bold" dir="ltr">{e.symbol}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{new Date(e.ts).toLocaleString("he-IL")}</span>
                </div>
                <div className="mt-1 text-xs" dir="auto">{e.reason}</div>
                {e.aiExplanation && <div className="mt-1 text-[11px] text-muted-foreground" dir="auto">💡 {e.aiExplanation}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function KindFields({ draft, setDraft }: { draft: Partial<AlertRule>; setDraft: (d: Partial<AlertRule>) => void }) {
  const set = (patch: Partial<AlertRule>) => setDraft({ ...draft, ...patch });
  const num = (v: string) => (v === "" ? undefined : parseFloat(v));

  switch (draft.kind) {
    case "percent":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs text-muted-foreground">Threshold %<Input type="number" step="0.1" value={draft.thresholdPct ?? ""} onChange={(e) => set({ thresholdPct: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Anchor
            <select value={draft.anchor ?? "day_open"} onChange={(e) => set({ anchor: e.target.value as AlertRule["anchor"] })} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm" dir="ltr">
              <option value="day_open">Day open</option>
              <option value="prev_close">Previous close</option>
              <option value="entry">Entry price</option>
            </select>
          </label>
          {draft.anchor === "entry" && (
            <label className="text-xs text-muted-foreground">Entry $<Input type="number" step="0.01" value={draft.entryPrice ?? ""} onChange={(e) => set({ entryPrice: num(e.target.value) })} dir="ltr" /></label>
          )}
        </div>
      );
    case "trailing":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Trail %<Input type="number" step="0.1" placeholder="e.g. 3 = exit on 3% pullback" value={draft.thresholdPct ?? ""} onChange={(e) => set({ thresholdPct: num(e.target.value) })} dir="ltr" /></label>
          <p className="text-[11px] text-muted-foreground self-end">Peak/trough auto-tracked. Direction=Down → fire on pullback from peak. Direction=Up → fire on bounce from trough.</p>
        </div>
      );
    case "price":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Price level $<Input type="number" step="0.01" value={draft.priceLevel ?? ""} onChange={(e) => set({ priceLevel: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "drawdown":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Max drawdown %<Input type="number" step="0.1" value={draft.thresholdPct ?? ""} onChange={(e) => set({ thresholdPct: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "volume":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Volume × avg<Input type="number" step="0.1" placeholder="3 = 3× average" value={draft.volumeMultiplier ?? ""} onChange={(e) => set({ volumeMultiplier: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Avg window (days)<Input type="number" value={draft.volumeAvgWindow ?? 20} onChange={(e) => set({ volumeAvgWindow: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "rsi":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs text-muted-foreground">Period<Input type="number" value={draft.rsiPeriod ?? 14} onChange={(e) => set({ rsiPeriod: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Overbought<Input type="number" value={draft.rsiOverbought ?? 70} onChange={(e) => set({ rsiOverbought: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Oversold<Input type="number" value={draft.rsiOversold ?? 30} onChange={(e) => set({ rsiOversold: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "ma_cross":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Fast MA<Input type="number" value={draft.maFast ?? 50} onChange={(e) => set({ maFast: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Slow MA<Input type="number" value={draft.maSlow ?? 200} onChange={(e) => set({ maSlow: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "atr":
      return (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-xs text-muted-foreground">Period<Input type="number" value={draft.atrPeriod ?? 14} onChange={(e) => set({ atrPeriod: num(e.target.value) })} dir="ltr" /></label>
          <label className="text-xs text-muted-foreground">Multiplier × ATR<Input type="number" step="0.1" value={draft.atrMultiplier ?? 2} onChange={(e) => set({ atrMultiplier: num(e.target.value) })} dir="ltr" /></label>
        </div>
      );
    case "ai":
      return (
        <div className="mt-3">
          <label className="text-xs text-muted-foreground">AI hint<Input placeholder="What the AI agent should watch for" value={draft.aiHint ?? ""} onChange={(e) => set({ aiHint: e.target.value })} /></label>
        </div>
      );
    default:
      return null;
  }
}

function RuleRow({ r, onSim }: { r: AlertRule; onSim: () => void }) {
  const desc = describeRule(r);
  const Icon = r.kind === "ai" ? Brain : r.kind === "trailing" || r.kind === "drawdown" ? TrendingDown : Percent;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3", !r.enabled && "opacity-60")}>
      <div className="flex items-center gap-2 min-w-[160px]">
        <Icon className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm font-bold" dir="ltr">{r.symbol}</span>
        <span className="rounded border border-border bg-background/50 px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">{KIND_LABELS[r.kind]}</span>
      </div>
      <div className="text-xs text-muted-foreground flex-1 min-w-[200px]" dir="ltr">
        {desc}
        {r.lastFiredAt && <span className="ml-2 text-warning">· last: {new Date(r.lastFiredAt).toLocaleString("he-IL")}</span>}
        {r.peakPrice !== undefined && <span className="ml-2 text-[10px]">peak {r.peakPrice.toFixed(2)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={r.enabled} onCheckedChange={() => alerts.toggle(r.id)} />
        <Button size="sm" variant="outline" onClick={onSim}><Zap className="h-3.5 w-3.5" /> Simulate</Button>
        <Button size="sm" variant="ghost" title="Reset peak/trough" onClick={() => alerts.resetState(r.id)}><RotateCcw className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" onClick={() => alerts.remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
      </div>
    </div>
  );
}

function describeRule(r: AlertRule): string {
  const d = r.direction === "either" ? "±" : r.direction === "up" ? "+" : "-";
  switch (r.kind) {
    case "percent": return `Move ${d}${r.thresholdPct}% vs. ${r.anchor ?? "day_open"}`;
    case "trailing": return `Trail ${r.thresholdPct}% ${r.direction === "up" ? "from trough" : r.direction === "down" ? "from peak" : "either way"}`;
    case "price": return `Cross ${r.direction === "either" ? "any" : r.direction} $${r.priceLevel}`;
    case "drawdown": return `Drawdown ≥ ${r.thresholdPct}% from peak`;
    case "volume": return `Volume ≥ ${r.volumeMultiplier}× ${r.volumeAvgWindow ?? 20}d avg`;
    case "rsi": return `RSI(${r.rsiPeriod ?? 14}) ≥ ${r.rsiOverbought ?? 70} or ≤ ${r.rsiOversold ?? 30}`;
    case "ma_cross": return `MA${r.maFast} × MA${r.maSlow} cross`;
    case "atr": return `Move ≥ ${r.atrMultiplier}× ATR(${r.atrPeriod ?? 14})`;
    case "ai": return `AI: ${r.aiHint}`;
  }
}
