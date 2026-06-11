import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Brain, Zap, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TRACKED_TICKERS } from "@/lib/trackedAssets";

export const Route = createFileRoute("/triggers")({
  head: () => ({
    meta: [
      { title: "AI Triggers — AI Executive OS" },
      { name: "description", content: "Compose intelligent trading triggers with local AI sentiment gates." },
    ],
  }),
  component: TriggersPage,
});

type Trigger = {
  id: string;
  symbol: string;
  op: "<" | ">" | "==";
  price: number;
  sentiment: "Any" | "Bullish" | "Bearish" | "Neutral";
  action: "BUY" | "SELL" | "ALERT";
};

const INITIAL: Trigger[] = [
  { id: "t1", symbol: "PLTR", op: "<", price: 26, sentiment: "Bullish", action: "BUY" },
  { id: "t2", symbol: "ZIM",  op: ">", price: 22, sentiment: "Any", action: "SELL" },
];

function TriggersPage() {
  const [triggers, setTriggers] = useState<Trigger[]>(INITIAL);
  const [draft, setDraft] = useState<Trigger>({
    id: "", symbol: "PLTR", op: "<", price: 0, sentiment: "Bullish", action: "BUY",
  });
  const [model, setModel] = useState("mistral");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");

  const add = () => {
    if (!draft.price) return;
    setTriggers((arr) => [...arr, { ...draft, id: `t${Date.now()}` }]);
  };
  const remove = (id: string) => setTriggers((arr) => arr.filter((t) => t.id !== id));

  return (
    <div className="px-6 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">AI &amp; Triggers</h1>
        <p className="text-sm text-muted-foreground font-mono">
          Conditional orders gated by local-model sentiment
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border glass p-5">
            <div className="mb-4 flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-display text-base font-semibold">New Trigger</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Asset">
                <Select value={draft.symbol} onValueChange={(v) => setDraft({ ...draft, symbol: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRACKED_TICKERS.map((t) => <SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Condition">
                <Select value={draft.op} onValueChange={(v) => setDraft({ ...draft, op: v as Trigger["op"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="<">Price &lt;</SelectItem>
                    <SelectItem value=">">Price &gt;</SelectItem>
                    <SelectItem value="==">Price ≈</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Price">
                <Input type="number" value={draft.price || ""} onChange={(e) => setDraft({ ...draft, price: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="AI Sentiment">
                <Select value={draft.sentiment} onValueChange={(v) => setDraft({ ...draft, sentiment: v as Trigger["sentiment"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Any">Any</SelectItem>
                    <SelectItem value="Bullish">Bullish</SelectItem>
                    <SelectItem value="Bearish">Bearish</SelectItem>
                    <SelectItem value="Neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Action">
                <Select value={draft.action} onValueChange={(v) => setDraft({ ...draft, action: v as Trigger["action"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                    <SelectItem value="ALERT">ALERT</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Button onClick={add} className="mt-4" size="sm">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Trigger
            </Button>
          </div>

          <div className="rounded-xl border border-border glass">
            <div className="border-b border-border/60 p-5">
              <h3 className="font-display text-base font-semibold">Active Triggers ({triggers.length})</h3>
            </div>
            <div className="divide-y divide-border/30">
              {triggers.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="flex items-center gap-3 font-mono">
                    <span className="rounded bg-primary/15 px-2 py-0.5 text-primary text-xs">{t.action}</span>
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="text-muted-foreground">{t.op} ${t.price}</span>
                    <span className="text-muted-foreground">AND sentiment = {t.sentiment}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {triggers.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted-foreground">No triggers configured</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border glass p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="font-display text-base font-semibold">AI Insights</h3>
            </div>
            <div className="space-y-3 text-xs">
              <Insight text="Volatility regime: calm. Mean-reversion strategies favored next 48h." />
              <Insight text="CONY/MSTY entering dividend window — momentum likely to fade post ex-date." />
              <Insight text="ZIM shipping rates softening — caution on long entries." />
            </div>
          </div>

          <div className="rounded-xl border border-border glass p-5">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="font-display text-base font-semibold">Local AI Model</h3>
            </div>
            <div className="space-y-3">
              <Field label="Active Model">
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mistral">Mistral 7B</SelectItem>
                    <SelectItem value="llama">Llama 3.1 8B</SelectItem>
                    <SelectItem value="gemma">Gemma 2 9B</SelectItem>
                    <SelectItem value="qwen">Qwen 2.5 7B</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Local Endpoint">
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
              </Field>
              <div className="rounded-md bg-success/10 border border-success/30 px-3 py-2 text-[11px] font-mono text-success">
                ✓ Connection established · {endpoint.replace(/^https?:\/\//, "")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Insight({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-2.5">
      <p className="text-foreground/90">{text}</p>
    </div>
  );
}
