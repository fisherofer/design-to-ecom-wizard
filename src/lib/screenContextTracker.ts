/**
 * Screen Context Tracker
 * ======================
 * Detects which tickers/entities the user is currently looking at, so the
 * assistant can answer "what about this one?" without the user retyping.
 *
 * Design rule: NO hardcoded ticker whitelist and no fixed-length regex caps.
 * Symbols are recognised structurally (uppercase tokens, optional exchange or
 * pair suffix) and validated against the live registry the app already owns
 * (watchlist / tracked assets / route params).
 */

export interface ScreenContext {
  /** Symbols detected in the current view, most-relevant first. */
  symbols: string[];
  /** Symbol from the route (e.g. /ticker/AAPL) if present. */
  routeSymbol: string | null;
  /** Current route path. */
  path: string;
  /** Page heading text, when detectable. */
  heading: string | null;
  capturedAt: string;
}

/**
 * Structural symbol pattern:
 *  - equities/ETFs: 1..n uppercase letters, optional `.`/`-` class suffix (BRK.B)
 *  - crypto pairs:  BASE/QUOTE (BTC/USDT, ETH/USD)
 *  - exchange-prefixed: NASDAQ:NVDA
 * No arbitrary length ceiling is imposed.
 */
const SYMBOL_PATTERN = /\b(?:[A-Z]{2,}:)?[A-Z][A-Z0-9]*(?:[.\-][A-Z0-9]+)?(?:\/[A-Z][A-Z0-9]*)?\b/g;

/** Tokens that look like symbols but are UI words — filtered structurally. */
const NON_SYMBOL_TOKENS = new Set([
  "AI",
  "API",
  "UI",
  "OS",
  "PNL",
  "USD",
  "RTL",
  "CSV",
  "JSON",
  "OK",
  "ON",
  "OFF",
  "ALL",
  "NEW",
  "LIVE",
  "BUY",
  "SELL",
]);

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/^[A-Z]+:/, "");
}

/** Extracts candidate symbols from arbitrary text. */
export function extractSymbols(text: string, known?: Iterable<string>): string[] {
  const knownSet = known ? new Set(Array.from(known, normalizeSymbol)) : null;
  const matches = text.match(SYMBOL_PATTERN) ?? [];
  const out: string[] = [];
  for (const match of matches) {
    const symbol = normalizeSymbol(match);
    if (!symbol) continue;
    if (knownSet) {
      if (!knownSet.has(symbol)) continue;
    } else if (NON_SYMBOL_TOKENS.has(symbol) || symbol.length < 2) {
      continue;
    }
    if (!out.includes(symbol)) out.push(symbol);
  }
  return out;
}

function readRouteSymbol(path: string): string | null {
  const match = path.match(/\/ticker\/([^/?#]+)/i);
  return match ? normalizeSymbol(decodeURIComponent(match[1])) : null;
}

/**
 * Captures the current on-screen context.
 *
 * @param knownSymbols Optional live universe (watchlist / tracked assets). When
 *                     provided, only symbols present in it are reported, which
 *                     removes false positives entirely.
 */
export function captureScreenContext(knownSymbols?: Iterable<string>): ScreenContext {
  if (typeof document === "undefined") {
    return { symbols: [], routeSymbol: null, path: "", heading: null, capturedAt: new Date().toISOString() };
  }

  const path = window.location.pathname;
  const routeSymbol = readRouteSymbol(path);

  // Prefer explicitly tagged elements: <element data-symbol="AAPL">
  const tagged = Array.from(document.querySelectorAll<HTMLElement>("[data-symbol]"))
    .map((el) => normalizeSymbol(el.dataset.symbol ?? ""))
    .filter(Boolean);

  const visibleText = document.body?.innerText ?? "";
  const scanned = extractSymbols(visibleText, knownSymbols);

  const symbols: string[] = [];
  for (const symbol of [routeSymbol, ...tagged, ...scanned]) {
    if (symbol && !symbols.includes(symbol)) symbols.push(symbol);
  }

  const heading = document.querySelector("h1")?.textContent?.trim() ?? null;

  return { symbols, routeSymbol, path, heading, capturedAt: new Date().toISOString() };
}

/** Renders the context as a compact prompt preamble for the assistant. */
export function describeScreenContext(context: ScreenContext): string {
  if (!context.symbols.length && !context.heading) return "";
  const parts = [
    context.heading ? `מסך נוכחי: ${context.heading}` : `נתיב נוכחי: ${context.path}`,
    context.symbols.length ? `סימבולים בתצוגה: ${context.symbols.join(", ")}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}
