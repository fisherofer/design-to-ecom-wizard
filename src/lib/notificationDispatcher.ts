/**
 * notificationDispatcher.ts — front-end mirror of backend/notification_dispatcher.py.
 *
 * Responsibilities:
 *   • Build a human-readable preview of an alert before it is sent.
 *   • Fan the payload out to the selected channels (in-app bell, web push,
 *     email, telegram / whatsapp / webhook once the backend relay is wired).
 *   • Keep a persisted dispatch history (per-channel result) for auditing.
 *   • Throttle repeat alerts for the same symbol (same 15-min window as the
 *     Python dispatcher).
 */
import { useEffect, useState } from "react";
import { channels, type Channel } from "./alertChannels";
import { notifications } from "./notifications";
import { sendTelegram, sendWebhookRelay } from "./relay.functions";
import { pushToAllDevices } from "./pushClient";

export interface DispatchPayload {
  symbol: string;
  action: "BUY" | "SELL" | "INFO";
  confidence: number;        // 0..1
  priceChangePct?: number;
  relativeVolume?: number;
  details?: string;
}

export type DeliveryStatus = "sent" | "queued" | "skipped" | "failed";

export interface DeliveryResult {
  channelId: string;
  label: string;
  status: DeliveryStatus;
  note?: string;
}

export interface DispatchRecord {
  id: string;
  ts: string;
  payload: DispatchPayload;
  subject: string;
  body: string;
  results: DeliveryResult[];
}

const HISTORY_KEY = "ai-os.dispatch.history.v1";
const THROTTLE_KEY = "ai-os.dispatch.throttle.v1";
const EVT = "ai-os:dispatch-changed";
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

function readHistory(): DispatchRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}
function writeHistory(list: DispatchRecord[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200)));
  window.dispatchEvent(new CustomEvent(EVT));
}
function readThrottle(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(THROTTLE_KEY) ?? "{}"); } catch { return {}; }
}

const pct = (v?: number) => (v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);

/** Render the exact subject + body that each channel will deliver. */
export function buildPreview(p: DispatchPayload) {
  const subject = `${p.action} ${p.symbol} · confidence ${(p.confidence * 100).toFixed(1)}%`;
  const body = [
    `Symbol: ${p.symbol}`,
    `Action: ${p.action}`,
    `Confidence: ${(p.confidence * 100).toFixed(1)}%`,
    `Price change: ${pct(p.priceChangePct)}`,
    `Relative volume: ${p.relativeVolume !== undefined ? `${p.relativeVolume.toFixed(1)}×` : "—"}`,
    p.details ? `\n${p.details}` : "",
  ].filter(Boolean).join("\n");
  return { subject, body };
}

async function deliver(ch: Channel, subject: string, body: string): Promise<DeliveryResult> {
  const base = { channelId: ch.id, label: ch.label };
  if (!ch.enabled) return { ...base, status: "skipped", note: "Channel disabled" };

  switch (ch.kind) {
    case "bell":
      notifications.push({ level: "warn", title: subject, message: body });
      return { ...base, status: "sent" };
    case "push": {
      // Prefer real Web Push (works with the screen off / app closed on Android).
      const res = await pushToAllDevices(subject, body, "/alerts");
      if (res.ok) return { ...base, status: "sent", note: res.detail };
      // Fall back to a foreground Notification so the alert is never lost.
      if (typeof window === "undefined" || !("Notification" in window)) {
        return { ...base, status: "failed", note: res.detail };
      }
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission !== "granted") {
        return { ...base, status: "failed", note: `${res.detail} · permission denied` };
      }
      new Notification(subject, { body, icon: "/icon-192.png" });
      return { ...base, status: "sent", note: `Foreground only — ${res.detail}` };
    }
    case "telegram": {
      if (!ch.target) return { ...base, status: "failed", note: "No chat_id configured" };
      const r = await sendTelegram({ data: { chatId: ch.target, subject, body, silent: false } });
      return { ...base, status: r.ok ? "sent" : "failed", note: r.detail };
    }
    case "webhook": {
      if (!ch.target) return { ...base, status: "failed", note: "No webhook URL" };
      const r = await sendWebhookRelay({ data: { url: ch.target, subject, body } });
      return { ...base, status: r.ok ? "sent" : "failed", note: r.detail };
    }
    case "email":
      if (!ch.target) return { ...base, status: "failed", note: "No recipient address" };
      return { ...base, status: "queued", note: `Queued for ${ch.target} (email relay not wired)` };
    default:
      if (!ch.target) return { ...base, status: "failed", note: "Missing target" };
      return { ...base, status: "queued", note: "WhatsApp Cloud API relay not wired" };
  }
}

export const dispatcher = {
  history: () => readHistory(),
  clear: () => writeHistory([]),

  /** Remaining throttle time in ms for a symbol (0 = free to send). */
  throttleLeft(symbol: string) {
    const last = readThrottle()[symbol.toUpperCase()] ?? 0;
    return Math.max(0, THROTTLE_WINDOW_MS - (Date.now() - last));
  },

  async dispatch(payload: DispatchPayload, channelIds?: string[], opts?: { ignoreThrottle?: boolean }) {
    const symbol = payload.symbol.toUpperCase();
    if (!opts?.ignoreThrottle && this.throttleLeft(symbol) > 0) {
      return null;
    }
    const throttle = readThrottle();
    throttle[symbol] = Date.now();
    localStorage.setItem(THROTTLE_KEY, JSON.stringify(throttle));

    const { subject, body } = buildPreview({ ...payload, symbol });
    const targets = channels.list().filter((c) => (channelIds ? channelIds.includes(c.id) : c.enabled));
    const results: DeliveryResult[] = [];
    for (const ch of targets) {
      try {
        results.push(await deliver(ch, subject, body));
      } catch (e) {
        results.push({ channelId: ch.id, label: ch.label, status: "failed", note: String(e) });
      }
    }

    const record: DispatchRecord = {
      id: `d_${Date.now().toString(36)}`,
      ts: new Date().toISOString(),
      payload: { ...payload, symbol },
      subject,
      body,
      results,
    };
    writeHistory([record, ...readHistory()]);
    return record;
  },
};

export function useDispatchHistory() {
  const [list, setList] = useState<DispatchRecord[]>([]);
  useEffect(() => {
    const sync = () => setList(readHistory());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}
