/**
 * Order Ticket — manual bracket order entry with stop/target, cancel,
 * live-feed pricing, broker reconciliation and an emergency kill-switch.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  Crosshair,
  Gauge,
  OctagonX,
  RefreshCw,
  ShieldAlert,
  Ticket,
  Wifi,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { fetchQuotes } from "@/lib/liveQuotes";
import { stopDualLoop } from "@/lib/dualLoopRunner";
import { disconnectStream } from "@/lib/marketSocket";
import { engageKillSwitch, releaseKillSwitch, useKillSwitch } from "@/lib/killSwitch";
import {
  amendProtection,
  cancelAllWorking,
  cancelOrder,
  previewRisk,
  submitBracket,
  syncBook,
  useOrderBook,
  validateDraft,
  type DraftOrder,
  type OrderSide,
  type OrderType,
  type TimeInForce,
} from "@/lib/orderTicket";
import { BrokerReconciliation } from "@/components/trading/BrokerReconciliation";
import { RiskGuardPanel } from "@/components/trading/RiskGuardPanel";

export const Route = createFileRoute("/order-ticket")({
  head: () => ({
    meta: [
      { title: "Order Ticket — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Manual bracket order entry with stop-loss, take-profit, OCO cancellation, live feed pricing and an emergency kill-switch.",
      },
      { property: "og:title", content: "Order Ticket — OFERTRADINGBOT" },
      {
        property: "og:description",
        content: "Place bracket orders with stop/target protection, cancel working orders and halt trading instantly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OrderTicketScreen,
});

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

function OrderTicketScreen() {
  const book = useOrderBook(5000);
  const kill = useKillSwitch();

  const [symbol, setSymbol] = useState("AAPL");
  const [side, setSide] = useState<OrderSide>("BUY");
  const [type, setType] = useState<OrderType>("MARKET");
  const [tif, setTif] = useState<TimeInForce>("DAY");
  const [qty, setQty] = useState("10");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [paper, setPaper] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [ref, setRef] = useState<{ price: number | null; provider: string | null; error: string | null }>({
    price: null,
    provider: null,
    error: null,
  });

  const refresh = useCallback(async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    const feed = await fetchQuotes([s]);
    const q = feed.quotes[s];
    setRef({
      price: q?.price && q.price > 0 ? q.price : null,
      provider: q?.provider ?? null,
      error: feed.ok ? null : (feed.error ?? "no feed"),
    });
  }, [symbol]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [refresh]);

  const draft: DraftOrder = useMemo(
    () => ({
      symbol,
      side,
      type,
      tif,
      qty: Number(qty) || 0,
      limitPrice: num(limitPrice),
      stopPrice: num(stopPrice),
      targetPrice: num(targetPrice),
      paper,
    }),
    [symbol, side, type, tif, qty, limitPrice, stopPrice, targetPrice, paper],
  );

  const errors = validateDraft(draft, ref.price);
  const risk = previewRisk(draft, ref.price);

  const working = book.orders.filter((o) => o.status === "WORKING" || o.status === "PENDING");
  const live = book.orders.filter((o) => o.status === "FILLED");
  const closed = book.orders.filter((o) => o.status === "CLOSED" || o.status === "CANCELLED" || o.status === "REJECTED");

  async function onSubmit() {
    setSubmitting(true);
    const res = await submitBracket(draft);
    setSubmitting(false);
    if (!res.ok) {
      res.errors.forEach((e) => toast.error(e));
      return;
    }
    toast.success(`${side} ${qty} ${symbol.toUpperCase()} submitted (${res.order?.status})`);
  }

  function onKill() {
    engageKillSwitch("Emergency halt from Order Ticket");
    const n = cancelAllWorking("Kill-switch: bulk cancel");
    stopDualLoop("Kill-switch engaged");
    disconnectStream();
    toast.error(`KILL-SWITCH ENGAGED — ${n} working orders cancelled, loop stopped`);
  }

  const autoStop = () => {
    if (!ref.price) return;
    const pct = side === "BUY" ? 0.98 : 1.02;
    setStopPrice((ref.price * pct).toFixed(2));
    setTargetPrice((ref.price * (side === "BUY" ? 1.04 : 0.96)).toFixed(2));
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
            <Ticket className="h-5 w-5 text-primary" />
            Order Ticket · Bracket Orders
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entry + stop-loss + take-profit as one OCO bracket, priced from the verified live feed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => void syncBook()}>
            <RefreshCw className="h-4 w-4" />
            Sync book
          </Button>
          {kill.engaged ? (
            <Button
              variant="default"
              className="gap-2"
              onClick={() => {
                releaseKillSwitch();
                toast.success("Kill-switch released — trading re-armed");
              }}
            >
              <ShieldAlert className="h-4 w-4" />
              Release kill-switch
            </Button>
          ) : (
            <Button variant="destructive" size="lg" className="gap-2" onClick={onKill}>
              <OctagonX className="h-5 w-5" />
              KILL SWITCH
            </Button>
          )}
        </div>
      </header>

      {kill.engaged ? (
        <div className="flex items-center gap-3 rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <OctagonX className="h-5 w-5 shrink-0" />
          <div>
            <strong>Trading halted.</strong> {kill.reason} · engaged{" "}
            {kill.at ? new Date(kill.at).toLocaleString() : ""}. No new orders can be submitted and the dual loop is
            stopped until you release the switch.
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ---------------- ticket form ---------------- */}
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">New bracket</h2>
            <Badge variant={ref.price ? "default" : "destructive"} className="gap-1">
              {ref.price ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {ref.price ? `${ref.price.toFixed(2)} · ${ref.provider}` : "no feed"}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="sym">Symbol</Label>
              <Input
                id="sym"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
            </div>

            <div className="col-span-2 grid grid-cols-2 gap-2">
              {(["BUY", "SELL"] as OrderSide[]).map((s) => (
                <Button
                  key={s}
                  variant={side === s ? "default" : "outline"}
                  onClick={() => setSide(s)}
                  className={cn(side === s && s === "SELL" && "bg-destructive hover:bg-destructive/90")}
                >
                  {s}
                </Button>
              ))}
            </div>

            <div className="col-span-2 grid grid-cols-2 gap-2">
              {(["MARKET", "LIMIT"] as OrderType[]).map((t) => (
                <Button key={t} size="sm" variant={type === t ? "secondary" : "ghost"} onClick={() => setType(t)}>
                  {t}
                </Button>
              ))}
            </div>

            <div>
              <Label htmlFor="qty">Quantity</Label>
              <Input id="qty" value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <Label htmlFor="tif">Time in force</Label>
              <div className="mt-1 flex gap-1">
                {(["DAY", "GTC", "IOC"] as TimeInForce[]).map((t) => (
                  <Button key={t} size="sm" variant={tif === t ? "secondary" : "ghost"} onClick={() => setTif(t)}>
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            {type === "LIMIT" ? (
              <div className="col-span-2">
                <Label htmlFor="lmt">Limit price</Label>
                <Input id="lmt" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} inputMode="decimal" />
              </div>
            ) : null}

            <div>
              <Label htmlFor="stp">Stop-loss</Label>
              <Input id="stp" value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <Label htmlFor="tgt">Take-profit</Label>
              <Input id="tgt" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} inputMode="decimal" />
            </div>

            <Button variant="outline" size="sm" className="col-span-2 gap-2" onClick={autoStop} disabled={!ref.price}>
              <Crosshair className="h-3.5 w-3.5" />
              Auto 2% stop / 4% target
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <div className="text-sm font-medium">Paper order</div>
              <div className="text-xs text-muted-foreground">Off = routed as a live order</div>
            </div>
            <Switch checked={paper} onCheckedChange={setPaper} />
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 text-xs">
            <div>
              <div className="text-muted-foreground">Notional</div>
              <div className="font-mono tabular-nums">{usd(risk.notionalUsd)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Risk</div>
              <div className="font-mono tabular-nums text-destructive">
                {risk.riskUsd != null ? usd(risk.riskUsd) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Reward</div>
              <div className="font-mono tabular-nums text-emerald-500">
                {risk.rewardUsd != null ? usd(risk.rewardUsd) : "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">R:R</div>
              <div className="font-mono tabular-nums">{risk.rr ? `${risk.rr.toFixed(2)}×` : "—"}</div>
            </div>
          </div>

          {errors.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {errors.map((e) => (
                <li key={e}>• {e}</li>
              ))}
            </ul>
          ) : null}

          <Button
            className="w-full gap-2"
            size="lg"
            disabled={submitting || errors.length > 0 || kill.engaged}
            onClick={() => void onSubmit()}
            variant={side === "SELL" ? "destructive" : "default"}
          >
            <Gauge className="h-4 w-4" />
            {kill.engaged ? "Blocked by kill-switch" : `Submit ${side} bracket`}
          </Button>
        </section>

        {/* ---------------- book ---------------- */}
        <div className="space-y-6">
          <section className="rounded-lg border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border p-4">
              <h2 className="font-display text-sm font-semibold">
                Working & live brackets{" "}
                <span className="text-muted-foreground">({working.length + live.length})</span>
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={working.length === 0}
                onClick={() => {
                  const n = cancelAllWorking();
                  toast.info(`${n} working orders cancelled`);
                }}
              >
                <Ban className="h-3.5 w-3.5" />
                Cancel all working
              </Button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Entry</th>
                    <th className="px-3 py-2 text-right font-medium">Stop</th>
                    <th className="px-3 py-2 text-right font-medium">Target</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...working, ...live].length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No open orders. Submit a bracket to get started.
                      </td>
                    </tr>
                  ) : (
                    [...working, ...live].map((o) => (
                      <tr key={o.id} className="border-t border-border">
                        <td className="px-4 py-2">
                          <div className="font-mono font-medium">{o.symbol}</div>
                          <div className="text-[11px] text-muted-foreground">{o.type} · {o.tif} · {o.paper ? "paper" : "live"}</div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={o.side === "BUY" ? "default" : "destructive"}>{o.side}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{o.qty}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {(o.entryFill ?? o.limitPrice)?.toFixed(2) ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-destructive">
                          {o.stopPrice?.toFixed(2) ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-500">
                          {o.targetPrice?.toFixed(2) ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={o.status === "FILLED" ? "default" : "secondary"}>{o.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const s = window.prompt("New stop price (blank to remove)", String(o.stopPrice ?? ""));
                                if (s === null) return;
                                const t = window.prompt("New target price (blank to remove)", String(o.targetPrice ?? ""));
                                if (t === null) return;
                                amendProtection(o.id, num(s), num(t));
                                toast.success("Protection amended");
                              }}
                            >
                              Amend
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                cancelOrder(o.id);
                                toast.info(`${o.symbol} ${o.status === "FILLED" ? "closed" : "cancelled"}`);
                              }}
                            >
                              {o.status === "FILLED" ? "Close" : "Cancel"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <footer className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              Realised from brackets: <span className="font-mono">{usd(book.realizedUsd)}</span>
              {book.feedError ? ` · feed: ${book.feedError}` : " · feed OK"}
              {book.lastSyncAt ? ` · synced ${new Date(book.lastSyncAt).toLocaleTimeString()}` : ""}
            </footer>
          </section>

          <RiskGuardPanel />

          <BrokerReconciliation />

          <section className="rounded-lg border border-border bg-card">
            <header className="border-b border-border p-4">
              <h2 className="font-display text-sm font-semibold">
                History <span className="text-muted-foreground">({closed.length})</span>
              </h2>
            </header>
            <div className="max-h-72 overflow-auto">
              {closed.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No completed orders yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {closed.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-2 text-xs">
                      <div>
                        <span className="font-mono font-medium">{o.symbol}</span>{" "}
                        <span className="text-muted-foreground">{o.side} {o.qty}</span>
                        <div className="text-muted-foreground">{o.note}</div>
                      </div>
                      <div
                        className={cn(
                          "shrink-0 font-mono tabular-nums",
                          o.realizedUsd > 0 && "text-emerald-500",
                          o.realizedUsd < 0 && "text-destructive",
                        )}
                      >
                        {o.realizedUsd ? usd(o.realizedUsd) : o.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
