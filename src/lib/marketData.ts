/**
 * marketData.ts — Mock market data for both crypto and stocks.
 * Designed to be swapped with real adapters (Binance, CoinGecko, Yahoo, Alpha Vantage)
 * via a single `MarketAdapter` interface in the future.
 */

export type AssetClass = "crypto" | "stock";
export type Direction = "up" | "down" | "flat";

export interface Quote {
  symbol: string;
  name: string;
  klass: AssetClass;
  price: number;
  change24h: number; // percent
  volume: number;
  marketCap?: number;
  dir: Direction;
}

export interface Whale {
  ts: string;
  asset: string;
  side: "buy" | "sell" | "transfer";
  amountUsd: number;
  from: string;
  to: string;
}

export interface Signal {
  ts: string;
  symbol: string;
  klass: AssetClass;
  action: "BUY" | "SELL" | "HOLD";
  strategy: string;
  confidence: number;
  price: number;
}

const CRYPTO: Quote[] = [
  { symbol: "BTC", name: "Bitcoin", klass: "crypto", price: 71240, change24h: 2.4, volume: 38_000_000_000, marketCap: 1_400_000_000_000, dir: "up" },
  { symbol: "ETH", name: "Ethereum", klass: "crypto", price: 3812, change24h: 1.8, volume: 14_000_000_000, marketCap: 458_000_000_000, dir: "up" },
  { symbol: "SOL", name: "Solana", klass: "crypto", price: 168.22, change24h: 4.1, volume: 3_400_000_000, marketCap: 78_000_000_000, dir: "up" },
  { symbol: "BNB", name: "BNB", klass: "crypto", price: 612.4, change24h: -0.6, volume: 1_200_000_000, marketCap: 90_000_000_000, dir: "down" },
  { symbol: "XRP", name: "XRP", klass: "crypto", price: 0.612, change24h: -1.2, volume: 1_800_000_000, marketCap: 33_000_000_000, dir: "down" },
];

const STOCKS: Quote[] = [
  { symbol: "NVDA", name: "NVIDIA", klass: "stock", price: 945.32, change24h: 3.2, volume: 42_000_000, marketCap: 2_330_000_000_000, dir: "up" },
  { symbol: "AAPL", name: "Apple", klass: "stock", price: 226.45, change24h: 0.4, volume: 38_000_000, marketCap: 3_440_000_000_000, dir: "up" },
  { symbol: "TSLA", name: "Tesla", klass: "stock", price: 178.9, change24h: -2.1, volume: 78_000_000, marketCap: 568_000_000_000, dir: "down" },
  { symbol: "MSFT", name: "Microsoft", klass: "stock", price: 421.7, change24h: 1.1, volume: 22_000_000, marketCap: 3_130_000_000_000, dir: "up" },
  { symbol: "META", name: "Meta", klass: "stock", price: 512.4, change24h: 0.9, volume: 16_000_000, marketCap: 1_310_000_000_000, dir: "up" },
];

function jitter<T extends Quote>(q: T): T {
  const drift = (Math.random() - 0.5) * 0.004;
  const price = +(q.price * (1 + drift)).toFixed(q.price < 10 ? 4 : 2);
  const change = +(q.change24h + drift * 100).toFixed(2);
  return { ...q, price, change24h: change, dir: change >= 0 ? "up" : "down" };
}

export function getQuotes(klass?: AssetClass): Quote[] {
  const all = [...CRYPTO, ...STOCKS].map(jitter);
  return klass ? all.filter((q) => q.klass === klass) : all;
}

export function getWhales(): Whale[] {
  const now = Date.now();
  return [
    { ts: new Date(now - 60_000).toISOString(), asset: "BTC", side: "buy", amountUsd: 24_500_000, from: "bc1q…f7a2", to: "Coinbase Prime" },
    { ts: new Date(now - 180_000).toISOString(), asset: "ETH", side: "transfer", amountUsd: 12_300_000, from: "0x4a…b91", to: "0x8c…23d" },
    { ts: new Date(now - 320_000).toISOString(), asset: "SOL", side: "sell", amountUsd: 8_200_000, from: "Binance", to: "Hot wallet" },
    { ts: new Date(now - 540_000).toISOString(), asset: "BTC", side: "buy", amountUsd: 6_800_000, from: "Kraken", to: "Cold wallet" },
    { ts: new Date(now - 720_000).toISOString(), asset: "ETH", side: "sell", amountUsd: 5_400_000, from: "0x33…a4c", to: "Binance" },
  ];
}

export function getSignals(): Signal[] {
  const now = Date.now();
  return [
    { ts: new Date(now - 30_000).toISOString(), symbol: "NVDA", klass: "stock", action: "BUY", strategy: "Momentum · 5m breakout", confidence: 87, price: 945.32 },
    { ts: new Date(now - 90_000).toISOString(), symbol: "BTC", klass: "crypto", action: "BUY", strategy: "Ensemble vote · 4/5", confidence: 91, price: 71240 },
    { ts: new Date(now - 220_000).toISOString(), symbol: "TSLA", klass: "stock", action: "SELL", strategy: "Mean reversion · RSI", confidence: 74, price: 178.9 },
    { ts: new Date(now - 410_000).toISOString(), symbol: "SOL", klass: "crypto", action: "BUY", strategy: "Sentiment surge", confidence: 81, price: 168.22 },
    { ts: new Date(now - 600_000).toISOString(), symbol: "AAPL", klass: "stock", action: "HOLD", strategy: "Low conviction", confidence: 52, price: 226.45 },
  ];
}

export interface SentimentScore {
  asset: string;
  score: number; // -100 to 100
  sources: number;
}

export function getSentiment(): SentimentScore[] {
  return [
    { asset: "BTC", score: 64, sources: 412 },
    { asset: "NVDA", score: 78, sources: 318 },
    { asset: "ETH", score: 41, sources: 287 },
    { asset: "TSLA", score: -22, sources: 521 },
    { asset: "SOL", score: 55, sources: 198 },
    { asset: "AAPL", score: 12, sources: 244 },
  ];
}
