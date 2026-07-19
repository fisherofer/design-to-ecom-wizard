/**
 * Market data & external source registry — TypeScript mirror of the Python
 * `config.MARKET_DATA_SOURCES` used by the local Goose / QuantEngine backend.
 *
 * IRON RULES (see also: config.py in the local backend)
 *  1. Stage 1 — the only execution endpoint permitted is Alpaca PAPER.
 *     `api.alpaca.markets` (live) is forbidden until explicit Stage 2 promotion.
 *  2. No key literal ever appears here. `keyProvider` is a lookup id, not a value.
 *  3. Every entry declares its own rate-limit note. Read it before polling.
 *  4. `reference` sources are click-through for humans only — never scrape;
 *     use the paired `preferInstead` endpoint.
 *  5. Paths (drives, folders) are NEVER hardcoded. The desktop backend derives
 *     ROOT from `__file__`; this frontend has no filesystem coupling at all.
 */

export type SourceRole =
  | "execution"
  | "market_data"
  | "market_data_and_news"
  | "news"
  | "sentiment_reference"
  | "institutional_holdings_reference"
  | "reference"
  | "llm_fallback_tier2"
  | "llm_fallback_tier3"
  | "youtube_channel_addition";

export interface MarketDataSource {
  name: string;
  url: string;
  role: SourceRole;
  keyProvider: string | null;
  stage1Allowed: boolean;
  rateLimit: string;
  ironRule: string;
  preferInstead?: string;
}

export const MARKET_DATA_SOURCES: MarketDataSource[] = [
  {
    name: "alpaca_paper_execution",
    url: "https://paper-api.alpaca.markets",
    role: "execution",
    keyProvider: "alpaca",
    stage1Allowed: true,
    rateLimit: "200 req/min (Alpaca paper account default)",
    ironRule: "PAPER ONLY. Enforced by assertStage1Safe(), not just documented.",
  },
  {
    name: "alpaca_market_data",
    url: "https://data.alpaca.markets",
    role: "market_data",
    keyProvider: "alpaca",
    stage1Allowed: true,
    rateLimit: "200 req/min (free/IEX feed tier)",
    ironRule: "Read-only quotes/bars. Safe regardless of stage.",
  },
  {
    name: "yahoo_chart_unofficial",
    url: "https://query1.finance.yahoo.com/v8/finance/chart",
    role: "market_data",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "Unofficial/undocumented — no published limit, can break without notice",
    ironRule:
      "Best-effort supplementary source. Already used indirectly via yfinance in the backend — route through yfinance, do not add a second call site.",
  },
  {
    name: "yahoo_quote_page",
    url: "https://finance.yahoo.com/quote/",
    role: "reference",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "n/a — HTML page, not an API",
    preferInstead: "yahoo_chart_unofficial (via yfinance)",
    ironRule: "Human-verification link only. Never scrape this HTML.",
  },
  {
    name: "alphavantage",
    url: "https://www.alphavantage.co/query",
    role: "market_data",
    keyProvider: "alphavantage",
    stage1Allowed: true,
    rateLimit: "Free tier: 25 requests/day, 5/min — budget carefully, do not loop-poll",
    ironRule: "Use only for symbols not already covered by Alpaca; daily quota is tiny.",
  },
  {
    name: "twelvedata",
    url: "https://api.twelvedata.com",
    role: "market_data",
    keyProvider: "twelvedata",
    stage1Allowed: true,
    rateLimit: "Free tier: 8 requests/min, 800/day",
    ironRule: "Fallback only if Alpaca + AlphaVantage both miss a symbol.",
  },
  {
    name: "eodhd",
    url: "https://eodhd.com/api",
    role: "market_data",
    keyProvider: "eodhd",
    stage1Allowed: true,
    rateLimit: "Plan-dependent — verify the paid tier before batch pulls",
    ironRule: "End-of-day historical only. Not for intraday polling.",
  },
  {
    name: "finnhub",
    url: "https://finnhub.io/api/v1",
    role: "market_data_and_news",
    keyProvider: "finnhub",
    stage1Allowed: true,
    rateLimit: "Free tier: 60 requests/min",
    ironRule:
      "Exposes insider-transaction + company-news endpoints — route those through the analyzer catalyst pipeline, not a new ad-hoc parser.",
  },
  {
    name: "newsapi",
    url: "https://newsapi.org/v2/everything",
    role: "news",
    keyProvider: "newsapi",
    stage1Allowed: true,
    rateLimit: "Free/developer tier: 100 req/day, articles delayed ~24h",
    ironRule:
      "24h delay on free tier — never treat as real-time; label brief output accordingly so a stale headline isn't read as breaking news.",
  },
  {
    name: "cnn_fear_greed",
    url: "https://edition.cnn.com/markets/fear-and-greed",
    role: "sentiment_reference",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "No official API — HTML scrape, fragile",
    ironRule:
      "Poll at most once/day, cache the value, treat as directional overlay only — never a standalone catalyst.",
  },
  {
    name: "dataroma",
    url: "https://www.dataroma.com/m/home.php",
    role: "institutional_holdings_reference",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "No official API — HTML scrape, low frequency only",
    ironRule:
      "13F-style superinvestor tracking updates quarterly at the source — polling more than daily gains nothing and risks a block.",
  },
  {
    name: "tradingview_chart",
    url: "https://www.tradingview.com/chart/",
    role: "reference",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "n/a — not an API",
    ironRule:
      "Human chart-review link only, surfaced in the UI as a click-through. Never scraped — TradingView ToS forbids it.",
  },
  {
    name: "groq_llm_fallback",
    url: "https://api.groq.com/openai/v1/chat/completions",
    role: "llm_fallback_tier2",
    keyProvider: "groq",
    stage1Allowed: true,
    rateLimit: "Free tier: model-dependent, low RPM — check console before batch use",
    ironRule:
      "Ollama (local) stays tier-1 per local-first rule. Groq is a speed fallback only, never the default router path.",
  },
  {
    name: "openai_llm_fallback",
    url: "https://api.openai.com/v1/chat/completions",
    role: "llm_fallback_tier3",
    keyProvider: "openai",
    stage1Allowed: true,
    rateLimit: "Plan-dependent, and the most expensive tier here",
    ironRule: "Last-resort fallback only (Ollama → Groq → OpenAI). Never first call.",
  },
  {
    name: "youtube_micha_stocks",
    url: "https://www.youtube.com/@Micha.Stocks",
    role: "youtube_channel_addition",
    keyProvider: null,
    stage1Allowed: true,
    rateLimit: "Bound by YOUTUBE_VIDEOS_PER_CHANNEL in backend config",
    ironRule:
      "Add the channel handle to agents/yt_channels.txt in the backend — do not create a new code path here.",
  },
];

/**
 * Providers referenced by MARKET_DATA_SOURCES. Mirrors KNOWN_PROVIDERS in
 * hub/keys_manager.py. Kept as a derived list so the two stay in sync.
 */
export const KNOWN_PROVIDERS = [
  "claude",
  "gemini",
  "perplexity",
  "openai",
  "alpaca",
  "telegram",
  "groq",
  "alphavantage",
  "finnhub",
  "eodhd",
  "newsapi",
  "twelvedata",
] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/**
 * Stage-1 guard — throws if any execution endpoint points at live trading.
 * Call once at app boot (see main.tsx). Mirrors assert_stage1_safe() in
 * the Python backend; violation is a hard failure, not a warning.
 */
export function assertStage1Safe(): void {
  for (const src of MARKET_DATA_SOURCES) {
    if (src.role === "execution" && !src.url.includes("paper-api")) {
      throw new Error(
        `STAGE 1 VIOLATION: execution source '${src.name}' does not point at the paper API (${src.url}). Refusing to start.`,
      );
    }
  }
}

export function sourcesByRole(role: SourceRole): MarketDataSource[] {
  return MARKET_DATA_SOURCES.filter((s) => s.role === role);
}
