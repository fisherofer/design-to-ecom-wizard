/**
 * Missing-API registry
 * ====================
 * Agents / widgets register the external services they need. If credentials
 * aren't wired yet, the dashboard shows a banner with signup + docs links so
 * the operator (or an autonomous agent) knows exactly what to obtain next.
 */

export interface MissingApiEntry {
  id: string;
  name: string;
  /** what feature needs it */
  neededFor: string;
  /** where to sign up */
  signupUrl: string;
  /** provider docs */
  docsUrl?: string;
  /** which env var / secret the app expects once obtained */
  envVar?: string;
  /** high/medium/low priority for the agent to acquire */
  priority: "high" | "medium" | "low";
  /** free tier available? */
  free?: boolean;
}

export const MISSING_APIS: MissingApiEntry[] = [
  {
    id: "sec-13f",
    name: "SEC EDGAR 13F Filings",
    neededFor: "Smart-money tracking · guru & institutional holdings",
    signupUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    docsUrl: "https://www.sec.gov/edgar/sec-api-documentation",
    envVar: "SEC_EDGAR_USER_AGENT",
    priority: "high",
    free: true,
  },
  {
    id: "whalewisdom",
    name: "WhaleWisdom API",
    neededFor: "Real-time 13F change deltas · hedge-fund position moves",
    signupUrl: "https://whalewisdom.com/info/api",
    envVar: "WHALEWISDOM_API_KEY",
    priority: "high",
  },
  {
    id: "openinsider",
    name: "OpenInsider / SEC Form 4",
    neededFor: "Insider buys (CEO/CFO/Director) — front-run signal",
    signupUrl: "http://openinsider.com/",
    envVar: "OPENINSIDER_TOKEN",
    priority: "high",
    free: true,
  },
  {
    id: "quiverquant",
    name: "QuiverQuant",
    neededFor: "Congressional trades, government contracts, WSB sentiment",
    signupUrl: "https://www.quiverquant.com/api/",
    envVar: "QUIVER_API_KEY",
    priority: "medium",
  },
  {
    id: "whale-alert",
    name: "Whale Alert",
    neededFor: "On-chain whale transactions (crypto smart money)",
    signupUrl: "https://whale-alert.io/",
    envVar: "WHALE_ALERT_KEY",
    priority: "medium",
    free: true,
  },
];

/** Placeholder — a future hook will check `secrets` and only return unmet ones. */
export function getUnmetApis(): MissingApiEntry[] {
  // Until wired to real secret store, treat all as unmet so the operator sees them.
  return MISSING_APIS;
}
