/**
 * Ticker logo + color helpers.
 * Uses Parqet's public logo CDN (no key). Falls back to a colored initial avatar.
 * A curated color map ensures the badge contrasts the app background.
 */

const CRYPTO = new Set(["BTC", "ETH", "SOL", "ADA", "XRP", "DOGE", "AVAX", "DOT", "MATIC", "LINK"]);

export function logoUrl(symbol: string): string {
  const s = symbol.toUpperCase();
  if (CRYPTO.has(s)) {
    return `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`;
  }
  return `https://assets.parqet.com/logos/symbol/${s}`;
}

/** Deterministic accent color per symbol, tuned to read on the dark surface. */
export function tickerColor(symbol: string): string {
  const palette = [
    "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa",
    "#f87171", "#22d3ee", "#fb923c", "#4ade80", "#c084fc",
  ];
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

export function initials(symbol: string): string {
  return symbol.slice(0, symbol.length <= 3 ? symbol.length : 2).toUpperCase();
}
