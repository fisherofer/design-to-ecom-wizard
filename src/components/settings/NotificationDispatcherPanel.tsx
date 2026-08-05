import { useState } from "react";
import { Send, History, Eye, Trash2 } from "lucide-react";
import { useChannels } from "@/lib/alertChannels";
import { buildPreview, dispatcher, useDispatchHistory, type DispatchPayload } from "@/lib/notificationDispatcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-success/15 text-success border-success/30",
  queued: "bg-info/15 text-info border-info/30",
  skipped: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

export function NotificationDispatcherPanel() {
  const list = useChannels();
  const history = useDispatchHistory();
  const [payload, setPayload] = useState<DispatchPayload>({
    symbol: "NVDA",
    action: "BUY",
    confidence: 0.82,
    priceChangePct: 4.6,
    relativeVolume: 3.2,
    details: "Momentum breakout above resistance with unusual call flow.",
  });
  const [selected, setSelected] = useState<string[]>(["bell"]);
  const [busy, setBusy] = useState(false);
  const preview = buildPreview(payload);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function send() {
    setBusy(true);
    try {
      await dispatcher.dispatch(payload, selected, { ignoreThrottle: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Send className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Notification Dispatcher</h2>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Symbol</Label>
              <Input value={payload.symbol} onChange={(e) => setPayload({ ...payload, symbol: e.target.value.toUpperCase() })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <div className="flex gap-1">
                {(["BUY", "SELL", "INFO"] as const).map((a) => (
                  <Button key={a} size="sm" variant={payload.action === a ? "default" : "outline"} onClick={() => setPayload({ ...payload, action: a })}>
                    {a}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Confidence (0–1)</Label>
              <Input type="number" step="0.01" min="0" max="1" value={payload.confidence}
                onChange={(e) => setPayload({ ...payload, confidence: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Price change %</Label>
              <Input type="number" step="0.1" value={payload.priceChangePct ?? 0}
                onChange={(e) => setPayload({ ...payload, priceChangePct: Number(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Relative volume ×</Label>
              <Input type="number" step="0.1" value={payload.relativeVolume ?? 0}
                onChange={(e) => setPayload({ ...payload, relativeVolume: Number(e.target.value) })} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Details</Label>
              <Input value={payload.details ?? ""} onChange={(e) => setPayload({ ...payload, details: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Channels</Label>
            <div className="flex flex-wrap gap-3">
              {list.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-xs">
                  <Checkbox checked={selected.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                  <span>{c.label}</span>
                  {!c.enabled && <span className="text-[10px] text-muted-foreground">(off)</span>}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={send} disabled={busy || selected.length === 0} className="w-full">
            <Send className="h-3.5 w-3.5" /> {busy ? "Dispatching…" : "Send preview alert"}
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card/40 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Eye className="h-4 w-4 text-primary" /> Preview
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="text-sm font-semibold">{preview.subject}</div>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{preview.body}</pre>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            In-app bell and browser push are delivered instantly. Email, Telegram, WhatsApp and webhook
            payloads are queued for the backend relay.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Event history
            <span className="text-xs font-normal text-muted-foreground">({history.length})</span>
          </div>
          {history.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => dispatcher.clear()}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No alerts dispatched yet.</p>
        ) : (
          <ul className="space-y-2">
            {history.slice(0, 30).map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-background/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{r.subject}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{new Date(r.ts).toLocaleString()}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.results.map((d) => (
                    <Badge key={d.channelId} variant="outline" className={STATUS_STYLE[d.status]} title={d.note}>
                      {d.label}: {d.status}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
