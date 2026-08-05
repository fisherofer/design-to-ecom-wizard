/**
 * alertChannels.ts — Where alerts are delivered.
 *
 * Frontend-only config (mirrored to the backend once wired). Supports:
 *   • Telegram Bot (chat_id + token from connector)
 *   • WhatsApp (Cloud API — phone number id + token)
 *   • Web Push (browser Notification API + optional FCM endpoint for Android)
 *   • Bell (always-on in-app notification)
 */
import { useEffect, useState } from "react";

export type ChannelKind = "telegram" | "whatsapp" | "push" | "bell" | "email" | "webhook";

export interface Channel {
  id: string;
  kind: ChannelKind;
  label: string;
  enabled: boolean;
  target?: string;    // chat id / phone number / email / webhook url
  meta?: Record<string, string>;
}

const KEY = "ai-os.alertChannels.v1";
const EVT = "ai-os:channels-changed";

function defaults(): Channel[] {
  return [
    { id: "bell", kind: "bell", label: "In-app bell", enabled: true },
    { id: "push", kind: "push", label: "Browser / Android Push", enabled: false },
    { id: "email", kind: "email", label: "Email", enabled: false, target: "" },
    { id: "telegram", kind: "telegram", label: "Telegram bot", enabled: false, target: "", meta: { botName: "OferTradingBot" } },
    { id: "whatsapp", kind: "whatsapp", label: "WhatsApp Cloud API", enabled: false, target: "" },
    { id: "webhook", kind: "webhook", label: "Webhook (Google Chat / Slack)", enabled: false, target: "" },
  ];
}

function read(): Channel[] {
  if (typeof window === "undefined") return [];
  let stored: Channel[] | null = null;
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { stored = null; }
  if (!stored) return seed();
  // merge in any channel kinds added after the user's config was first written
  const missing = defaults().filter((d) => !stored!.some((c) => c.id === d.id));
  if (missing.length) {
    const merged = [...stored, ...missing];
    localStorage.setItem(KEY, JSON.stringify(merged));
    return merged;
  }
  return stored;
}
function write(list: Channel[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVT));
}
function seed(): Channel[] {
  const initial = defaults();
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(initial));
  return initial;
}


export const channels = {
  list: () => read(),
  update(id: string, patch: Partial<Channel>) {
    write(read().map((c) => (c.id === id ? { ...c, ...patch } : c)));
  },
  async testPush(label: string) {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return "denied";
    new Notification("OferTradingBot", { body: `Test alert · ${label}`, icon: "/favicon.ico" });
    return "ok";
  },
};

export function useChannels() {
  const [list, setList] = useState<Channel[]>(() => read());
  useEffect(() => {
    const sync = () => setList(read());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}
