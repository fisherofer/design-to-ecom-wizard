/**
 * Hive client — community signal sharing and weighted consensus, served by the
 * local quant hub (`/api/hive/signals`, `/api/hive/consensus/{symbol}`).
 * Returns explicit availability flags instead of inventing consensus data.
 */
import { getQuantApiBase } from "./apiConfig";

export interface HiveSignal {
  user_id?: string;
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  model_version?: string;
  created_at?: number;
}

export interface HiveConsensus {
  success: boolean;
  symbol: string;
  available: boolean;
  consensus?: "BUY" | "SELL" | "HOLD" | string;
  score?: number;
  contributors?: number;
  buy_weight?: number;
  sell_weight?: number;
  signals?: HiveSignal[];
  reason?: string;
}

const TIMEOUT_MS = 12_000;

async function call<T>(path: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${getQuantApiBase()}/api/hive${path}`, { ...init, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ...fallback, reason: `Backend returned ${res.status}` };
    return (await res.json()) as T;
  } catch (e) {
    return { ...fallback, reason: `Backend unreachable — ${(e as Error).message}` };
  }
}

export function fetchConsensus(symbol: string): Promise<HiveConsensus> {
  return call<HiveConsensus>(`/consensus/${encodeURIComponent(symbol)}`, {
    success: false,
    symbol,
    available: false,
  });
}

export function shareSignal(signal: HiveSignal): Promise<{ success: boolean; reason?: string }> {
  return call<{ success: boolean; reason?: string }>(
    "/signals",
    { success: false },
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signal),
    },
  );
}
