/**
 * Symbol search — searches a curated universe of common US tickers +
 * major crypto by ticker, company name, and common aliases. If the
 * Alpaca backend is reachable, augments with live `/api/alpaca/assets/search`
 * results (best-effort; ignored on failure).
 */
import { getApiBase } from "./apiConfig";

export interface TickerSearchHit {
  symbol: string;
  name: string;
  exchange?: string;
  type?: "stock" | "etf" | "crypto";
  aliases?: string[];
}

const UNIVERSE: TickerSearchHit[] = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "stock", aliases: ["apple"] },
  { symbol: "MSFT", name: "Microsoft Corporation", exchange: "NASDAQ", type: "stock", aliases: ["microsoft"] },
  { symbol: "NVDA", name: "NVIDIA Corporation", exchange: "NASDAQ", type: "stock", aliases: ["nvidia"] },
  { symbol: "GOOGL", name: "Alphabet Inc. Class A", exchange: "NASDAQ", type: "stock", aliases: ["google", "alphabet"] },
  { symbol: "GOOG", name: "Alphabet Inc. Class C", exchange: "NASDAQ", type: "stock", aliases: ["google"] },
  { symbol: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", type: "stock", aliases: ["amazon"] },
  { symbol: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", type: "stock", aliases: ["facebook", "meta"] },
  { symbol: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", type: "stock", aliases: ["tesla"] },
  { symbol: "AMD", name: "Advanced Micro Devices", exchange: "NASDAQ", type: "stock", aliases: ["amd"] },
  { symbol: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ", type: "stock", aliases: ["netflix"] },
  { symbol: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ", type: "stock", aliases: ["broadcom"] },
  { symbol: "ORCL", name: "Oracle Corporation", exchange: "NYSE", type: "stock", aliases: ["oracle"] },
  { symbol: "CRM", name: "Salesforce Inc.", exchange: "NYSE", type: "stock", aliases: ["salesforce"] },
  { symbol: "PLTR", name: "Palantir Technologies", exchange: "NYSE", type: "stock", aliases: ["palantir"] },
  { symbol: "SNOW", name: "Snowflake Inc.", exchange: "NYSE", type: "stock", aliases: ["snowflake"] },
  { symbol: "COIN", name: "Coinbase Global", exchange: "NASDAQ", type: "stock", aliases: ["coinbase"] },
  { symbol: "SHOP", name: "Shopify Inc.", exchange: "NYSE", type: "stock", aliases: ["shopify"] },
  { symbol: "UBER", name: "Uber Technologies", exchange: "NYSE", type: "stock", aliases: ["uber"] },
  { symbol: "DIS", name: "Walt Disney Company", exchange: "NYSE", type: "stock", aliases: ["disney"] },
  { symbol: "JPM", name: "JPMorgan Chase", exchange: "NYSE", type: "stock", aliases: ["jpmorgan"] },
  { symbol: "V", name: "Visa Inc.", exchange: "NYSE", type: "stock", aliases: ["visa"] },
  { symbol: "MA", name: "Mastercard Inc.", exchange: "NYSE", type: "stock", aliases: ["mastercard"] },
  { symbol: "BAC", name: "Bank of America", exchange: "NYSE", type: "stock", aliases: ["bofa"] },
  { symbol: "WMT", name: "Walmart Inc.", exchange: "NYSE", type: "stock", aliases: ["walmart"] },
  { symbol: "COST", name: "Costco Wholesale", exchange: "NASDAQ", type: "stock", aliases: ["costco"] },
  { symbol: "XOM", name: "Exxon Mobil Corporation", exchange: "NYSE", type: "stock", aliases: ["exxon"] },
  { symbol: "CVX", name: "Chevron Corporation", exchange: "NYSE", type: "stock", aliases: ["chevron"] },
  { symbol: "ZIM", name: "ZIM Integrated Shipping", exchange: "NYSE", type: "stock", aliases: ["zim"] },
  { symbol: "ESLT", name: "Elbit Systems", exchange: "NASDAQ", type: "stock", aliases: ["elbit"] },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSE", type: "etf", aliases: ["s&p", "sp500"] },
  { symbol: "QQQ", name: "Invesco QQQ Trust", exchange: "NASDAQ", type: "etf", aliases: ["nasdaq"] },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", exchange: "NYSE", type: "etf", aliases: ["russell"] },
  { symbol: "DIA", name: "SPDR Dow Jones ETF", exchange: "NYSE", type: "etf", aliases: ["dow"] },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", exchange: "NYSE", type: "etf", aliases: ["vanguard"] },
  { symbol: "ARKK", name: "ARK Innovation ETF", exchange: "NYSE", type: "etf", aliases: ["ark"] },
  { symbol: "XLK", name: "Technology Select SPDR", exchange: "NYSE", type: "etf" },
  { symbol: "XLF", name: "Financial Select SPDR", exchange: "NYSE", type: "etf" },
  { symbol: "XLE", name: "Energy Select SPDR", exchange: "NYSE", type: "etf" },
  { symbol: "GLD", name: "SPDR Gold Trust", exchange: "NYSE", type: "etf", aliases: ["gold"] },
  { symbol: "SLV", name: "iShares Silver Trust", exchange: "NYSE", type: "etf", aliases: ["silver"] },
  { symbol: "TLT", name: "iShares 20+ Year Treasury", exchange: "NASDAQ", type: "etf" },
  { symbol: "USO", name: "United States Oil Fund", exchange: "NYSE", type: "etf", aliases: ["oil"] },
  { symbol: "BTC", name: "Bitcoin", type: "crypto", aliases: ["bitcoin", "btcusd"] },
  { symbol: "ETH", name: "Ethereum", type: "crypto", aliases: ["ethereum", "ethusd"] },
  { symbol: "SOL", name: "Solana", type: "crypto", aliases: ["solana"] },
  { symbol: "XRP", name: "Ripple", type: "crypto", aliases: ["ripple"] },
  { symbol: "DOGE", name: "Dogecoin", type: "crypto", aliases: ["doge"] },
];

function scoreHit(q: string, hit: TickerSearchHit): number {
  const s = q.toLowerCase();
  const sym = hit.symbol.toLowerCase();
  const name = hit.name.toLowerCase();
  if (sym === s) return 100;
  if (sym.startsWith(s)) return 80;
  if (name.startsWith(s)) return 60;
  if ((hit.aliases ?? []).some((a) => a.startsWith(s))) return 55;
  if (name.includes(s)) return 40;
  if (sym.includes(s)) return 30;
  if ((hit.aliases ?? []).some((a) => a.includes(s))) return 20;
  return 0;
}

/** Search local universe first; caller may await liveExtras() if needed. */
export function searchTickersLocal(query: string, limit = 8): TickerSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  return UNIVERSE.map((h) => ({ hit: h, score: scoreHit(q, h) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.hit);
}

/** Optional live augmentation via Python backend. */
export async function searchTickersLive(query: string, limit = 8): Promise<TickerSearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const r = await fetch(
      `${getApiBase()}/api/alpaca/assets/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      { signal: AbortSignal.timeout(2500) },
    );
    if (!r.ok) return [];
    const list = (await r.json()) as TickerSearchHit[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Merged local + live search, deduped by symbol. */
export async function searchTickers(query: string, limit = 10): Promise<TickerSearchHit[]> {
  const local = searchTickersLocal(query, limit);
  const live = await searchTickersLive(query, limit);
  const seen = new Set<string>();
  const merged: TickerSearchHit[] = [];
  for (const h of [...local, ...live]) {
    if (seen.has(h.symbol)) continue;
    seen.add(h.symbol);
    merged.push(h);
    if (merged.length >= limit) break;
  }
  return merged;
}
