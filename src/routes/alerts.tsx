import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, Brain, Percent, Plus, Trash2, Zap } from "lucide-react";
import { alerts, useAlerts, type AlertRule } from "@/lib/alerts";
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
      { name: "description", content: "Percent-move and AI-driven alert rules with Telegram / WhatsApp / Push delivery." },
    ],
  }),
  component: AlertsPage,
});

function AlertsPage() {
  const { rules, events } = useAlerts();
  const channels = useChannels();
  const [draft, setDraft] = useState<Partial<AlertRule>>({ kind: "percent", symbol: "", thresholdPct: 3, direction: "either", channels: ["bell"], enabled: true });

  const enabledChannels = useMemo(() => channels.filter((c) => c.enabled), [channels]);

  function save() {
    if (!draft.symbol) return;
    alerts.upsert(draft as AlertRule);
    setDraft({ kind: "percent", symbol: "", thresholdPct: 3, direction: "either", channels: ["bell"], enabled: true });
  }

  function simulate(rule: AlertRule) {
    alerts.fire({
      ruleId: rule.id,
      symbol: rule.symbol,
      kind: rule.kind,
      changePct: rule.kind === "percent" ? (rule.direction === "down" ? -(rule.thresholdPct ?? 3) : (rule.thresholdPct ?? 3)) : undefined,
      reason: rule.kind === "percent"
        ? `Simulated ${(rule.thresholdPct ?? 3)}% move on ${rule.symbol}.`
        : `AI hint fired: ${rule.aiHint ?? "market shift detected"}.`,
      aiExplanation: rule.kind === "ai" ? "Model observed volume spike + narrative alignment across 3 sources." : undefined,
    });
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-col gap-2 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-primary">Alerts</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">התראות מסחר</h1>
            <NotWiredBadge detail="Backend evaluator (/api/alerts/evaluate) not wired — rules are stored locally and can be fired manually via Simulate." />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">התראות לפי אחוזים או לפי שיקול AI · שליחה ל-{enabledChannels.map((c) => c.label).join(" · ") || "Bell"}</p>
        </div>
      </header>

      <section className="rounded-xl border border-border glass p-5">
        <h2 className="mb-4 text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4 text-primary" /> חוק חדש</h2>
        <div className="grid gap-3 md:grid-cols-[120px_1fr_140px_140px_auto]">
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as AlertRule["kind"] })}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm"
            dir="ltr"
          >
            <option value="percent">Percent</option>
            <option value="ai">AI signal</option>
          </select>
          <Input placeholder="Symbol (e.g. NVDA)" value={draft.symbol ?? ""} onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })} dir="ltr" />
          {draft.kind === "percent" ? (
            <Input type="number" min={0.1} step={0.1} placeholder="% threshold" value={draft.thresholdPct ?? ""} onChange={(e) => setDraft({ ...draft, thresholdPct: parseFloat(e.target.value) })} dir="ltr" />
          ) : (
            <Input placeholder="AI hint" value={draft.aiHint ?? ""} onChange={(e) => setDraft({ ...draft, aiHint: e.target.value })} />
          )}
          <select
            value={draft.direction}
            onChange={(e) => setDraft({ ...draft, direction: e.target.value as AlertRule["direction"] })}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm"
            dir="ltr"
          >
            <option value="either">Either</option>
            <option value="up">Up only</option>
            <option value="down">Down only</option>
          </select>
          <Button onClick={save}><Plus /> הוסף</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border glass p-5">
        <h2 className="mb-3 text-sm font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> חוקים פעילים ({rules.length})</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין חוקים. הוסף אחד למעלה.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className={cn("flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 p-3", !r.enabled && "opacity-60")}>
                <div className="flex items-center gap-2 min-w-[140px]">
                  {r.kind === "percent" ? <Percent className="h-4 w-4 text-primary" /> : <Brain className="h-4 w-4 text-accent" />}
                  <span className="font-mono text-sm font-bold" dir="ltr">{r.symbol}</span>
                </div>
                <div className="text-xs text-muted-foreground flex-1 min-w-[200px]" dir="ltr">
                  {r.kind === "percent"
                    ? `Move ${r.direction === "either" ? "±" : r.direction === "up" ? "+" : "-"}${r.thresholdPct}%`
                    : `AI: ${r.aiHint}`}
                  {r.lastFiredAt && <span className="ml-2 text-warning">· last: {new Date(r.lastFiredAt).toLocaleString("he-IL")}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.enabled} onCheckedChange={() => alerts.toggle(r.id)} />
                  <Button size="sm" variant="outline" onClick={() => simulate(r)}><Zap className="h-3.5 w-3.5" /> Simulate</Button>
                  <Button size="sm" variant="ghost" onClick={() => alerts.remove(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            ))}
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
