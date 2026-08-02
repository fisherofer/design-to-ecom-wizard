/**
 * Market Microstructure client.
 *
 * Talks to the local Python backend (`hub/microstructure_routes.py`, mounted at
 * /api/micro). Free-feed honesty rules: nothing is fabricated here — when the
 * backend is unreachable or a field is unavailable we surface `available:false`
 * plus a reason, and the UI renders that state instead of numbers.
 */
import { getQuantApiBase } from "./apiConfig";

export interface OptionRow {
  contract: string | null;
  strike: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  open_interest: number | null;
  iv: number | null;
  in_the_money: boolean;
}

export interface OptionsChain {
  success: boolean;
  symbol: string;
  available: boolean;
  reason?: string | null;
  expiries?: string[];
  expiry?: string;
  calls?: OptionRow[];
  puts?: OptionRow[];
  put_call_oi_ratio?: number | null;
  source?: string;
  delayed?: boolean;
}

export interface BookSnapshot {
  success: boolean;
  symbol: string;
  available: boolean;
  level?: number;
  depth_available?: boolean;
  reason?: string | null;
  note?: string;
  bid: number | null;
  ask: number | null;
  bid_size: number | null;
  ask_size: number | null;
  last: number | null;
  spread: number | null;
  spread_bps: number | null;
  source?: string;
  delayed?: boolean;
}

export interface TapePrint {
  ts: string;
  price: number | null;
  size: number | null;
  side: "buy" | "sell" | "flat";
  granularity: string;
}

export interface TapeSnapshot {
  success: boolean;
  symbol: string;
  available: boolean;
  reason?: string | null;
  prints: TapePrint[];
  buy_volume?: number;
  sell_volume?: number;
  buy_pressure_pct?: number | null;
  note?: string;
  source?: string;
  delayed?: boolean;
}

const TIMEOUT_MS = 12_000;

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${getQuantApiBase()}/api/micro${path}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { ...fallback, reason: `Backend returned ${res.status}` };
    return (await res.json()) as T;
  } catch (e) {
    return { ...fallback, reason: `Backend unreachable — ${(e as Error).message}` };
  }
}

export function fetchOptionsChain(symbol: string, expiry?: string): Promise<OptionsChain> {
  const q = expiry ? `?expiry=${encodeURIComponent(expiry)}` : "";
  return get<OptionsChain>(`/options/${encodeURIComponent(symbol)}${q}`, {
    success: false,
    symbol,
    available: false,
    expiries: [],
    calls: [],
    puts: [],
  });
}

export function fetchBook(symbol: string): Promise<BookSnapshot> {
  return get<BookSnapshot>(`/book/${encodeURIComponent(symbol)}`, {
    success: false,
    symbol,
    available: false,
    bid: null,
    ask: null,
    bid_size: null,
    ask_size: null,
    last: null,
    spread: null,
    spread_bps: null,
  });
}

export function fetchTape(symbol: string, limit = 60): Promise<TapeSnapshot> {
  return get<TapeSnapshot>(`/tape/${encodeURIComponent(symbol)}?limit=${limit}`, {
    success: false,
    symbol,
    available: false,
    prints: [],
  });
}

/** Max-pain style summary derived only from returned open interest. */
export function summariseChain(chain: OptionsChain): {
  callOi: number;
  putOi: number;
  topCallStrike: number | null;
  topPutStrike: number | null;
} {
  const calls = chain.calls ?? [];
  const puts = chain.puts ?? [];
  const sum = (rows: OptionRow[]) => rows.reduce((s, r) => s + (r.open_interest ?? 0), 0);
  const top = (rows: OptionRow[]) =>
    rows.reduce<OptionRow | null>(
      (best, r) => ((r.open_interest ?? 0) > (best?.open_interest ?? -1) ? r : best),
      null,
    )?.strike ?? null;
  return { callOi: sum(calls), putOi: sum(puts), topCallStrike: top(calls), topPutStrike: top(puts) };
}
