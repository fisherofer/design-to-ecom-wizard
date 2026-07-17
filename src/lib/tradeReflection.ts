/**
 * tradeReflection — synthesise a post-mortem "reflection report" for a closed
 * trade. Pattern taken from OFERTRADINGBOT MarketAnalysisEngine.ReflectionReport.
 * Heuristic-only (no network); an AI upgrade can replace `summarise()` later.
 */
export interface CompletedTrade {
  ticker: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  entryDate: string;
  exitDate: string;
  volumeRatioAtTrade?: number;
  vgrAtTrade?: number; // volume-growth-rate
}

export interface ReflectionReport {
  ticker: string;
  pnl: number;
  pnlPct: number;
  efficiencyScore: number;       // 0-100
  executionGrade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  recommendations: string[];
  timestamp: string;
}

function grade(score: number): ReflectionReport["executionGrade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

export function reflectOnTrade(t: CompletedTrade): ReflectionReport {
  const pnl = (t.sellPrice - t.buyPrice) * t.qty;
  const pnlPct = t.buyPrice > 0 ? ((t.sellPrice - t.buyPrice) / t.buyPrice) * 100 : 0;
  const held = Math.max(1, (new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 3_600_000);

  // Heuristic score: reward positive pnl, penalise long-hold small wins, credit high-volume entries.
  let score = 50 + Math.max(-40, Math.min(40, pnlPct * 2));
  score += (t.volumeRatioAtTrade ?? 1) > 1.5 ? 6 : -4;
  score += (t.vgrAtTrade ?? 0) > 0 ? 4 : 0;
  score -= held > 72 && Math.abs(pnlPct) < 1 ? 10 : 0;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const recs: string[] = [];
  if (pnlPct < 0) recs.push("Tighten stop-loss on similar setups; entry lacked confirmation.");
  if ((t.volumeRatioAtTrade ?? 1) < 1.2) recs.push("Wait for volume ratio ≥ 1.5× 20-day avg before entry.");
  if (held > 48 && Math.abs(pnlPct) < 2) recs.push("Trade thesis stalled — cut earlier when catalyst fades.");
  if (pnlPct > 5) recs.push("Consider scaling out in tranches to lock in gains.");
  if (recs.length === 0) recs.push("Repeatable playbook — log the setup as a template.");

  return {
    ticker: t.ticker,
    pnl,
    pnlPct,
    efficiencyScore: score,
    executionGrade: grade(score),
    summary: `${t.ticker}: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% over ${held.toFixed(1)}h (${grade(score)}).`,
    recommendations: recs,
    timestamp: new Date().toISOString(),
  };
}
