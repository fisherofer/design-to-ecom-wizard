/**
 * Trading Mode
 * ============
 * Master switch that controls whether live-trading UI surfaces (Trading Hub,
 * Portfolio, AI Triggers, Alerts) are shown in navigation. When disabled the
 * app operates in "research / monitoring only" mode.
 *
 * Storage: localStorage `ai-os.trading-mode.v1`.
 */
import { useEffect, useState } from "react";

const KEY = "ai-os.trading-mode.v1";
const EVENT = "ai-os:trading-mode-changed";

/** Routes considered "trading surfaces" — hidden from nav when disabled. */
export const TRADING_ROUTES: readonly string[] = [
  "/trading",
  "/portfolio",
  "/triggers",
  "/alerts",
];

export function isTradingRoute(path: string): boolean {
  return TRADING_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

function read(): boolean {
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(KEY);
  return raw === "1";
}

function write(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const tradingMode = {
  get: read,
  set: write,
  toggle() {
    write(!read());
  },
};

export function useTradingEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => read());
  useEffect(() => {
    const sync = () => setEnabled(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [enabled, (v: boolean) => write(v)];
}
