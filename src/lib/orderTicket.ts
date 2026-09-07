/**
 * orderTicket — bracket order book with stop / target management.
 *
 * A bracket = parent entry order + protective stop-loss + take-profit target.
 * Once the parent fills, both children go "working"; whichever triggers first
 * closes the position and the sibling is cancelled (OCO semantics).
 *
 * Prices come from the real feed (marketSocket → quotes_router). Nothing is
 * fabricated: without a verified price the ticket stays PENDING and reports
 * "no feed". Submission is refused while the kill-switch is engaged.
 *
 * The book is persisted through portableStorage so a Portable profile keeps
 * its working orders across restarts, and is mirrored to the local OMS
 * backend (`/api/oms/orders/create`) when it is reachable.
 */
import { useEffect, useState } from "react";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { fetchQuotes } from "@/lib/liveQuotes";
import { isKilled } from "@/lib/killSwitch";
import { getApiBase } from "@/lib/apiConfig";
import {
  cancelAllBrokerOrders,
  cancelBrokerOrder,
  listBrokerOrders,
  mapBrokerStatus,
  submitBrokerBracket,
} from "@/lib/brokerOrders";
import { journal } from "@/lib/tradeJournal";

export const ORDER_BOOK_KEY = "ofer.orders.book.v1";
export const ORDER_EVENT = "ofer:orders-changed";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";
export type TimeInForce = "DAY" | "GTC" | "IOC";
export type OrderStatus =
  | "PENDING"
  | "WORKING"
  | "FILLED"
  | "CANCELLED"
  | "REJECTED"
  | "CLOSED";
export type LegKind = "ENTRY" | "STOP" | "TARGET";

export interface OrderLeg {
  kind: LegKind;
  price: number | null;
  status: OrderStatus;
  filledAt: string | null;
  fillPrice: number | null;
}

export interface BracketOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  qty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  /** Realised P&L once the bracket closes. */
  realizedUsd: number;
  entryFill: number | null;
  exitFill: number | null;
  exitReason: string | null;
  paper: boolean;
  note: string;
  legs: OrderLeg[];
  brokerOrderId: string | null;
}

export interface BookPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  unrealizedUsd: number;
  notionalUsd: number;
  stopPrice: number | null;
  targetPrice: number | null;
  orderId: string;
}

export interface OrderBook {
  orders: BracketOrder[];
  realizedUsd: number;
  lastSyncAt: string | null;
  feedError: string | null;
}

const EMPTY: OrderBook = { orders: [], realizedUsd: 0, lastSyncAt: null, feedError: null };

export function getBook(): OrderBook {
  const stored = portableGetJson<Partial<OrderBook>>(ORDER_BOOK_KEY, {});
  return {
    ...EMPTY,
    ...stored,
    orders: Array.isArray(stored.orders) ? stored.orders : [],
  };
}

function write(next: OrderBook) {
  portableSetJson(ORDER_BOOK_KEY, next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ORDER_EVENT));
}

function patch(p: Partial<OrderBook>): OrderBook {
  const next = { ...getBook(), ...p };
  write(next);
  return next;
}

function uid(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function leg(kind: LegKind, price: number | null): OrderLeg {
  return { kind, price, status: "PENDING", filledAt: null, fillPrice: null };
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export interface DraftOrder {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  tif: TimeInForce;
  qty: number;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  paper: boolean;
}

export function validateDraft(d: DraftOrder, refPrice: number | null): string[] {
  const errors: string[] = [];
  if (!d.symbol.trim()) errors.push("Symbol is required");
  if (!(d.qty > 0)) errors.push("Quantity must be greater than zero");
  if (d.type === "LIMIT" && !(d.limitPrice && d.limitPrice > 0))
    errors.push("Limit price is required for a LIMIT order");

  const entry = d.type === "LIMIT" ? d.limitPrice : refPrice;
  if (entry && entry > 0) {
    if (d.stopPrice) {
      if (d.side === "BUY" && d.stopPrice >= entry) errors.push("BUY stop-loss must be below the entry price");
      if (d.side === "SELL" && d.stopPrice <= entry) errors.push("SELL stop-loss must be above the entry price");
    }
    if (d.targetPrice) {
      if (d.side === "BUY" && d.targetPrice <= entry) errors.push("BUY take-profit must be above the entry price");
      if (d.side === "SELL" && d.targetPrice >= entry) errors.push("SELL take-profit must be below the entry price");
    }
  }
  return errors;
}

/** Risk / reward preview for the ticket form. */
export function previewRisk(d: DraftOrder, refPrice: number | null) {
  const entry = (d.type === "LIMIT" ? d.limitPrice : refPrice) ?? 0;
  const dir = d.side === "BUY" ? 1 : -1;
  const riskUsd = d.stopPrice && entry ? Math.abs((entry - d.stopPrice) * d.qty) : null;
  const rewardUsd = d.targetPrice && entry ? Math.abs((d.targetPrice - entry) * d.qty) : null;
  const rr = riskUsd && rewardUsd ? rewardUsd / riskUsd : null;
  return {
    entry,
    notionalUsd: entry * d.qty,
    riskUsd,
    rewardUsd,
    rr,
    direction: dir,
  };
}

/* ------------------------------------------------------------------ *
 * Submission
 * ------------------------------------------------------------------ */

export interface SubmitResult {
  ok: boolean;
  order?: BracketOrder;
  errors: string[];
  warnings?: string[];
}

async function mirrorToOms(order: BracketOrder): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBase()}/api/oms/orders/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: order.symbol,
        side: order.side,
        order_type: order.type,
        quantity: order.qty,
        price: order.limitPrice ?? order.entryFill ?? 0,
        exchange: "alpaca",
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { order_id?: string };
    return data.order_id ?? null;
  } catch {
    return null;
  }
}

export async function submitBracket(draft: DraftOrder): Promise<SubmitResult> {
  if (isKilled()) {
    return { ok: false, errors: ["Kill-switch engaged — order submission is blocked"] };
  }

  const symbol = draft.symbol.trim().toUpperCase();
  const feed = await fetchQuotes([symbol]);
  const quote = feed.quotes[symbol];
  const refPrice = quote?.price && quote.price > 0 ? quote.price : null;

  const errors = validateDraft({ ...draft, symbol }, refPrice);
  if (draft.type === "MARKET" && !refPrice) {
    errors.push("No verified price for a MARKET order — connect the feed or use LIMIT");
  }
  if (errors.length) return { ok: false, errors };

  // Portfolio-level gate: concentration, gross exposure and the daily stop.
  const { preTradeCheck } = await import("@/lib/riskGuard");
  const gate = preTradeCheck({
    symbol,
    qty: draft.qty,
    price: (draft.type === "LIMIT" ? draft.limitPrice : refPrice) ?? refPrice ?? 0,
  });
  if (!gate.allowed) {
    return { ok: false, errors: gate.reasons, warnings: gate.warnings };
  }

  const now = new Date().toISOString();
  const isMarket = draft.type === "MARKET";
  const live = !draft.paper;

  /* ----- Live route: the broker is the source of truth ----- */
  if (live) {
    const res = await submitBrokerBracket({
      symbol,
      side: draft.side.toLowerCase() as "buy" | "sell",
      qty: draft.qty,
      type: draft.type.toLowerCase() as "market" | "limit",
      time_in_force: draft.tif.toLowerCase() as "day" | "gtc" | "ioc",
      limit_price: draft.limitPrice,
      stop_price: draft.stopPrice,
      target_price: draft.targetPrice,
    });

    if (!res.accepted || !res.order) {
      const reason = res.error ?? "The broker did not accept the order.";
      journal({
        eventType: "ORDER_REJECTED",
        severity: "warn",
        source: "broker",
        symbol,
        side: draft.side,
        qty: draft.qty,
        message: `Broker rejected the ${draft.side} ${draft.qty} ${symbol}: ${reason}`,
        details: { draft },
      });
      return { ok: false, errors: [reason], warnings: gate.warnings };
    }

    const bo = res.order;
    const status = mapBrokerStatus(bo.status);
    const fill = bo.filled_avg_price > 0 ? bo.filled_avg_price : null;
    const order: BracketOrder = {
      id: uid(),
      symbol,
      side: draft.side,
      type: draft.type,
      tif: draft.tif,
      qty: draft.qty,
      limitPrice: draft.limitPrice,
      stopPrice: draft.stopPrice,
      targetPrice: draft.targetPrice,
      status,
      createdAt: now,
      updatedAt: now,
      realizedUsd: 0,
      entryFill: fill,
      exitFill: null,
      exitReason: null,
      paper: false,
      note: `Broker ${bo.status} — ${bo.order_class || "simple"} #${bo.broker_order_id.slice(0, 8)}`,
      legs: [
        { ...leg("ENTRY", draft.limitPrice ?? fill), status, filledAt: bo.filled_at, fillPrice: fill },
        { ...leg("STOP", draft.stopPrice), status: draft.stopPrice ? "WORKING" : "CANCELLED" },
        { ...leg("TARGET", draft.targetPrice), status: draft.targetPrice ? "WORKING" : "CANCELLED" },
      ],
      brokerOrderId: bo.broker_order_id,
    };

    const book = getBook();
    write({ ...book, orders: [order, ...book.orders], feedError: feed.ok ? null : (feed.error ?? "feed unavailable") });

    journal({
      eventType: "ORDER_SUBMITTED",
      severity: "info",
      source: "broker",
      symbol,
      side: draft.side,
      qty: draft.qty,
      price: fill ?? draft.limitPrice ?? refPrice,
      orderId: order.id,
      brokerOrderId: bo.broker_order_id,
      message: `LIVE ${draft.side} ${draft.qty} ${symbol} sent to the broker (stop ${draft.stopPrice ?? "—"} / target ${draft.targetPrice ?? "—"})`,
      details: { brokerStatus: bo.status, orderClass: bo.order_class, tif: draft.tif },
    });

    return { ok: true, order, errors: [], warnings: gate.warnings };
  }

  /* ----- Paper route: simulated locally against the real feed ----- */
  const entryFill = isMarket ? refPrice : null;

  const order: BracketOrder = {
    id: uid(),
    symbol,
    side: draft.side,
    type: draft.type,
    tif: draft.tif,
    qty: draft.qty,
    limitPrice: draft.limitPrice,
    stopPrice: draft.stopPrice,
    targetPrice: draft.targetPrice,
    status: isMarket ? "FILLED" : "WORKING",
    createdAt: now,
    updatedAt: now,
    realizedUsd: 0,
    entryFill,
    exitFill: null,
    exitReason: null,
    paper: true,
    note: isMarket
      ? `Paper entry filled @ ${entryFill?.toFixed(2)} (${quote?.provider ?? "feed"})`
      : `Resting ${draft.type} ${draft.side} @ ${draft.limitPrice}`,
    legs: [
      { ...leg("ENTRY", isMarket ? entryFill : draft.limitPrice), status: isMarket ? "FILLED" : "WORKING", filledAt: isMarket ? now : null, fillPrice: entryFill },
      { ...leg("STOP", draft.stopPrice), status: draft.stopPrice ? (isMarket ? "WORKING" : "PENDING") : "CANCELLED" },
      { ...leg("TARGET", draft.targetPrice), status: draft.targetPrice ? (isMarket ? "WORKING" : "PENDING") : "CANCELLED" },
    ],
    brokerOrderId: null,
  };

  const book = getBook();
  write({ ...book, orders: [order, ...book.orders], feedError: feed.ok ? null : (feed.error ?? "feed unavailable") });

  journal({
    eventType: "ORDER_SUBMITTED",
    severity: "info",
    source: "local",
    symbol,
    side: draft.side,
    qty: draft.qty,
    price: entryFill ?? draft.limitPrice,
    orderId: order.id,
    message: `PAPER ${draft.side} ${draft.qty} ${symbol} (stop ${draft.stopPrice ?? "—"} / target ${draft.targetPrice ?? "—"})`,
    details: { tif: draft.tif, type: draft.type, feed: quote?.provider ?? null },
  });

  const brokerId = await mirrorToOms(order);
  if (brokerId) updateOrder(order.id, { brokerOrderId: brokerId });

  return { ok: true, order, errors: [], warnings: gate.warnings };
}

export function updateOrder(id: string, p: Partial<BracketOrder>): void {
  const book = getBook();
  write({
    ...book,
    orders: book.orders.map((o) => (o.id === id ? { ...o, ...p, updatedAt: new Date().toISOString() } : o)),
  });
}

/**
 * Cancel a working order (or a still-open bracket's protective legs).
 * Live orders are cancelled at the broker too — the local book never diverges
 * silently from the real one.
 */
export function cancelOrder(id: string, reason = "Cancelled by operator"): void {
  const book = getBook();
  const target = book.orders.find((o) => o.id === id);

  write({
    ...book,
    orders: book.orders.map((o) => {
      if (o.id !== id) return o;
      if (o.status === "FILLED") {
        return {
          ...o,
          status: "CLOSED" as OrderStatus,
          exitReason: reason,
          updatedAt: new Date().toISOString(),
          legs: o.legs.map((l) =>
            l.kind === "ENTRY" ? l : { ...l, status: l.status === "FILLED" ? l.status : ("CANCELLED" as OrderStatus) },
          ),
        };
      }
      return {
        ...o,
        status: "CANCELLED" as OrderStatus,
        note: reason,
        updatedAt: new Date().toISOString(),
        legs: o.legs.map((l) => ({ ...l, status: l.status === "FILLED" ? l.status : ("CANCELLED" as OrderStatus) })),
      };
    }),
  });

  if (target) {
    journal({
      eventType: target.status === "FILLED" ? "POSITION_CLOSED" : "ORDER_CANCELLED",
      severity: "info",
      source: target.paper ? "local" : "broker",
      symbol: target.symbol,
      side: target.side,
      qty: target.qty,
      orderId: target.id,
      brokerOrderId: target.brokerOrderId,
      message: `${target.paper ? "PAPER" : "LIVE"} ${target.symbol} — ${reason}`,
      details: { previousStatus: target.status },
    });
    if (!target.paper && target.brokerOrderId) {
      void cancelBrokerOrder(target.brokerOrderId).then((r) => {
        if (!r.cancelled) {
          journal({
            eventType: "ORDER_CANCELLED",
            severity: "warn",
            source: "broker",
            symbol: target.symbol,
            orderId: target.id,
            brokerOrderId: target.brokerOrderId,
            message: `Broker cancel failed for ${target.symbol}: ${r.error ?? "unknown error"} — verify manually.`,
            details: {},
          });
        }
      });
    }
  }
}

export function cancelAllWorking(reason = "Bulk cancel"): number {
  const book = getBook();
  let n = 0;
  let hadLive = false;
  const orders = book.orders.map((o) => {
    if (o.status === "WORKING" || o.status === "PENDING") {
      n += 1;
      if (!o.paper) hadLive = true;
      return {
        ...o,
        status: "CANCELLED" as OrderStatus,
        note: reason,
        updatedAt: new Date().toISOString(),
        legs: o.legs.map((l) => ({ ...l, status: l.status === "FILLED" ? l.status : ("CANCELLED" as OrderStatus) })),
      };
    }
    return o;
  });
  write({ ...book, orders });

  if (n > 0) {
    journal({
      eventType: "ORDER_CANCELLED",
      severity: "warn",
      source: hadLive ? "broker" : "local",
      message: `${reason}: ${n} working order(s) cancelled.`,
      details: { count: n, includedLiveOrders: hadLive },
    });
  }
  if (hadLive) void cancelAllBrokerOrders();
  return n;
}

/**
 * Pulls real broker order state and applies it to the local book, so fills and
 * broker-side cancellations show up here instead of drifting apart.
 */
export async function reconcileBrokerOrders(): Promise<{ updated: number; error: string | null }> {
  const book = getBook();
  const liveOrders = book.orders.filter((o) => !o.paper && o.brokerOrderId);
  if (liveOrders.length === 0) return { updated: 0, error: null };

  const { orders: remote, error } = await listBrokerOrders("all");
  if (error && remote.length === 0) return { updated: 0, error };

  const byId = new Map(remote.map((r) => [r.broker_order_id, r]));
  let updated = 0;

  const next = book.orders.map((o) => {
    if (o.paper || !o.brokerOrderId) return o;
    const r = byId.get(o.brokerOrderId);
    if (!r) return o;
    const status = mapBrokerStatus(r.status);
    const fill = r.filled_avg_price > 0 ? r.filled_avg_price : o.entryFill;
    if (status === o.status && fill === o.entryFill) return o;
    updated += 1;
    if (status === "FILLED" && o.status !== "FILLED") {
      journal({
        eventType: "ORDER_FILLED",
        severity: "info",
        source: "broker",
        symbol: o.symbol,
        side: o.side,
        qty: r.filled_qty || o.qty,
        price: fill,
        orderId: o.id,
        brokerOrderId: o.brokerOrderId,
        message: `Broker filled ${o.side} ${r.filled_qty || o.qty} ${o.symbol} @ ${fill ?? "?"}`,
        details: { brokerStatus: r.status },
      });
    }
    return {
      ...o,
      status,
      entryFill: fill,
      updatedAt: new Date().toISOString(),
      note: `Broker ${r.status}${fill ? ` @ ${fill}` : ""}`,
    };
  });

  if (updated > 0) write({ ...getBook(), orders: next });
  return { updated, error: error ?? null };
}

/** Move stop / target on a live bracket. */
export function amendProtection(id: string, stopPrice: number | null, targetPrice: number | null): void {
  const book = getBook();
  const target = book.orders.find((o) => o.id === id);
  write({
    ...book,
    orders: book.orders.map((o) =>
      o.id === id
        ? {
            ...o,
            stopPrice,
            targetPrice,
            updatedAt: new Date().toISOString(),
            note: `Protection amended → stop ${stopPrice ?? "—"} / target ${targetPrice ?? "—"}`,
            legs: o.legs.map((l) =>
              l.kind === "STOP"
                ? { ...l, price: stopPrice, status: stopPrice ? "WORKING" : "CANCELLED" }
                : l.kind === "TARGET"
                  ? { ...l, price: targetPrice, status: targetPrice ? "WORKING" : "CANCELLED" }
                  : l,
            ),
          }
        : o,
    ),
  });
  if (target) {
    journal({
      eventType: "PROTECTION_AMENDED",
      severity: "info",
      source: target.paper ? "local" : "broker",
      symbol: target.symbol,
      orderId: target.id,
      brokerOrderId: target.brokerOrderId,
      message: `${target.symbol} protection moved → stop ${stopPrice ?? "—"} / target ${targetPrice ?? "—"}`,
      details: { previousStop: target.stopPrice, previousTarget: target.targetPrice },
    });
  }
}

export function clearHistory(): void {
  const book = getBook();
  write({ ...book, orders: book.orders.filter((o) => o.status === "WORKING" || o.status === "FILLED" || o.status === "PENDING") });
}

/* ------------------------------------------------------------------ *
 * Mark-to-market / trigger engine
 * ------------------------------------------------------------------ */

function closeAt(o: BracketOrder, price: number, reason: string): BracketOrder {
  const dir = o.side === "BUY" ? 1 : -1;
  const realized = Number(((price - (o.entryFill ?? price)) * o.qty * dir).toFixed(2));
  return {
    ...o,
    status: "CLOSED",
    exitFill: price,
    exitReason: reason,
    realizedUsd: realized,
    updatedAt: new Date().toISOString(),
    note: `${reason} @ ${price.toFixed(2)} → ${realized >= 0 ? "+" : ""}${realized}`,
    legs: o.legs.map((l) =>
      l.kind === "ENTRY"
        ? l
        : (l.kind === "STOP" && reason.startsWith("Stop")) || (l.kind === "TARGET" && reason.startsWith("Target"))
          ? { ...l, status: "FILLED", filledAt: new Date().toISOString(), fillPrice: price }
          : { ...l, status: "CANCELLED" },
    ),
  };
}

/**
 * Applies a fresh price map to the book: fills resting limits, triggers
 * stops/targets (OCO) and recomputes realised P&L.
 */
export function markBook(prices: Record<string, number>): OrderBook {
  const book = getBook();
  let realized = book.realizedUsd;

  const orders = book.orders.map((o) => {
    const price = prices[o.symbol];
    if (!price || price <= 0) return o;

    // resting limit → fill?
    if (o.status === "WORKING" && o.type === "LIMIT" && o.limitPrice) {
      const hit = o.side === "BUY" ? price <= o.limitPrice : price >= o.limitPrice;
      if (hit) {
        const now = new Date().toISOString();
        return {
          ...o,
          status: "FILLED" as OrderStatus,
          entryFill: o.limitPrice,
          updatedAt: now,
          note: `Limit filled @ ${o.limitPrice.toFixed(2)}`,
          legs: o.legs.map((l) =>
            l.kind === "ENTRY"
              ? { ...l, status: "FILLED" as OrderStatus, filledAt: now, fillPrice: o.limitPrice }
              : l.price
                ? { ...l, status: "WORKING" as OrderStatus }
                : l,
          ),
        };
      }
      return o;
    }

    // live bracket → stop / target
    if (o.status === "FILLED" && o.entryFill) {
      const stopHit =
        o.stopPrice != null && (o.side === "BUY" ? price <= o.stopPrice : price >= o.stopPrice);
      const targetHit =
        o.targetPrice != null && (o.side === "BUY" ? price >= o.targetPrice : price <= o.targetPrice);
      if (stopHit) {
        const closed = closeAt(o, o.stopPrice as number, "Stop-loss");
        realized += closed.realizedUsd;
        return closed;
      }
      if (targetHit) {
        const closed = closeAt(o, o.targetPrice as number, "Target");
        realized += closed.realizedUsd;
        return closed;
      }
    }
    return o;
  });

  return patch({
    orders,
    realizedUsd: Number(realized.toFixed(2)),
    lastSyncAt: new Date().toISOString(),
  });
}

/** Open positions derived from filled brackets. */
export function bookPositions(prices: Record<string, number> = {}): BookPosition[] {
  return getBook()
    .orders.filter((o) => o.status === "FILLED" && o.entryFill)
    .map((o) => {
      const last = prices[o.symbol] ?? o.entryFill ?? 0;
      const dir = o.side === "BUY" ? 1 : -1;
      return {
        symbol: o.symbol,
        qty: o.qty * dir,
        avgPrice: o.entryFill ?? 0,
        lastPrice: last,
        unrealizedUsd: Number(((last - (o.entryFill ?? last)) * o.qty * dir).toFixed(2)),
        notionalUsd: Number((last * o.qty).toFixed(2)),
        stopPrice: o.stopPrice,
        targetPrice: o.targetPrice,
        orderId: o.id,
      };
    });
}

/**
 * Refresh prices from the real feed, pull broker state for live orders and
 * re-run the trigger engine. Also enforces the portfolio daily-loss stop.
 */
export async function syncBook(): Promise<OrderBook> {
  await reconcileBrokerOrders();

  const book = getBook();
  const symbols = Array.from(
    new Set(
      book.orders
        .filter((o) => o.status === "WORKING" || o.status === "FILLED")
        .map((o) => o.symbol),
    ),
  );
  if (symbols.length === 0) return patch({ lastSyncAt: new Date().toISOString(), feedError: null });

  const feed = await fetchQuotes(symbols);
  const prices: Record<string, number> = {};
  Object.values(feed.quotes).forEach((q) => {
    if (q.price > 0) prices[q.symbol.toUpperCase()] = q.price;
  });
  const next = markBook(prices);

  try {
    const { enforceDailyLossStop } = await import("@/lib/riskGuard");
    enforceDailyLossStop();
  } catch {
    /* risk module unavailable — never block the price sync */
  }

  return patch({ ...next, feedError: feed.ok ? null : (feed.error ?? "feed unavailable") });
}

/* ------------------------------------------------------------------ *
 * React binding
 * ------------------------------------------------------------------ */

export function useOrderBook(pollMs = 5000): OrderBook {
  const [book, setBook] = useState<OrderBook>(EMPTY);
  useEffect(() => {
    const sync = () => setBook(getBook());
    sync();
    window.addEventListener(ORDER_EVENT, sync);
    const t = setInterval(() => {
      if (!isKilled()) void syncBook();
    }, pollMs);
    return () => {
      window.removeEventListener(ORDER_EVENT, sync);
      clearInterval(t);
    };
  }, [pollMs]);
  return book;
}
