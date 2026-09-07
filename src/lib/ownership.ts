/**
 * Ownership & insider data client — talks to the local quant hub
 * (`GET /api/ownership/{symbol}`, backed by yfinance with a Finnhub fallback).
 * No synthetic numbers: when the hub is offline the caller gets an explicit
 * `available: false` with the reason.
 */
import { getQuantApiBase } from "./apiConfig";

export interface InsiderTrade {
  name?: string;
  relation?: string;
  transaction?: string;
  shares?: number;
  value?: number;
  date?: string;
}

export interface OwnershipSnapshot {
  success: boolean;
  symbol: string;
  available: boolean;
  insider_percent?: number | null;
  institution_percent?: number | null;
  float_shares?: number | null;
  shares_outstanding?: number | null;
  short_percent?: number | null;
  holders?: Array<{ holder?: string; shares?: number; value?: number; pct?: number }>;
  insider_trades?: InsiderTrade[];
  source?: string;
  reason?: string;
}

const TIMEOUT_MS = 12_000;

export async function fetchOwnership(symbol: string): Promise<OwnershipSnapshot> {
  const fallback: OwnershipSnapshot = { success: false, symbol, available: false };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${getQuantApiBase()}/api/ownership/${encodeURIComponent(symbol)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { ...fallback, reason: `Backend returned ${res.status}` };
    return (await res.json()) as OwnershipSnapshot;
  } catch (e) {
    return { ...fallback, reason: `Backend unreachable — ${(e as Error).message}` };
  }
}
