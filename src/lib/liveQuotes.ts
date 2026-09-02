/**
 * liveQuotes — real market data feed for the dual loop.
 *
 * Talks to hub/quotes_router.py (mounted at /api/market-data) which owns the
 * provider fallback chain (alpaca → finnhub → twelvedata → alphavantage).
 * The browser NEVER fabricates a price: if the backend is offline or every
 * provider fails, we return `ok: false` and the caller decides (the Mock Data
 * Guard then downgrades the tick to simulated/paper).
 */
import { getApiBase } from "@/lib/apiConfig";
import { getStreamTicks, isStreamLive } from "@/lib/marketSocket";

export interface LiveQuote {
  symbol: string;
  price: number;
  provider: string;
  ts: number;
  cached?: boolean;
  change_pct?: number;
  high?: number;
  low?: number;
  prev_close?: number;
}

export interface QuotesResult {
  ok: boolean;
  quotes: Record<string, LiveQuote>;
  errors: Record<string, string[]>;
  /** Age of the freshest snapshot, in seconds. */
  ageSec: number;
  source: "quotes_router" | "unavailable";
  error?: string;
}

const TIMEOUT_MS = 8000;

export async function fetchQuotes(symbols: string[]): Promise<QuotesResult> {
  const empty: QuotesResult = {
    ok: false,
    quotes: {},
    errors: {},
    ageSec: Number.POSITIVE_INFINITY,
    source: "unavailable",
  };
  if (symbols.length === 0) return empty;

  // ---- 1. streaming ticks first (WebSocket) ---------------------------
  const streamed = getStreamTicks(symbols);
  const streamedSymbols = Object.keys(streamed);
  if (isStreamLive() && streamedSymbols.length === symbols.length) {
    const now = Date.now() / 1000;
    const quotes: Record<string, LiveQuote> = {};
    streamedSymbols.forEach((s) => {
      const t = streamed[s]!;
      quotes[s] = { symbol: s, price: t.price, provider: t.provider, ts: t.ts };
    });
    const ages = Object.values(quotes).map((q) => Math.max(0, now - q.ts));
    return {
      ok: true,
      quotes,
      errors: {},
      ageSec: ages.length ? Math.min(...ages) : 0,
      source: "quotes_router",
    };
  }

  // ---- 2. REST fallback (quotes_router provider chain) ------------------
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `${getApiBase()}/api/market-data/quote?symbols=${encodeURIComponent(symbols.join(","))}`,
      { signal: controller.signal },
    );
    if (!res.ok) return { ...empty, error: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      ok: boolean;
      quotes: Record<string, LiveQuote>;
      errors?: Record<string, string[]>;
    };
    const quotes = { ...(data.quotes ?? {}) };
    // Streamed ticks win over REST snapshots when both exist.
    streamedSymbols.forEach((s2) => {
      const t = streamed[s2]!;
      quotes[s2] = { symbol: s2, price: t.price, provider: t.provider, ts: t.ts };
    });
    const now = Date.now() / 1000;
    const ages = Object.values(quotes).map((q) => Math.max(0, now - (q.ts ?? now)));
    return {
      ok: Boolean(data.ok) && Object.keys(quotes).length > 0,
      quotes,
      errors: data.errors ?? {},
      ageSec: ages.length ? Math.min(...ages) : Number.POSITIVE_INFINITY,
      source: "quotes_router",
    };
  } catch (err) {
    return { ...empty, error: (err as Error).message || "network error" };
  } finally {
    clearTimeout(timer);
  }
}

export async function quotesHealth(): Promise<{ ok: boolean; providers: Record<string, boolean>; missing: string[] }> {
  try {
    const res = await fetch(`${getApiBase()}/api/market-data/health`);
    if (!res.ok) return { ok: false, providers: {}, missing: [] };
    const d = (await res.json()) as { ok: boolean; providers?: Record<string, boolean>; missing?: string[] };
    return { ok: Boolean(d.ok), providers: d.providers ?? {}, missing: d.missing ?? [] };
  } catch {
    return { ok: false, providers: {}, missing: [] };
  }
}

/* ------------------------------------------------------------------ *
 * Rolling price history → real ATR(14) proxy per symbol
 * ------------------------------------------------------------------ */

const history = new Map<string, number[]>();
const MAX_POINTS = 60;

export function pushPrice(symbol: string, price: number): void {
  const arr = history.get(symbol) ?? [];
  arr.push(price);
  if (arr.length > MAX_POINTS) arr.shift();
  history.set(symbol, arr);
}

/** True-range average over the stored tick series; null until enough data. */
export function estimateAtr(symbol: string, period = 14): number | null {
  const arr = history.get(symbol);
  if (!arr || arr.length < 3) return null;
  const window = arr.slice(-(period + 1));
  let sum = 0;
  for (let i = 1; i < window.length; i += 1) sum += Math.abs(window[i]! - window[i - 1]!);
  return sum / (window.length - 1) || null;
}

/** Simple momentum score 0-100 from the stored tick series. */
export function momentumScore(symbol: string): number | null {
  const arr = history.get(symbol);
  if (!arr || arr.length < 4) return null;
  const first = arr[0]!;
  const last = arr[arr.length - 1]!;
  if (!first) return null;
  const pct = ((last - first) / first) * 100;
  return Math.max(0, Math.min(100, 50 + pct * 12));
}

export function clearPriceHistory(): void {
  history.clear();
}
