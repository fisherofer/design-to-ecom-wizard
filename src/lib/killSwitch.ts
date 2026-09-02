/**
 * killSwitch — global emergency halt.
 *
 * When armed:
 *   • the dual loop is stopped
 *   • every working order is cancelled
 *   • no new order may be submitted (orderTicket refuses)
 *   • the market stream is disconnected
 *
 * Persisted so a reload cannot silently re-enable trading.
 */
import { useEffect, useState } from "react";

const KEY = "ofer.kill-switch.v1";
export const KILL_EVENT = "ofer:kill-switch-changed";

export interface KillState {
  engaged: boolean;
  at: string | null;
  reason: string;
  by: string;
}

const DEFAULT: KillState = { engaged: false, at: null, reason: "", by: "" };

export function getKillState(): KillState {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<KillState>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function write(next: KillState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(KILL_EVENT));
}

export function isKilled(): boolean {
  return getKillState().engaged;
}

/** Engage the halt. Returns the new state. */
export function engageKillSwitch(reason = "Manual emergency halt", by = "operator"): KillState {
  const next: KillState = { engaged: true, at: new Date().toISOString(), reason, by };
  write(next);
  return next;
}

export function releaseKillSwitch(): KillState {
  const next: KillState = { engaged: false, at: new Date().toISOString(), reason: "", by: "" };
  write(next);
  return next;
}

export function useKillSwitch(): KillState {
  const [s, setS] = useState<KillState>(DEFAULT);
  useEffect(() => {
    const sync = () => setS(getKillState());
    sync();
    window.addEventListener(KILL_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(KILL_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return s;
}
