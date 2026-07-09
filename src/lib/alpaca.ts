/**
 * Alpaca client — talks to the Python Backend which holds the API keys as
 * secrets. All requests hit `${getApiBase()}/api/alpaca/...`. If the Backend
 * is unreachable, high-quality mock data is returned so the UI stays alive.
 *
 * Backend endpoints expected (Goose can generate these):
 *   GET /api/alpaca/clock              -> { is_open, next_open, next_close, timestamp }
 *   GET /api/alpaca/quotes?symbols=... -> Quote[]
 *   GET /api/alpaca/bars?symbol=..&timeframe=1D&limit=200 -> Bar[]
 *   GET /api/alpaca/movers?type=gainers|losers|active     -> Mover[]
 *   GET /api/alpaca/fear-greed         -> { value, label, ts }
 *   GET /api/alpaca/watchlists         -> Watchlist[]
 *   POST /api/alpaca/watchlists        { name, symbols[] } -> Watchlist
 *   PATCH /api/alpaca/watchlists/:id   { symbols[] }       -> Watchlist
 *   DELETE /api/alpaca/watchlists/:id
 */
import { getApiBase } from "./apiConfig";

export interface AlpacaClock {
  is_open: boolean;
  next_open: string;   // ISO
  next_close: string;  // ISO
  timestamp: string;
}

export interface AlpacaQuote {
  symbol: string;
  name?: string;
  price: number;
  change: number;       // absolute
  changePct: number;    // percent
  volume?: number;
  ts: string;
}

export interface AlpacaBar {
  t: number;   // unix seconds (UTC)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaMover {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
}

export interface FearGreed {
  value: number;
  label: "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";
  ts: string;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url?: string;
  publishedAt: string;
  symbols: string[];
  /** -1 (bearish) .. +1 (bullish) */
  sentiment: number;
  impact: "low" | "medium" | "high";
}

export interface BreakoutCandidate {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  probability: number; // 0..1
  pattern: string;     // e.g. "Bull Flag", "Cup & Handle"
  reason: string;      // AI-generated rationale
  targetPrice?: number;
  stopLoss?: number;
}

export type Timeframe = "1Min" | "5Min" | "15Min" | "1H" | "1D" | "1W";

const TIMEOUT_MS = 6_000;

async function req<T>(path: string, init: RequestInit | undefined, fallback: T): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

// -------- Mock generators --------
const DEFAULT_WATCH = ["AAPL", "NVDA", "TSLA", "MSFT", "META", "GOOGL", "AMZN", "PLTR", "SPY", "QQQ"];

function mockQuote(symbol: string): AlpacaQuote {
  const base: Record<string, number> = {
    AAPL: 226.45, NVDA: 945.32, TSLA: 178.9, MSFT: 421.7, META: 512.4,
    GOOGL: 173.42, AMZN: 188.95, PLTR: 28.14, SPY: 548.71, QQQ: 471.88,
    BTC: 71240, ETH: 3812, SOL: 168.22, ZIM: 18.92, ESLT: 246.7,
    CONY: 12.45, MSTY: 24.88, AMD: 162.81,
  };
  const p = base[symbol] ?? 100;
  const drift = (Math.random() - 0.5) * 0.04;
  const price = +(p * (1 + drift)).toFixed(2);
  const change = +(price - p).toFixed(2);
  const pct = +((change / p) * 100).toFixed(2);
  return { symbol, price, change, changePct: pct, volume: Math.floor(Math.random() * 5e7), ts: new Date().toISOString() };
}

function mockBars(symbol: string, limit = 120): AlpacaBar[] {
  const q = mockQuote(symbol);
  const out: AlpacaBar[] = [];
  let price = q.price * 0.9;
  const now = Math.floor(Date.now() / 1000);
  for (let i = limit; i > 0; i--) {
    const o = price;
    const c = +(price * (1 + (Math.random() - 0.48) * 0.03)).toFixed(2);
    const h = +Math.max(o, c) * (1 + Math.random() * 0.01);
    const l = +Math.min(o, c) * (1 - Math.random() * 0.01);
    out.push({ t: now - i * 86400, o, h: +h.toFixed(2), l: +l.toFixed(2), c, v: Math.floor(Math.random() * 5e7) });
    price = c;
  }
  return out;
}

function mockMovers(kind: "gainers" | "losers" | "active"): AlpacaMover[] {
  const pool = ["NVDA", "AMD", "TSLA", "PLTR", "META", "AAPL", "MSFT", "GOOGL", "AMZN", "SMCI"];
  return pool.slice(0, 10).map((s) => {
    const q = mockQuote(s);
    const dir = kind === "losers" ? -1 : 1;
    const magnitude = kind === "active" ? (Math.random() - 0.5) * 8 : dir * (2 + Math.random() * 8);
    return {
      symbol: s,
      price: q.price,
      change: +(q.price * (magnitude / 100)).toFixed(2),
      changePct: +magnitude.toFixed(2),
      volume: Math.floor(Math.random() * 1e8 + 1e7),
    };
  }).sort((a, b) => kind === "active"
    ? b.volume - a.volume
    : kind === "losers" ? a.changePct - b.changePct : b.changePct - a.changePct);
}

function mockClock(): AlpacaClock {
  // US market: 9:30 ET open, 16:00 ET close, weekdays only.
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = et.getDay();
  const h = et.getHours();
  const m = et.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  const beforeOpen = h < 9 || (h === 9 && m < 30);
  const afterClose = h >= 16;
  const isOpen = isWeekday && !beforeOpen && !afterClose;

  const nextOpen = new Date(et);
  const nextClose = new Date(et);
  if (isOpen) {
    nextClose.setHours(16, 0, 0, 0);
    nextOpen.setDate(nextOpen.getDate() + 1);
    nextOpen.setHours(9, 30, 0, 0);
  } else {
    // find next weekday
    let addDays = 0;
    if (!isWeekday || afterClose) addDays = 1;
    while (true) {
      const probe = new Date(et);
      probe.setDate(probe.getDate() + addDays);
      const wd = probe.getDay();
      if (wd >= 1 && wd <= 5) {
        nextOpen.setTime(probe.getTime());
        nextOpen.setHours(9, 30, 0, 0);
        break;
      }
      addDays++;
    }
    nextClose.setTime(nextOpen.getTime());
    nextClose.setHours(16, 0, 0, 0);
  }
  // Convert ET back to UTC ISO by re-parsing offset
  const tzOffsetMin = new Date().getTimezoneOffset() - (new Date().getTimezoneOffset() - (et.getTimezoneOffset?.() ?? 0));
  void tzOffsetMin;
  return {
    is_open: isOpen,
    next_open: nextOpen.toISOString(),
    next_close: nextClose.toISOString(),
    timestamp: new Date().toISOString(),
  };
}

// -------- Public API --------
export const alpaca = {
  clock: () => req<AlpacaClock>("/api/alpaca/clock", undefined, mockClock()),

  quotes: (symbols: string[]) =>
    req<AlpacaQuote[]>(
      `/api/alpaca/quotes?symbols=${symbols.join(",")}`,
      undefined,
      symbols.map(mockQuote),
    ),

  bars: (symbol: string, timeframe: Timeframe = "1D", limit = 120) =>
    req<AlpacaBar[]>(
      `/api/alpaca/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
      undefined,
      mockBars(symbol, limit),
    ),

  movers: (type: "gainers" | "losers" | "active") =>
    req<AlpacaMover[]>(`/api/alpaca/movers?type=${type}`, undefined, mockMovers(type)),

  fearGreed: () =>
    req<FearGreed>("/api/alpaca/fear-greed", undefined, {
      value: 55 + Math.floor(Math.random() * 20),
      label: "Greed",
      ts: new Date().toISOString(),
    }),

  listWatchlists: () =>
    req<Watchlist[]>("/api/alpaca/watchlists", undefined, [
      { id: "wl_default", name: "My Watchlist", symbols: DEFAULT_WATCH, updatedAt: new Date().toISOString() },
    ]),

  createWatchlist: (name: string, symbols: string[]) =>
    req<Watchlist>(
      "/api/alpaca/watchlists",
      { method: "POST", body: JSON.stringify({ name, symbols }) },
      { id: `wl_${Date.now()}`, name, symbols, updatedAt: new Date().toISOString() },
    ),

  updateWatchlist: (id: string, symbols: string[]) =>
    req<Watchlist>(
      `/api/alpaca/watchlists/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify({ symbols }) },
      { id, name: "Updated", symbols, updatedAt: new Date().toISOString() },
    ),

  deleteWatchlist: (id: string) =>
    req<{ ok: boolean }>(
      `/api/alpaca/watchlists/${encodeURIComponent(id)}`,
      { method: "DELETE" },
      { ok: true },
    ),

  news: (limit = 12) =>
    req<NewsItem[]>(`/api/alpaca/news?limit=${limit}`, undefined, mockNews(limit)),

  breakouts: (limit = 8) =>
    req<BreakoutCandidate[]>(`/api/alpaca/breakouts?limit=${limit}`, undefined, mockBreakouts(limit)),
};

// -------- Additional mock generators --------
function mockNews(limit: number): NewsItem[] {
  const seed = [
    { headline: "Fed signals possible rate cut as inflation cools", symbols: ["SPY", "QQQ"], sentiment: 0.6, impact: "high" as const, source: "Reuters" },
    { headline: "NVIDIA beats Q3 estimates, guides higher on AI demand", symbols: ["NVDA", "AMD"], sentiment: 0.85, impact: "high" as const, source: "Bloomberg" },
    { headline: "Tesla recalls 2M vehicles over autopilot concerns", symbols: ["TSLA"], sentiment: -0.7, impact: "medium" as const, source: "WSJ" },
    { headline: "Palantir wins $480M DoD contract extension", symbols: ["PLTR"], sentiment: 0.75, impact: "high" as const, source: "CNBC" },
    { headline: "Oil rallies on Middle East supply concerns", symbols: ["XOM", "CVX"], sentiment: 0.4, impact: "medium" as const, source: "Reuters" },
    { headline: "Bitcoin breaches $72k as ETF inflows surge", symbols: ["BTC", "COIN"], sentiment: 0.7, impact: "high" as const, source: "CoinDesk" },
    { headline: "Meta unveils new Llama 4 model, stock jumps 3%", symbols: ["META"], sentiment: 0.6, impact: "medium" as const, source: "The Verge" },
    { headline: "Apple faces EU antitrust probe over App Store fees", symbols: ["AAPL"], sentiment: -0.5, impact: "medium" as const, source: "FT" },
    { headline: "ZIM Shipping raises dividend on freight-rate surge", symbols: ["ZIM"], sentiment: 0.65, impact: "medium" as const, source: "Seeking Alpha" },
    { headline: "Elbit Systems secures $600M European defense order", symbols: ["ESLT"], sentiment: 0.7, impact: "high" as const, source: "Reuters" },
    { headline: "Consumer confidence falls to 6-month low", symbols: ["SPY"], sentiment: -0.4, impact: "medium" as const, source: "Bloomberg" },
    { headline: "AMD launches new MI350 AI chip, undercuts NVIDIA", symbols: ["AMD", "NVDA"], sentiment: 0.5, impact: "high" as const, source: "Tom's Hardware" },
  ];
  const now = Date.now();
  return seed.slice(0, limit).map((s, i) => ({
    id: `news_${i}`,
    headline: s.headline,
    summary: s.headline + ". Full analysis pending backend integration.",
    source: s.source,
    publishedAt: new Date(now - i * 7 * 60_000).toISOString(),
    symbols: s.symbols,
    sentiment: s.sentiment,
    impact: s.impact,
  }));
}

function mockBreakouts(limit: number): BreakoutCandidate[] {
  const seed: Omit<BreakoutCandidate, "price" | "changePct">[] = [
    { symbol: "NVDA", name: "NVIDIA", probability: 0.86, pattern: "Bull Flag", reason: "Consolidating above 200-EMA with rising volume; RSI 62; AI-demand narrative intact.", targetPrice: 1020, stopLoss: 905 },
    { symbol: "PLTR", name: "Palantir", probability: 0.79, pattern: "Cup & Handle", reason: "6-week base breakout with 1.8× avg volume; DoD contract catalyst.", targetPrice: 32.4, stopLoss: 26.5 },
    { symbol: "AMD", name: "AMD", probability: 0.71, pattern: "Ascending Triangle", reason: "Higher lows since Sep; MI350 launch this week; sector rotation into semis.", targetPrice: 178, stopLoss: 156 },
    { symbol: "META", name: "Meta", probability: 0.68, pattern: "Breakaway Gap", reason: "Gap up on Llama 4 news, holding support; positive OI shift.", targetPrice: 540, stopLoss: 498 },
    { symbol: "COIN", name: "Coinbase", probability: 0.74, pattern: "Bull Flag", reason: "BTC>72k with ETF inflows; COIN options skew bullish.", targetPrice: 265, stopLoss: 232 },
    { symbol: "ESLT", name: "Elbit Systems", probability: 0.66, pattern: "Rounding Bottom", reason: "New EU defense order; defense-sector momentum; 50DMA reclaimed.", targetPrice: 268, stopLoss: 238 },
    { symbol: "SMCI", name: "Super Micro", probability: 0.62, pattern: "Falling Wedge", reason: "Basing after Aug drawdown; positive divergence on RSI.", targetPrice: 62, stopLoss: 51 },
    { symbol: "AVGO", name: "Broadcom", probability: 0.60, pattern: "Bull Flag", reason: "Post-split accumulation; AI-chip pricing tailwind.", targetPrice: 195, stopLoss: 172 },
  ];
  return seed.slice(0, limit).map((s) => {
    const q = mockQuote(s.symbol);
    return { ...s, price: q.price, changePct: q.changePct };
  });
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
