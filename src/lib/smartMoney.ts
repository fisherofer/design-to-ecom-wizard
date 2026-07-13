/**
 * Smart Money tracker
 * ===================
 * Aggregates recent institutional / guru buys (13F, Form 4, congressional
 * trades) so we can position BEFORE the crowd catches on.
 *
 * Real data sources (must be wired via `missingApis.ts`):
 *   - SEC EDGAR 13F        — hedge-fund quarterly holdings
 *   - WhaleWisdom          — real-time 13F deltas
 *   - OpenInsider / Form 4 — insider buys
 *   - QuiverQuant          — congressional trades
 *
 * Until credentials are provisioned this returns curated mock activity so the
 * UI is testable end-to-end.
 */
export interface SmartMoneyMove {
  id: string;
  investor: string;
  investorType: "hedge-fund" | "insider" | "congress" | "activist" | "whale";
  action: "buy" | "add" | "new-position" | "trim" | "sell";
  symbol: string;
  amountUsd: number;
  changePct?: number;           // % change to their position
  filedAt: string;              // ISO
  source: "13F" | "Form 4" | "Congress" | "OnChain";
  conviction: number;           // 0..100 — AI score
  rationale: string;            // short AI blurb
  followScore: number;          // 0..100 — investor's historical alpha
}

const NOW = () => Date.now();

const MOCK: SmartMoneyMove[] = [
  {
    id: "m1", investor: "Berkshire Hathaway", investorType: "hedge-fund",
    action: "new-position", symbol: "OXY", amountUsd: 410_000_000, changePct: 100,
    filedAt: new Date(NOW() - 2 * 3600e3).toISOString(), source: "13F",
    conviction: 92, followScore: 96,
    rationale: "Buffett adding oil at cycle low — historical 24-month follow-on alpha +38%.",
  },
  {
    id: "m2", investor: "Michael Burry (Scion)", investorType: "hedge-fund",
    action: "new-position", symbol: "BABA", amountUsd: 12_400_000, changePct: 100,
    filedAt: new Date(NOW() - 5 * 3600e3).toISOString(), source: "13F",
    conviction: 78, followScore: 84,
    rationale: "Contrarian China re-entry — Burry's mean-reversion setups avg +22% 90d.",
  },
  {
    id: "m3", investor: "Nancy Pelosi", investorType: "congress",
    action: "buy", symbol: "NVDA", amountUsd: 1_050_000,
    filedAt: new Date(NOW() - 26 * 3600e3).toISOString(), source: "Congress",
    conviction: 74, followScore: 71,
    rationale: "Congressional NVDA calls disclosed — retail typically front-runs +9% in 5d.",
  },
  {
    id: "m4", investor: "CEO — Palantir", investorType: "insider",
    action: "buy", symbol: "PLTR", amountUsd: 2_800_000, changePct: 4.2,
    filedAt: new Date(NOW() - 8 * 3600e3).toISOString(), source: "Form 4",
    conviction: 81, followScore: 79,
    rationale: "Open-market insider buy (not option grant) — highest-signal Form 4 type.",
  },
  {
    id: "m5", investor: "Bill Ackman (Pershing)", investorType: "activist",
    action: "add", symbol: "GOOGL", amountUsd: 96_000_000, changePct: 25,
    filedAt: new Date(NOW() - 30 * 3600e3).toISOString(), source: "13F",
    conviction: 85, followScore: 88,
    rationale: "Activist adds 25% to GOOGL — concentrated bets historically ~+31% 12m.",
  },
  {
    id: "m6", investor: "Whale · 0x4a…f21", investorType: "whale",
    action: "buy", symbol: "BTC", amountUsd: 68_000_000,
    filedAt: new Date(NOW() - 45 * 60e3).toISOString(), source: "OnChain",
    conviction: 66, followScore: 62,
    rationale: "Cold-wallet accumulation from Coinbase Prime — spot-buy pattern, not swap.",
  },
];

export async function getSmartMoneyMoves(): Promise<SmartMoneyMove[]> {
  // TODO: fan out to real adapters once API keys are provisioned via missingApis.ts
  await new Promise((r) => setTimeout(r, 150));
  return [...MOCK].sort((a, b) => b.conviction * b.followScore - a.conviction * a.followScore);
}
