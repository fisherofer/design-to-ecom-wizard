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

export type CapBucket = "mega" | "large" | "mid" | "small" | "micro";

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
  /** Market capitalisation in USD. */
  marketCap?: number;
  capBucket?: CapBucket;
  /** Detected candlestick pattern (last 1-3 bars). */
  candlePattern?: string;
  /** Money Flow Index 0..100 (>80 overbought / <20 oversold). */
  moneyFlowIndex?: number;
  /** Direction of smart money over last N sessions. */
  netMoneyFlow?: "in" | "out" | "mixed";
  /** Current volume as multiple of 20-day average. */
  volumeSurge?: number;
  /** AI-projected % move over the next 5–10 sessions if pattern completes. */
  expectedMovePct?: number;
  /** Short human catalyst tag (news / earnings / squeeze / etc). */
  catalyst?: string;
  /** Reward-to-risk ratio = expectedMove / distance-to-stop, weighted by probability. */
  rewardToRisk?: number;
  /** Composite AI opportunity score 0..100 (higher = better risk-adjusted upside). */
  opportunityScore?: number;
  /** Exchange the ticker trades on. */
  exchange?: "NYSE" | "NASDAQ" | "AMEX";
  /** Sector tag for filtering. */
  sector?: string;
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
  type Seed = Omit<BreakoutCandidate, "price" | "changePct">;
  const seed: Seed[] = [
    // Mega / Large caps
    { symbol: "NVDA", name: "NVIDIA", probability: 0.86, pattern: "Bull Flag", reason: "Consolidating above 200-EMA with rising volume; RSI 62; AI-demand narrative intact.", targetPrice: 1020, stopLoss: 905, marketCap: 2.3e12, capBucket: "mega", candlePattern: "Bullish Engulfing", moneyFlowIndex: 71, netMoneyFlow: "in", volumeSurge: 1.9, expectedMovePct: 8.4, catalyst: "AI capex cycle" },
    { symbol: "META", name: "Meta", probability: 0.68, pattern: "Breakaway Gap", reason: "Gap up on Llama 4 news, holding support; positive OI shift.", targetPrice: 540, stopLoss: 498, marketCap: 1.3e12, capBucket: "mega", candlePattern: "Morning Star", moneyFlowIndex: 63, netMoneyFlow: "in", volumeSurge: 1.4, expectedMovePct: 5.6, catalyst: "Llama 4 launch" },
    { symbol: "AMD", name: "AMD", probability: 0.71, pattern: "Ascending Triangle", reason: "Higher lows since Sep; MI350 launch this week; sector rotation into semis.", targetPrice: 178, stopLoss: 156, marketCap: 2.6e11, capBucket: "large", candlePattern: "Three White Soldiers", moneyFlowIndex: 68, netMoneyFlow: "in", volumeSurge: 1.7, expectedMovePct: 9.2, catalyst: "MI350 launch" },
    { symbol: "PLTR", name: "Palantir", probability: 0.79, pattern: "Cup & Handle", reason: "6-week base breakout with 1.8× avg volume; DoD contract catalyst.", targetPrice: 32.4, stopLoss: 26.5, marketCap: 5.8e10, capBucket: "large", candlePattern: "Bullish Marubozu", moneyFlowIndex: 74, netMoneyFlow: "in", volumeSurge: 1.8, expectedMovePct: 12.1, catalyst: "$480M DoD extension" },
    { symbol: "COIN", name: "Coinbase", probability: 0.74, pattern: "Bull Flag", reason: "BTC>72k with ETF inflows; COIN options skew bullish.", targetPrice: 265, stopLoss: 232, marketCap: 5.5e10, capBucket: "large", candlePattern: "Piercing Line", moneyFlowIndex: 66, netMoneyFlow: "in", volumeSurge: 1.5, expectedMovePct: 10.4, catalyst: "BTC ETF inflows", exchange: "NASDAQ", sector: "Financials" },
    { symbol: "MSFT", name: "Microsoft", probability: 0.64, pattern: "Bull Flag", reason: "Azure AI backlog re-acceleration; 21-EMA reclaim.", targetPrice: 445, stopLoss: 410, marketCap: 3.1e12, capBucket: "mega", candlePattern: "Bullish Engulfing", moneyFlowIndex: 62, netMoneyFlow: "in", volumeSurge: 1.2, expectedMovePct: 5.4, catalyst: "Azure AI", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "GOOGL", name: "Alphabet", probability: 0.63, pattern: "Ascending Triangle", reason: "Gemini adoption + antitrust overhang priced in.", targetPrice: 195, stopLoss: 168, marketCap: 2.1e12, capBucket: "mega", candlePattern: "Three White Soldiers", moneyFlowIndex: 60, netMoneyFlow: "in", volumeSurge: 1.3, expectedMovePct: 7.0, catalyst: "Gemini uptake", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "TSLA", name: "Tesla", probability: 0.58, pattern: "Falling Wedge", reason: "FSD v13 catalyst; bearish sentiment extreme.", targetPrice: 205, stopLoss: 168, marketCap: 5.6e11, capBucket: "mega", candlePattern: "Hammer", moneyFlowIndex: 47, netMoneyFlow: "mixed", volumeSurge: 1.6, expectedMovePct: 12.3, catalyst: "FSD v13", exchange: "NASDAQ", sector: "Auto/EV" },
    // Mid caps
    { symbol: "ESLT", name: "Elbit Systems", probability: 0.66, pattern: "Rounding Bottom", reason: "New EU defense order; defense-sector momentum; 50DMA reclaimed.", targetPrice: 268, stopLoss: 238, marketCap: 1.1e10, capBucket: "mid", candlePattern: "Hammer", moneyFlowIndex: 59, netMoneyFlow: "in", volumeSurge: 1.3, expectedMovePct: 7.4, catalyst: "$600M EU order", exchange: "NASDAQ", sector: "Defense" },
    { symbol: "SMCI", name: "Super Micro", probability: 0.62, pattern: "Falling Wedge", reason: "Basing after Aug drawdown; positive divergence on RSI.", targetPrice: 62, stopLoss: 51, marketCap: 3.2e10, capBucket: "mid", candlePattern: "Bullish Harami", moneyFlowIndex: 44, netMoneyFlow: "mixed", volumeSurge: 1.1, expectedMovePct: 14.8, catalyst: "AI-rack rebound", exchange: "NASDAQ", sector: "Technology" },
    { symbol: "AVGO", name: "Broadcom", probability: 0.60, pattern: "Bull Flag", reason: "Post-split accumulation; AI-chip pricing tailwind.", targetPrice: 195, stopLoss: 172, marketCap: 7.8e11, capBucket: "mega", candlePattern: "Doji + follow-through", moneyFlowIndex: 61, netMoneyFlow: "in", volumeSurge: 1.2, expectedMovePct: 6.1, catalyst: "AI-chip pricing", exchange: "NASDAQ", sector: "Semiconductors" },
    { symbol: "MRVL", name: "Marvell", probability: 0.65, pattern: "Cup & Handle", reason: "Custom-silicon ramp with Amazon; guide raise likely.", targetPrice: 92, stopLoss: 74, marketCap: 6.8e10, capBucket: "mid", candlePattern: "Bullish Engulfing", moneyFlowIndex: 67, netMoneyFlow: "in", volumeSurge: 1.7, expectedMovePct: 13.4, catalyst: "AWS custom silicon", exchange: "NASDAQ", sector: "Semiconductors" },
    { symbol: "CRWD", name: "CrowdStrike", probability: 0.61, pattern: "Rounding Bottom", reason: "Recovery from July outage; renewal cohort stable.", targetPrice: 340, stopLoss: 285, marketCap: 7.9e10, capBucket: "mid", candlePattern: "Morning Star", moneyFlowIndex: 58, netMoneyFlow: "in", volumeSurge: 1.4, expectedMovePct: 10.6, catalyst: "Renewal cycle", exchange: "NASDAQ", sector: "Cybersecurity" },
    { symbol: "SNOW", name: "Snowflake", probability: 0.56, pattern: "Falling Wedge", reason: "AI-workload attach improving; oversold on weekly RSI.", targetPrice: 158, stopLoss: 128, marketCap: 4.7e10, capBucket: "mid", candlePattern: "Piercing Line", moneyFlowIndex: 45, netMoneyFlow: "mixed", volumeSurge: 1.2, expectedMovePct: 15.2, catalyst: "AI workloads", exchange: "NYSE", sector: "Technology" },
    // Small caps — high upside
    { symbol: "IONQ", name: "IonQ Quantum", probability: 0.72, pattern: "Cup & Handle", reason: "Institutional accumulation via 13F; MFI trending up; low float squeeze potential.", targetPrice: 18.5, stopLoss: 12.4, marketCap: 3.2e9, capBucket: "small", candlePattern: "Bullish Engulfing", moneyFlowIndex: 78, netMoneyFlow: "in", volumeSurge: 2.6, expectedMovePct: 24.5, catalyst: "Quantum contract rumor", exchange: "NYSE", sector: "Quantum" },
    { symbol: "RKLB", name: "Rocket Lab", probability: 0.69, pattern: "Ascending Triangle", reason: "Neutron-rocket milestone approaching; short interest 12%.", targetPrice: 9.8, stopLoss: 6.9, marketCap: 3.9e9, capBucket: "small", candlePattern: "Three White Soldiers", moneyFlowIndex: 72, netMoneyFlow: "in", volumeSurge: 2.2, expectedMovePct: 19.6, catalyst: "Neutron launch", exchange: "NASDAQ", sector: "Aerospace" },
    { symbol: "SOUN", name: "SoundHound AI", probability: 0.65, pattern: "Bull Flag", reason: "NVDA stake + auto voice-AI deal chatter; MFI 68.", targetPrice: 8.4, stopLoss: 5.2, marketCap: 1.7e9, capBucket: "small", candlePattern: "Piercing Line", moneyFlowIndex: 68, netMoneyFlow: "in", volumeSurge: 2.9, expectedMovePct: 27.1, catalyst: "NVDA equity stake", exchange: "NASDAQ", sector: "AI Software" },
    { symbol: "BBAI", name: "BigBear.ai", probability: 0.61, pattern: "Falling Wedge", reason: "Basing on rising volume; potential DoD RFP win.", targetPrice: 3.6, stopLoss: 1.9, marketCap: 4.8e8, capBucket: "small", candlePattern: "Hammer", moneyFlowIndex: 55, netMoneyFlow: "mixed", volumeSurge: 3.4, expectedMovePct: 42.2, catalyst: "DoD RFP", exchange: "NYSE", sector: "AI Software" },
    { symbol: "TMDX", name: "TransMedics", probability: 0.64, pattern: "Cup & Handle", reason: "Organ-transport network expansion; margin inflection.", targetPrice: 105, stopLoss: 72, marketCap: 3.1e9, capBucket: "small", candlePattern: "Bullish Marubozu", moneyFlowIndex: 70, netMoneyFlow: "in", volumeSurge: 2.1, expectedMovePct: 22.8, catalyst: "Volume ramp", exchange: "NASDAQ", sector: "Healthcare" },
    { symbol: "APLD", name: "Applied Digital", probability: 0.63, pattern: "Bull Flag", reason: "HPC hosting contract; hyperscaler AI overflow demand.", targetPrice: 12.5, stopLoss: 7.4, marketCap: 1.4e9, capBucket: "small", candlePattern: "Three White Soldiers", moneyFlowIndex: 71, netMoneyFlow: "in", volumeSurge: 3.0, expectedMovePct: 31.4, catalyst: "HPC hosting deal", exchange: "NASDAQ", sector: "AI Infra" },
    { symbol: "SERV", name: "Serve Robotics", probability: 0.58, pattern: "Ascending Triangle", reason: "Uber-backed sidewalk-bot rollout expanding.", targetPrice: 14, stopLoss: 7.8, marketCap: 5.2e8, capBucket: "small", candlePattern: "Bullish Harami", moneyFlowIndex: 60, netMoneyFlow: "in", volumeSurge: 2.8, expectedMovePct: 36.5, catalyst: "City rollout", exchange: "NASDAQ", sector: "Robotics" },
    // Micro caps — asymmetric upside
    { symbol: "MARA", name: "Marathon Digital", probability: 0.58, pattern: "Bull Pennant", reason: "BTC follow-through + hashrate expansion; short squeeze risk.", targetPrice: 26.5, stopLoss: 17.2, marketCap: 6.9e9, capBucket: "small", candlePattern: "Bullish Marubozu", moneyFlowIndex: 76, netMoneyFlow: "in", volumeSurge: 2.4, expectedMovePct: 22.4, catalyst: "BTC breakout", exchange: "NASDAQ", sector: "Crypto" },
    { symbol: "LUNR", name: "Intuitive Machines", probability: 0.63, pattern: "Cup & Handle", reason: "NASA lunar contract expansion; low float; MFI trending up.", targetPrice: 12.4, stopLoss: 6.8, marketCap: 8.4e8, capBucket: "micro", candlePattern: "Morning Star", moneyFlowIndex: 74, netMoneyFlow: "in", volumeSurge: 3.1, expectedMovePct: 38.9, catalyst: "NASA CLPS award", exchange: "NASDAQ", sector: "Aerospace" },
    { symbol: "EVGO", name: "EVgo", probability: 0.54, pattern: "Rounding Bottom", reason: "EV-charging capex bill tailwind; oversold bounce.", targetPrice: 5.6, stopLoss: 2.9, marketCap: 6.1e8, capBucket: "micro", candlePattern: "Bullish Harami", moneyFlowIndex: 48, netMoneyFlow: "mixed", volumeSurge: 2.0, expectedMovePct: 46.3, catalyst: "DOE grant", exchange: "NASDAQ", sector: "EV Infra" },
    { symbol: "OPEN", name: "Opendoor", probability: 0.51, pattern: "Falling Wedge", reason: "Housing-rate relief trade; 22% short interest; MFI turning.", targetPrice: 3.2, stopLoss: 1.7, marketCap: 1.5e9, capBucket: "small", candlePattern: "Hammer", moneyFlowIndex: 41, netMoneyFlow: "mixed", volumeSurge: 2.7, expectedMovePct: 33.8, catalyst: "Fed pivot", exchange: "NASDAQ", sector: "Real Estate" },
    { symbol: "GRAB", name: "Grab Holdings", probability: 0.57, pattern: "Ascending Triangle", reason: "SEA super-app profitability inflection; MFI 62.", targetPrice: 4.9, stopLoss: 3.1, marketCap: 1.6e10, capBucket: "mid", candlePattern: "Three White Soldiers", moneyFlowIndex: 62, netMoneyFlow: "in", volumeSurge: 1.6, expectedMovePct: 17.2, catalyst: "Profit inflection", exchange: "NASDAQ", sector: "Fintech" },
    { symbol: "NNE", name: "Nano Nuclear", probability: 0.60, pattern: "Bull Flag", reason: "SMR nuclear thematic; DoE micro-reactor grant chatter.", targetPrice: 42, stopLoss: 22, marketCap: 9.6e8, capBucket: "micro", candlePattern: "Bullish Engulfing", moneyFlowIndex: 69, netMoneyFlow: "in", volumeSurge: 3.5, expectedMovePct: 52.1, catalyst: "SMR grant", exchange: "NASDAQ", sector: "Nuclear" },
    { symbol: "ACHR", name: "Archer Aviation", probability: 0.59, pattern: "Cup & Handle", reason: "eVTOL FAA cert path clearing; UAE launch route.", targetPrice: 12.5, stopLoss: 6.4, marketCap: 3.4e9, capBucket: "small", candlePattern: "Piercing Line", moneyFlowIndex: 66, netMoneyFlow: "in", volumeSurge: 2.6, expectedMovePct: 29.7, catalyst: "FAA cert", exchange: "NYSE", sector: "eVTOL" },
    { symbol: "DNA", name: "Ginkgo Bioworks", probability: 0.50, pattern: "Falling Wedge", reason: "Biofoundry cost cuts working; oversold reversal setup.", targetPrice: 0.98, stopLoss: 0.42, marketCap: 5.5e8, capBucket: "micro", candlePattern: "Hammer", moneyFlowIndex: 39, netMoneyFlow: "mixed", volumeSurge: 2.9, expectedMovePct: 58.4, catalyst: "Cost restructure", exchange: "NYSE", sector: "Biotech" },
    { symbol: "SIRI", name: "Sirius XM", probability: 0.52, pattern: "Rounding Bottom", reason: "Post-split re-rating; Berkshire accumulation continues.", targetPrice: 32, stopLoss: 22, marketCap: 8.2e9, capBucket: "small", candlePattern: "Morning Star", moneyFlowIndex: 53, netMoneyFlow: "in", volumeSurge: 1.5, expectedMovePct: 18.2, catalyst: "Berkshire buy", exchange: "NASDAQ", sector: "Media" },
    { symbol: "CVNA", name: "Carvana", probability: 0.55, pattern: "Bull Flag", reason: "Turnaround intact; used-car margins expanding.", targetPrice: 285, stopLoss: 220, marketCap: 3.3e10, capBucket: "mid", candlePattern: "Bullish Engulfing", moneyFlowIndex: 63, netMoneyFlow: "in", volumeSurge: 1.8, expectedMovePct: 14.5, catalyst: "Margin expansion", exchange: "NYSE", sector: "Auto Retail" },
    { symbol: "HIMS", name: "Hims & Hers", probability: 0.62, pattern: "Ascending Triangle", reason: "GLP-1 compound rollout; subscriber growth accelerating.", targetPrice: 32, stopLoss: 20, marketCap: 5.8e9, capBucket: "small", candlePattern: "Three White Soldiers", moneyFlowIndex: 71, netMoneyFlow: "in", volumeSurge: 2.3, expectedMovePct: 24.6, catalyst: "GLP-1 launch", exchange: "NYSE", sector: "Healthcare" },
  ];
  const enriched = seed.map((s) => {
    const q = mockQuote(s.symbol);
    const price = q.price;
    const riskPct = s.stopLoss != null ? Math.max(0.5, ((price - s.stopLoss) / price) * 100) : 5;
    const rewardPct = s.expectedMovePct ?? (s.targetPrice != null ? ((s.targetPrice - price) / price) * 100 : 5);
    const rewardToRisk = +(rewardPct / riskPct).toFixed(2);
    // Opportunity score = probability × (reward/risk) × volume-confirmation × money-flow
    const volBoost = Math.min(1.5, s.volumeSurge ?? 1);
    const mfiBoost = (s.moneyFlowIndex ?? 50) / 50;
    const opportunityScore = Math.max(0, Math.min(100,
      Math.round(s.probability * rewardToRisk * 12 * volBoost * mfiBoost)
    ));
    return { ...s, price, changePct: q.changePct, rewardToRisk, opportunityScore };
  });
  // Rank by opportunity score (highest reward-adjusted-for-risk first)
  enriched.sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));
  return enriched.slice(0, limit);
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
