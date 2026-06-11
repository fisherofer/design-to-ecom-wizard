/**
 * Tracked assets & dividend mock data — OferTradingBot PRD
 */

export type TrackedTicker = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  sentiment: "Bullish" | "Bearish" | "Neutral";
  aiScore: number;
};

export const TRACKED_TICKERS: TrackedTicker[] = [
  { symbol: "PLTR", name: "Palantir Technologies", price: 28.14, change24h: 2.3, sentiment: "Bullish", aiScore: 82 },
  { symbol: "ZIM", name: "ZIM Integrated Shipping", price: 18.92, change24h: -1.2, sentiment: "Neutral", aiScore: 54 },
  { symbol: "ESLT", name: "Elbit Systems", price: 246.7, change24h: 0.8, sentiment: "Bullish", aiScore: 77 },
  { symbol: "CONY", name: "YieldMax COIN Option ETF", price: 12.45, change24h: 3.1, sentiment: "Bullish", aiScore: 71 },
  { symbol: "MSTY", name: "YieldMax MSTR Option ETF", price: 24.88, change24h: -0.5, sentiment: "Neutral", aiScore: 63 },
];

export type Holding = {
  symbol: string;
  qty: number;
  buyPrice: number;
  currentPrice: number;
};

export const HOLDINGS: Holding[] = [
  { symbol: "PLTR", qty: 120, buyPrice: 22.4, currentPrice: 28.14 },
  { symbol: "ZIM", qty: 250, buyPrice: 14.8, currentPrice: 18.92 },
  { symbol: "ESLT", qty: 15, buyPrice: 210.5, currentPrice: 246.7 },
  { symbol: "CONY", qty: 400, buyPrice: 11.2, currentPrice: 12.45 },
  { symbol: "MSTY", qty: 200, buyPrice: 26.1, currentPrice: 24.88 },
];

export type DividendEvent = {
  symbol: string;
  exDate: string;
  payDate: string;
  amount: number;
  yieldPct: number;
};

export const DIVIDEND_CALENDAR: DividendEvent[] = [
  { symbol: "CONY", exDate: "2026-06-18", payDate: "2026-06-21", amount: 0.92, yieldPct: 78.4 },
  { symbol: "MSTY", exDate: "2026-06-20", payDate: "2026-06-24", amount: 1.84, yieldPct: 92.1 },
  { symbol: "ZIM",  exDate: "2026-07-05", payDate: "2026-07-12", amount: 0.65, yieldPct: 13.7 },
  { symbol: "PLTR", exDate: "2026-07-15", payDate: "2026-07-22", amount: 0.05, yieldPct: 0.7 },
];

export function totalReturn(h: Holding) {
  const cost = h.qty * h.buyPrice;
  const value = h.qty * h.currentPrice;
  return { cost, value, pnl: value - cost, pct: ((value - cost) / cost) * 100 };
}
