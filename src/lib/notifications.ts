/**
 * Lightweight notification store — persisted to localStorage, backed by a
 * pub/sub event so the bell in TopHeader stays in sync across the app.
 */
import { useEffect, useState } from "react";

export type NotificationLevel = "info" | "success" | "warn" | "critical";

export interface Notification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  ts: string;
  read: boolean;
  href?: string;
}

const KEY = "ai-os.notifications.v1";
const EVENT = "ai-os:notifications-changed";

function read(): Notification[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(list: Notification[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
  window.dispatchEvent(new CustomEvent(EVENT));
}

let seeded = false;
function seed() {
  if (seeded) return;
  seeded = true;
  const cur = read();
  if (cur.length > 0) return;
  const now = Date.now();
  write([
    {
      id: "n_boot",
      level: "success",
      title: "System online",
      message: "AI Executive OS booted. Alpaca connector armed.",
      ts: new Date(now - 90_000).toISOString(),
      read: false,
    },
    {
      id: "n_backend",
      level: "warn",
      title: "Backend discovery",
      message: "Python Backend not detected on any port. Using mock data.",
      ts: new Date(now - 60_000).toISOString(),
      read: false,
      href: "/goose",
    },
    {
      id: "n_bell",
      level: "info",
      title: "Notifications enabled",
      message: "Click the bell to review alerts and mark them as read.",
      ts: new Date(now - 30_000).toISOString(),
      read: false,
    },
  ]);
}

export const notifications = {
  list: () => {
    seed();
    return read();
  },
  unread: () => read().filter((n) => !n.read).length,
  push(n: Omit<Notification, "id" | "ts" | "read"> & { id?: string }) {
    const list = read();
    const item: Notification = {
      id: n.id ?? `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: new Date().toISOString(),
      read: false,
      ...n,
    };
    write([item, ...list]);
    if (typeof window !== "undefined") {
      import("./alertsDedupLog")
        .then(({ alertsDedupLog }) =>
          alertsDedupLog.record({ title: item.title, message: item.message, level: item.level }),
        )
        .catch(() => {});
    }
    return item;
  },
  markRead(id: string) {
    write(read().map((n) => (n.id === id ? { ...n, read: true } : n)));
  },
  markAllRead() {
    write(read().map((n) => ({ ...n, read: true })));
  },
  clear() {
    write([]);
  },
};

export function useNotifications() {
  const [list, setList] = useState<Notification[]>(() => {
    seed();
    return read();
  });
  useEffect(() => {
    const sync = () => setList(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}
