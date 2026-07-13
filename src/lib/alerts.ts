/**
 * alerts.ts — Alert rules engine.
 *
 * Rule kinds (inspired by Freqtrade / Jesse / Nautilus / TradingView alerts):
 *   • percent    — absolute ±X% move vs. anchor (day-open / prev-close / entry).
 *   • trailing   — trailing-stop style: fires when price falls X% from peak (long)
 *                  or rises X% from trough (short). Peak/trough are auto-tracked.
 *   • price      — hard price crossover (above / below).
 *   • drawdown   — max drawdown from peak in current session (%).
 *   • volume     — volume spike vs. N-day average (multiplier).
 *   • rsi        — RSI(14) crosses into overbought (>70) or oversold (<30).
 *   • ma_cross   — fast MA crosses slow MA (golden / death cross).
 *   • atr        — move exceeds K × ATR(14) — volatility-adjusted breakout.
 *   • ai         — AI agent flags a market condition, with free-text explanation.
 *
 * State per rule (peak / trough / anchor) is persisted so trailing + drawdown
 * survive reloads. Delivery goes through `alertChannels.ts`.
 */
import { useEffect, useState } from "react";
import { notifications } from "./notifications";

export type AlertKind =
  | "percent"
  | "trailing"
  | "price"
  | "drawdown"
  | "volume"
  | "rsi"
  | "ma_cross"
  | "atr"
  | "ai";

export type AlertDirection = "up" | "down" | "either";
export type AnchorKind = "day_open" | "prev_close" | "entry" | "session_peak";

export interface AlertRule {
  id: string;
  kind: AlertKind;
  symbol: string;
  direction: AlertDirection;
  channels: string[];
  enabled: boolean;
  createdAt: string;

  // percent / trailing / drawdown / atr
  thresholdPct?: number;
  anchor?: AnchorKind;            // percent
  entryPrice?: number;            // trailing / percent (anchor=entry)

  // price crossover
  priceLevel?: number;

  // volume spike
  volumeMultiplier?: number;      // e.g. 3 = 3x average
  volumeAvgWindow?: number;       // days

  // RSI
  rsiPeriod?: number;             // default 14
  rsiOverbought?: number;         // default 70
  rsiOversold?: number;           // default 30

  // MA cross
  maFast?: number;                // e.g. 50
  maSlow?: number;                // e.g. 200

  // ATR
  atrPeriod?: number;             // default 14
  atrMultiplier?: number;         // e.g. 2

  // ai
  aiHint?: string;

  // runtime state (persisted)
  peakPrice?: number;
  troughPrice?: number;
  lastPrice?: number;
  lastFiredAt?: string;
  lastReason?: string;
  cooldownSec?: number;           // debounce, default 300
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  symbol: string;
  kind: AlertKind;
  changePct?: number;
  reason: string;
  aiExplanation?: string;
  ts: string;
}

export const KIND_LABELS: Record<AlertKind, string> = {
  percent: "Percent move",
  trailing: "Trailing %",
  price: "Price crossover",
  drawdown: "Drawdown %",
  volume: "Volume spike",
  rsi: "RSI extreme",
  ma_cross: "MA crossover",
  atr: "ATR breakout",
  ai: "AI signal",
};

const RULES_KEY = "ai-os.alerts.rules.v2";
const EVENTS_KEY = "ai-os.alerts.events.v1";
const EVT = "ai-os:alerts-changed";

function readRules(): AlertRule[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RULES_KEY) ?? "[]"); } catch { return []; }
}
function writeRules(list: AlertRule[]) {
  localStorage.setItem(RULES_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT));
}
function readEvents(): AlertEvent[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) ?? "[]"); } catch { return []; }
}
function writeEvents(list: AlertEvent[]) {
  localStorage.setItem(EVENTS_KEY, JSON.stringify(list.slice(0, 200)));
  window.dispatchEvent(new CustomEvent(EVT));
}

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  if (readRules().length > 0) return;
  const now = new Date().toISOString();
  writeRules([
    { id: "r_nvda_5", kind: "percent", symbol: "NVDA", thresholdPct: 5, anchor: "day_open", direction: "either", channels: ["bell"], enabled: true, createdAt: now, cooldownSec: 300 },
    { id: "r_tsla_trail", kind: "trailing", symbol: "TSLA", thresholdPct: 3, direction: "down", channels: ["bell"], enabled: true, createdAt: now, cooldownSec: 300 },
    { id: "r_spy_rsi", kind: "rsi", symbol: "SPY", rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, direction: "either", channels: ["bell"], enabled: true, createdAt: now, cooldownSec: 600 },
    { id: "r_qqq_macross", kind: "ma_cross", symbol: "QQQ", maFast: 50, maSlow: 200, direction: "either", channels: ["bell"], enabled: true, createdAt: now, cooldownSec: 3600 },
    { id: "r_spy_ai", kind: "ai", symbol: "SPY", direction: "either", aiHint: "Breakout above resistance or unusual options flow", channels: ["bell"], enabled: true, createdAt: now, cooldownSec: 300 },
  ]);
}

/**
 * evaluateRule — pure function called by the poller with the latest tick.
 * Returns an AlertEvent if the rule should fire, or null. Also mutates the
 * rule's runtime state (peak / trough) in-place — caller persists.
 */
export function evaluateRule(
  rule: AlertRule,
  tick: { price: number; dayOpen?: number; prevClose?: number; volume?: number; avgVolume?: number; rsi?: number; maFast?: number; maSlow?: number; prevMaFast?: number; prevMaSlow?: number; atr?: number }
): AlertEvent | null {
  const cool = (rule.cooldownSec ?? 300) * 1000;
  if (rule.lastFiredAt && Date.now() - new Date(rule.lastFiredAt).getTime() < cool) return null;

  // update peak / trough
  rule.peakPrice = Math.max(rule.peakPrice ?? tick.price, tick.price);
  rule.troughPrice = Math.min(rule.troughPrice ?? tick.price, tick.price);
  rule.lastPrice = tick.price;

  const dir = rule.direction;
  const mkEvent = (reason: string, changePct?: number, aiExplanation?: string): AlertEvent => ({
    id: `e_${Date.now().toString(36)}`,
    ruleId: rule.id,
    symbol: rule.symbol,
    kind: rule.kind,
    changePct,
    reason,
    aiExplanation,
    ts: new Date().toISOString(),
  });

  switch (rule.kind) {
    case "percent": {
      const anchor = rule.anchor === "prev_close" ? tick.prevClose
        : rule.anchor === "entry" ? rule.entryPrice
        : rule.anchor === "session_peak" ? rule.peakPrice
        : tick.dayOpen;
      if (!anchor) return null;
      const pct = ((tick.price - anchor) / anchor) * 100;
      const abs = Math.abs(pct);
      if (abs < (rule.thresholdPct ?? 3)) return null;
      if (dir === "up" && pct < 0) return null;
      if (dir === "down" && pct > 0) return null;
      return mkEvent(`${rule.symbol} moved ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% vs. ${rule.anchor ?? "day open"}`, pct);
    }
    case "trailing": {
      const thr = rule.thresholdPct ?? 3;
      // long-style: fall from peak
      if (dir !== "up" && rule.peakPrice) {
        const fall = ((rule.peakPrice - tick.price) / rule.peakPrice) * 100;
        if (fall >= thr) return mkEvent(`${rule.symbol} fell ${fall.toFixed(2)}% from session peak ${rule.peakPrice.toFixed(2)} → ${tick.price.toFixed(2)}`, -fall);
      }
      // short-style: rise from trough
      if (dir !== "down" && rule.troughPrice) {
        const rise = ((tick.price - rule.troughPrice) / rule.troughPrice) * 100;
        if (rise >= thr) return mkEvent(`${rule.symbol} rose ${rise.toFixed(2)}% from session trough ${rule.troughPrice.toFixed(2)} → ${tick.price.toFixed(2)}`, rise);
      }
      return null;
    }
    case "price": {
      if (rule.priceLevel === undefined) return null;
      if ((dir === "up" || dir === "either") && tick.price >= rule.priceLevel) return mkEvent(`${rule.symbol} crossed ABOVE ${rule.priceLevel}`);
      if ((dir === "down" || dir === "either") && tick.price <= rule.priceLevel) return mkEvent(`${rule.symbol} crossed BELOW ${rule.priceLevel}`);
      return null;
    }
    case "drawdown": {
      const thr = rule.thresholdPct ?? 5;
      if (!rule.peakPrice) return null;
      const dd = ((rule.peakPrice - tick.price) / rule.peakPrice) * 100;
      if (dd >= thr) return mkEvent(`${rule.symbol} drawdown ${dd.toFixed(2)}% from peak ${rule.peakPrice.toFixed(2)}`, -dd);
      return null;
    }
    case "volume": {
      const mult = rule.volumeMultiplier ?? 3;
      if (!tick.volume || !tick.avgVolume) return null;
      const ratio = tick.volume / tick.avgVolume;
      if (ratio >= mult) return mkEvent(`${rule.symbol} volume spike: ${ratio.toFixed(1)}× ${rule.volumeAvgWindow ?? 20}d avg`);
      return null;
    }
    case "rsi": {
      if (tick.rsi === undefined) return null;
      const ob = rule.rsiOverbought ?? 70;
      const os = rule.rsiOversold ?? 30;
      if ((dir === "up" || dir === "either") && tick.rsi >= ob) return mkEvent(`${rule.symbol} RSI(${rule.rsiPeriod ?? 14}) overbought at ${tick.rsi.toFixed(1)}`);
      if ((dir === "down" || dir === "either") && tick.rsi <= os) return mkEvent(`${rule.symbol} RSI(${rule.rsiPeriod ?? 14}) oversold at ${tick.rsi.toFixed(1)}`);
      return null;
    }
    case "ma_cross": {
      if (tick.maFast === undefined || tick.maSlow === undefined || tick.prevMaFast === undefined || tick.prevMaSlow === undefined) return null;
      const wasBelow = tick.prevMaFast < tick.prevMaSlow;
      const nowAbove = tick.maFast > tick.maSlow;
      if (wasBelow && nowAbove && dir !== "down") return mkEvent(`${rule.symbol} Golden Cross · MA${rule.maFast} crossed above MA${rule.maSlow}`);
      if (!wasBelow && !nowAbove && dir !== "up") return mkEvent(`${rule.symbol} Death Cross · MA${rule.maFast} crossed below MA${rule.maSlow}`);
      return null;
    }
    case "atr": {
      if (!tick.atr || !tick.dayOpen) return null;
      const mult = rule.atrMultiplier ?? 2;
      const move = tick.price - tick.dayOpen;
      if (Math.abs(move) >= mult * tick.atr) {
        const pct = (move / tick.dayOpen) * 100;
        return mkEvent(`${rule.symbol} moved ${move >= 0 ? "+" : ""}${move.toFixed(2)} ≥ ${mult}×ATR(${rule.atrPeriod ?? 14})`, pct);
      }
      return null;
    }
    case "ai":
      return null; // AI rules fired by agents, not the tick evaluator
  }
}

export const alerts = {
  rules: () => { seed(); return readRules(); },
  events: () => readEvents(),
  upsert(rule: Partial<AlertRule> & Pick<AlertRule, "symbol" | "kind">) {
    const list = readRules();
    const id = rule.id ?? `r_${Date.now().toString(36)}`;
    const existing = list.find((r) => r.id === id);
    const next: AlertRule = {
      id,
      kind: rule.kind,
      symbol: rule.symbol.toUpperCase(),
      direction: rule.direction ?? existing?.direction ?? "either",
      channels: rule.channels ?? existing?.channels ?? ["bell"],
      enabled: rule.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      cooldownSec: rule.cooldownSec ?? existing?.cooldownSec ?? 300,
      thresholdPct: rule.thresholdPct ?? existing?.thresholdPct,
      anchor: rule.anchor ?? existing?.anchor,
      entryPrice: rule.entryPrice ?? existing?.entryPrice,
      priceLevel: rule.priceLevel ?? existing?.priceLevel,
      volumeMultiplier: rule.volumeMultiplier ?? existing?.volumeMultiplier,
      volumeAvgWindow: rule.volumeAvgWindow ?? existing?.volumeAvgWindow,
      rsiPeriod: rule.rsiPeriod ?? existing?.rsiPeriod,
      rsiOverbought: rule.rsiOverbought ?? existing?.rsiOverbought,
      rsiOversold: rule.rsiOversold ?? existing?.rsiOversold,
      maFast: rule.maFast ?? existing?.maFast,
      maSlow: rule.maSlow ?? existing?.maSlow,
      atrPeriod: rule.atrPeriod ?? existing?.atrPeriod,
      atrMultiplier: rule.atrMultiplier ?? existing?.atrMultiplier,
      aiHint: rule.aiHint ?? existing?.aiHint,
      peakPrice: existing?.peakPrice,
      troughPrice: existing?.troughPrice,
      lastPrice: existing?.lastPrice,
      lastFiredAt: existing?.lastFiredAt,
      lastReason: existing?.lastReason,
    };
    writeRules([next, ...list.filter((r) => r.id !== id)]);
    return next;
  },
  toggle(id: string) {
    writeRules(readRules().map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  },
  resetState(id: string) {
    writeRules(readRules().map((r) => (r.id === id ? { ...r, peakPrice: undefined, troughPrice: undefined, lastFiredAt: undefined } : r)));
  },
  remove(id: string) {
    writeRules(readRules().filter((r) => r.id !== id));
  },
  fire(ev: Omit<AlertEvent, "id" | "ts">) {
    const event: AlertEvent = { ...ev, id: `e_${Date.now().toString(36)}`, ts: new Date().toISOString() };
    writeEvents([event, ...readEvents()]);
    notifications.push({
      level: "warn",
      title: `${event.symbol} · ${KIND_LABELS[event.kind]}`,
      message: event.reason,
      href: `/ticker/${event.symbol}`,
    });
    writeRules(readRules().map((r) => (r.id === event.ruleId ? { ...r, lastFiredAt: event.ts, lastReason: event.reason } : r)));
    return event;
  },
  /** Persist runtime state after a poll cycle. */
  saveRules(list: AlertRule[]) { writeRules(list); },
  clearEvents() { writeEvents([]); },
};

export function useAlerts() {
  const [rules, setRules] = useState<AlertRule[]>(() => { seed(); return readRules(); });
  const [events, setEvents] = useState<AlertEvent[]>(() => readEvents());
  useEffect(() => {
    const sync = () => { setRules(readRules()); setEvents(readEvents()); };
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return { rules, events };
}
