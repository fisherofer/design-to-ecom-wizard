/**
 * BrokerReconciliation — truth check against the real broker (Alpaca).
 *
 * Compares the app's local view (dual-loop book + order-ticket brackets)
 * against the broker account/positions returned by the backend at
 * `/api/account/summary` and `/api/account/positions`.
 * Differences in quantity, average price, unrealised P&L and open interest
 * are flagged so the operator can see when the local book has drifted.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Landmark, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getApiBase } from "@/lib/apiConfig";
import { useLoopState } from "@/lib/dualLoopRunner";
import { bookPositions } from "@/lib/orderTicket";
import { cn } from "@/lib/utils";

interface BrokerPosition {
  symbol: string;
  qty: number;
  avg_entry_price: number;
  current_price: number;
  market_value: number;
  unrealized_pl: number;
  side: string;
}

interface AccountSummary {
  equity: number;
  cash: number;
  buying_power: number;
  day_pnl: number;
  is_simulated: boolean;
  account_status?: string;
  error?: string;
}

interface Row {
  symbol: string;
  localQty: number;
  brokerQty: number;
  localAvg: number;
  brokerAvg: number;
  localPnl: number;
  brokerPnl: number;
  localNotional: number;
  brokerNotional: number;
  match: boolean;
}

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function BrokerReconciliation() {
  const loop = useLoopState();
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [positions, setPositions] = useState<BrokerPosition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, pRes] = await Promise.all([
        fetch(`${getApiBase()}/api/account/summary`, { signal: AbortSignal.timeout(10_000) }),
        fetch(`${getApiBase()}/api/account/positions`, { signal: AbortSignal.timeout(10_000) }),
      ]);
      if (!aRes.ok) throw new Error(`account HTTP ${aRes.status}`);
      const acc = (await aRes.json()) as AccountSummary;
      setAccount(acc);
      if (acc.error) setError(acc.error);

      if (pRes.ok) {
        const data = (await pRes.json()) as { positions?: BrokerPosition[]; error?: string };
        setPositions(data.positions ?? []);
        if (data.error) setError((e) => e ?? data.error ?? null);
      } else {
        setPositions([]);
      }
      setCheckedAt(new Date().toISOString());
    } catch (err) {
      setAccount(null);
      setPositions([]);
      setError((err as Error).message || "Backend unreachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  // ---- build the diff table ------------------------------------------
  const localBook = [
    ...loop.positions.map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avg: p.avgPrice,
      pnl: p.unrealizedUsd,
      notional: p.notionalUsd,
    })),
    ...bookPositions().map((p) => ({
      symbol: p.symbol,
      qty: p.qty,
      avg: p.avgPrice,
      pnl: p.unrealizedUsd,
      notional: p.notionalUsd,
    })),
  ];

  const merged = new Map<string, { qty: number; avg: number; pnl: number; notional: number }>();
  localBook.forEach((p) => {
    const cur = merged.get(p.symbol);
    if (!cur) merged.set(p.symbol, { ...p });
    else {
      const qty = cur.qty + p.qty;
      merged.set(p.symbol, {
        qty,
        avg: qty ? (cur.avg * cur.qty + p.avg * p.qty) / qty : cur.avg,
        pnl: cur.pnl + p.pnl,
        notional: cur.notional + p.notional,
      });
    }
  });

  const symbols = Array.from(new Set([...merged.keys(), ...positions.map((p) => p.symbol)]));
  const rows: Row[] = symbols.map((symbol) => {
    const local = merged.get(symbol);
    const broker = positions.find((p) => p.symbol === symbol);
    const localQty = Number((local?.qty ?? 0).toFixed(4));
    const brokerQty = Number((broker?.qty ?? 0).toFixed(4));
    return {
      symbol,
      localQty,
      brokerQty,
      localAvg: local?.avg ?? 0,
      brokerAvg: broker?.avg_entry_price ?? 0,
      localPnl: local?.pnl ?? 0,
      brokerPnl: broker?.unrealized_pl ?? 0,
      localNotional: local?.notional ?? 0,
      brokerNotional: Math.abs(broker?.market_value ?? 0),
      match: Math.abs(localQty - brokerQty) < 0.01,
    };
  });

  const mismatches = rows.filter((r) => !r.match).length;
  const brokerOi = positions.reduce((a, p) => a + Math.abs(p.market_value), 0);
  const brokerPnl = positions.reduce((a, p) => a + p.unrealized_pl, 0);
  const localOi = rows.reduce((a, r) => a + r.localNotional, 0);
  const localPnl = rows.reduce((a, r) => a + r.localPnl, 0);

  const connected = Boolean(account) && !account?.is_simulated;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Broker Reconciliation · Alpaca</h2>
          <Badge variant={connected ? "default" : "destructive"} className="gap-1">
            {connected ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {connected ? "CONNECTED" : "NO BROKER"}
          </Badge>
          {mismatches > 0 ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {mismatches} drift
            </Badge>
          ) : (
            <Badge variant="outline">in sync</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Reconcile
        </Button>
      </header>

      {error ? (
        <div className="border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error} — positions below reflect the local book only.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          { label: "Broker equity", value: account ? usd(account.equity) : "—" },
          { label: "Broker cash", value: account ? usd(account.cash) : "—" },
          {
            label: "Open interest (local / broker)",
            value: `${usd(localOi)} / ${usd(brokerOi)}`,
          },
          {
            label: "Unrealised P&L (local / broker)",
            value: `${usd(localPnl)} / ${usd(brokerPnl)}`,
          },
        ].map((s) => (
          <div key={s.label} className="bg-card p-3">
            <div className="text-[11px] text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono text-sm tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Symbol</th>
              <th className="px-3 py-2 text-right font-medium">Qty local</th>
              <th className="px-3 py-2 text-right font-medium">Qty broker</th>
              <th className="px-3 py-2 text-right font-medium">Avg local</th>
              <th className="px-3 py-2 text-right font-medium">Avg broker</th>
              <th className="px-3 py-2 text-right font-medium">P&L local</th>
              <th className="px-3 py-2 text-right font-medium">P&L broker</th>
              <th className="px-3 py-2 text-right font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No positions on either side.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.symbol} className="border-t border-border">
                  <td className="px-4 py-2 font-mono font-medium">{r.symbol}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.localQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.brokerQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.localAvg ? r.localAvg.toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.brokerAvg ? r.brokerAvg.toFixed(2) : "—"}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.localPnl > 0 && "text-emerald-500",
                      r.localPnl < 0 && "text-destructive",
                    )}
                  >
                    {usd(r.localPnl)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.brokerPnl > 0 && "text-emerald-500",
                      r.brokerPnl < 0 && "text-destructive",
                    )}
                  >
                    {usd(r.brokerPnl)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Badge variant={r.match ? "outline" : "destructive"}>{r.match ? "match" : "drift"}</Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
        {checkedAt ? `Last reconciled ${new Date(checkedAt).toLocaleTimeString()}` : "Not reconciled yet"} · auto every 30s
      </footer>
    </section>
  );
}
