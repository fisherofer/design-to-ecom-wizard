/**
 * alerts.ts — Alert rules engine.
 *
 * Two families of rules:
 *   • percent  — trigger when a symbol moves ±X% intraday / vs. yesterday close.
 *   • ai       — trigger when an AI agent flags a market condition (breakout,
 *                sentiment flip, news impact) with a reason string.
 *
 * Delivery goes through `alertChannels.ts` (Telegram / WhatsApp / Push / bell).
 * All state is persisted to localStorage; the engine polls every 30s and
 * dispatches a single event so panels stay in sync.
 */
import { useEffect, useState } from "react";
import { notifications } from "./notifications";

export type AlertKind = "percent" | "ai";
export type AlertDirection = "up" | "down" | "either";

export interface AlertRule {
  id: string;
  kind: AlertKind;
  symbol: string;
  /** percent threshold (e.g. 3 for ±3%) — used when kind === "percent". */
  thresholdPct?: number;
  direction: AlertDirection;
  /** free-text hint that the AI agent should look for (kind === "ai"). */
  aiHint?: string;
  channels: string[]; // channel ids from alertChannels
  enabled: boolean;
  createdAt: string;
  lastFiredAt?: string;
  lastReason?: string;
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

const RULES_KEY = "ai-os.alerts.rules.v1";
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
  writeRules([
    {
      id: "r_nvda_5",
      kind: "percent",
      symbol: "NVDA",
      thresholdPct: 5,
      direction: "either",
      channels: ["bell"],
      enabled: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "r_spy_ai",
      kind: "ai",
      symbol: "SPY",
      direction: "either",
      aiHint: "Breakout above resistance or unusual options flow",
      channels: ["bell"],
      enabled: true,
      createdAt: new Date().toISOString(),
    },
  ]);
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
      thresholdPct: rule.thresholdPct ?? existing?.thresholdPct ?? 3,
      direction: rule.direction ?? existing?.direction ?? "either",
      aiHint: rule.aiHint ?? existing?.aiHint,
      channels: rule.channels ?? existing?.channels ?? ["bell"],
      enabled: rule.enabled ?? existing?.enabled ?? true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      lastFiredAt: existing?.lastFiredAt,
      lastReason: existing?.lastReason,
    };
    const others = list.filter((r) => r.id !== id);
    writeRules([next, ...others]);
    return next;
  },
  toggle(id: string) {
    writeRules(readRules().map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  },
  remove(id: string) {
    writeRules(readRules().filter((r) => r.id !== id));
  },
  fire(ev: Omit<AlertEvent, "id" | "ts">) {
    const event: AlertEvent = { ...ev, id: `e_${Date.now().toString(36)}`, ts: new Date().toISOString() };
    writeEvents([event, ...readEvents()]);
    // mirror to the bell so the user sees it even without a channel
    notifications.push({
      level: "warn",
      title: `${event.symbol} · ${event.kind === "percent" ? `${(event.changePct ?? 0).toFixed(2)}% move` : "AI signal"}`,
      message: event.reason,
      href: `/ticker/${event.symbol}`,
    });
    // mark rule
    writeRules(readRules().map((r) => (r.id === event.ruleId ? { ...r, lastFiredAt: event.ts, lastReason: event.reason } : r)));
    return event;
  },
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
