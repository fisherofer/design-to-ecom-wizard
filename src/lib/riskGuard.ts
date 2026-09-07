/**
 * riskGuard — portfolio-level risk limits.
 *
 * Position-level stops are not enough: a book of ten "small" longs in the same
 * sector is one trade. This module enforces limits across the whole book —
 * gross exposure, single-name and sector concentration, position count, and a
 * maximum daily loss that automatically engages the emergency halt.
 *
 * Every breach is written to the trade journal.
 */
import { useEffect, useState } from "react";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { bookPositions, getBook, type BookPosition } from "@/lib/orderTicket";
import { engageKillSwitch, isKilled } from "@/lib/killSwitch";
import { journal } from "@/lib/tradeJournal";

const LIMITS_KEY = "ofer.risk.limits.v1";
const DAY_KEY = "ofer.risk.day.v1";
export const RISK_EVENT = "ofer:risk-limits-changed";

export interface RiskLimits {
  /** Account equity used as the denominator for every percentage limit. */
  accountEquityUsd: number;
  /** Max total notional across all open positions, as % of equity. */
  maxGrossExposurePct: number;
  /** Max notional in a single symbol, as % of equity. */
  maxSinglePositionPct: number;
  /** Max notional in one sector, as % of equity. */
  maxSectorExposurePct: number;
  /** Max number of simultaneously open positions. */
  maxOpenPositions: number;
  /** Max realised loss for the day, as % of equity. Breach = automatic halt. */
  maxDailyLossPct: number;
  /** Automatically engage the kill-switch when the daily loss limit breaks. */
  autoHaltOnDailyLoss: boolean;
}

export const DEFAULT_LIMITS: RiskLimits = {
  accountEquityUsd: 100_000,
  maxGrossExposurePct: 150,
  maxSinglePositionPct: 15,
  maxSectorExposurePct: 35,
  maxOpenPositions: 12,
  maxDailyLossPct: 3,
  autoHaltOnDailyLoss: true,
};

export function getRiskLimits(): RiskLimits {
  return { ...DEFAULT_LIMITS, ...portableGetJson<Partial<RiskLimits>>(LIMITS_KEY, {}) };
}

export function setRiskLimits(next: Partial<RiskLimits>): RiskLimits {
  const merged = { ...getRiskLimits(), ...next };
  portableSetJson(LIMITS_KEY, merged);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RISK_EVENT));
  return merged;
}

/* ------------------------------------------------------------------ *
 * Sector classification
 * ------------------------------------------------------------------ */

const SECTOR_MAP: Record<string, string> = {
  NVDA: "Semiconductors", AMD: "Semiconductors", AVGO: "Semiconductors", MRVL: "Semiconductors",
  SMCI: "Semiconductors", INTC: "Semiconductors", TSM: "Semiconductors", MU: "Semiconductors",
  AAPL: "Technology", MSFT: "Technology", GOOGL: "Technology", GOOG: "Technology",
  META: "Technology", ORCL: "Technology", CRM: "Technology", ADBE: "Technology",
  AMZN: "Consumer", TSLA: "Consumer", NKE: "Consumer", SBUX: "Consumer", HD: "Consumer",
  PLTR: "Software", SNOW: "Software", CRWD: "Cybersecurity", PANW: "Cybersecurity", ZS: "Cybersecurity",
  JPM: "Financials", BAC: "Financials", GS: "Financials", COIN: "Financials", HOOD: "Financials",
  XOM: "Energy", CVX: "Energy", OXY: "Energy", SLB: "Energy",
  LMT: "Defense", RTX: "Defense", ESLT: "Defense", NOC: "Defense",
  PFE: "Healthcare", LLY: "Healthcare", UNH: "Healthcare", JNJ: "Healthcare",
  SPY: "Index ETF", QQQ: "Index ETF", IWM: "Index ETF", DIA: "Index ETF",
  BTC: "Crypto", ETH: "Crypto", SOL: "Crypto", MSTR: "Crypto",
  ZIM: "Shipping",
};

const OVERRIDE_KEY = "ofer.risk.sectors.v1";

export function getSectorOverrides(): Record<string, string> {
  return portableGetJson<Record<string, string>>(OVERRIDE_KEY, {});
}

export function setSectorOverride(symbol: string, sector: string): void {
  const next = { ...getSectorOverrides(), [symbol.toUpperCase()]: sector };
  portableSetJson(OVERRIDE_KEY, next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(RISK_EVENT));
}

export function sectorOf(symbol: string): string {
  const s = symbol.toUpperCase();
  return getSectorOverrides()[s] ?? SECTOR_MAP[s] ?? "Unclassified";
}

/* ------------------------------------------------------------------ *
 * Daily P&L tracking
 * ------------------------------------------------------------------ */

interface DayState {
  date: string;
  startRealizedUsd: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayState(): DayState {
  const stored = portableGetJson<DayState>(DAY_KEY, { date: "", startRealizedUsd: 0 });
  if (stored.date !== today()) {
    const fresh = { date: today(), startRealizedUsd: getBook().realizedUsd };
    portableSetJson(DAY_KEY, fresh);
    return fresh;
  }
  return stored;
}

/** Realised P&L booked since midnight. */
export function dailyRealizedUsd(): number {
  return Number((getBook().realizedUsd - dayState().startRealizedUsd).toFixed(2));
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export interface RiskBreach {
  code:
    | "GROSS_EXPOSURE"
    | "SINGLE_POSITION"
    | "SECTOR_EXPOSURE"
    | "POSITION_COUNT"
    | "DAILY_LOSS";
  label: string;
  detail: string;
  usedPct: number;
  limitPct: number;
  severity: "warn" | "critical";
}

export interface SectorExposure {
  sector: string;
  notionalUsd: number;
  pctOfEquity: number;
  symbols: string[];
}

export interface RiskAssessment {
  equityUsd: number;
  grossNotionalUsd: number;
  grossPct: number;
  openPositions: number;
  unrealizedUsd: number;
  dailyRealizedUsd: number;
  dailyLossPct: number;
  sectors: SectorExposure[];
  largest: { symbol: string; pctOfEquity: number } | null;
  breaches: RiskBreach[];
  worstUtilisationPct: number;
  evaluatedAt: string;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0;
}

export function assessRisk(
  positions: BookPosition[] = bookPositions(),
  limits: RiskLimits = getRiskLimits(),
): RiskAssessment {
  const equity = limits.accountEquityUsd > 0 ? limits.accountEquityUsd : 1;
  const gross = positions.reduce((a, p) => a + Math.abs(p.notionalUsd), 0);
  const unrealized = positions.reduce((a, p) => a + p.unrealizedUsd, 0);

  const bySector = new Map<string, SectorExposure>();
  for (const p of positions) {
    const sector = sectorOf(p.symbol);
    const row = bySector.get(sector) ?? { sector, notionalUsd: 0, pctOfEquity: 0, symbols: [] };
    row.notionalUsd += Math.abs(p.notionalUsd);
    if (!row.symbols.includes(p.symbol)) row.symbols.push(p.symbol);
    bySector.set(sector, row);
  }
  const sectors = [...bySector.values()]
    .map((s) => ({ ...s, notionalUsd: Number(s.notionalUsd.toFixed(2)), pctOfEquity: pct(s.notionalUsd, equity) }))
    .sort((a, b) => b.notionalUsd - a.notionalUsd);

  const bySymbol = new Map<string, number>();
  for (const p of positions) bySymbol.set(p.symbol, (bySymbol.get(p.symbol) ?? 0) + Math.abs(p.notionalUsd));
  const largestEntry = [...bySymbol.entries()].sort((a, b) => b[1] - a[1])[0];
  const largest = largestEntry ? { symbol: largestEntry[0], pctOfEquity: pct(largestEntry[1], equity) } : null;

  const dailyPnl = dailyRealizedUsd();
  const dailyLossPct = dailyPnl < 0 ? pct(Math.abs(dailyPnl), equity) : 0;

  const breaches: RiskBreach[] = [];
  const grossPct = pct(gross, equity);

  if (grossPct > limits.maxGrossExposurePct) {
    breaches.push({
      code: "GROSS_EXPOSURE",
      label: "Total exposure too high",
      detail: `Open notional is ${grossPct}% of equity, above the ${limits.maxGrossExposurePct}% ceiling.`,
      usedPct: grossPct,
      limitPct: limits.maxGrossExposurePct,
      severity: "critical",
    });
  }
  if (largest && largest.pctOfEquity > limits.maxSinglePositionPct) {
    breaches.push({
      code: "SINGLE_POSITION",
      label: `${largest.symbol} is oversized`,
      detail: `${largest.symbol} is ${largest.pctOfEquity}% of equity, above the ${limits.maxSinglePositionPct}% single-name ceiling.`,
      usedPct: largest.pctOfEquity,
      limitPct: limits.maxSinglePositionPct,
      severity: "warn",
    });
  }
  for (const s of sectors) {
    if (s.pctOfEquity > limits.maxSectorExposurePct) {
      breaches.push({
        code: "SECTOR_EXPOSURE",
        label: `${s.sector} concentration`,
        detail: `${s.sector} holds ${s.pctOfEquity}% of equity (${s.symbols.join(", ")}), above the ${limits.maxSectorExposurePct}% ceiling.`,
        usedPct: s.pctOfEquity,
        limitPct: limits.maxSectorExposurePct,
        severity: "warn",
      });
    }
  }
  if (positions.length > limits.maxOpenPositions) {
    breaches.push({
      code: "POSITION_COUNT",
      label: "Too many open positions",
      detail: `${positions.length} open positions against a ${limits.maxOpenPositions} limit.`,
      usedPct: pct(positions.length, limits.maxOpenPositions) ,
      limitPct: 100,
      severity: "warn",
    });
  }
  if (dailyLossPct > limits.maxDailyLossPct) {
    breaches.push({
      code: "DAILY_LOSS",
      label: "Daily loss limit hit",
      detail: `Today's realised loss is ${dailyLossPct}% of equity, past the ${limits.maxDailyLossPct}% stop.`,
      usedPct: dailyLossPct,
      limitPct: limits.maxDailyLossPct,
      severity: "critical",
    });
  }

  const utilisations = [
    pct(grossPct, limits.maxGrossExposurePct),
    largest ? pct(largest.pctOfEquity, limits.maxSinglePositionPct) : 0,
    sectors.length ? pct(sectors[0].pctOfEquity, limits.maxSectorExposurePct) : 0,
    pct(positions.length, limits.maxOpenPositions),
    pct(dailyLossPct, limits.maxDailyLossPct),
  ];

  return {
    equityUsd: equity,
    grossNotionalUsd: Number(gross.toFixed(2)),
    grossPct,
    openPositions: positions.length,
    unrealizedUsd: Number(unrealized.toFixed(2)),
    dailyRealizedUsd: dailyPnl,
    dailyLossPct,
    sectors,
    largest,
    breaches,
    worstUtilisationPct: Math.round(Math.max(0, ...utilisations)),
    evaluatedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ *
 * Pre-trade gate
 * ------------------------------------------------------------------ */

export interface PreTradeCheck {
  allowed: boolean;
  reasons: string[];
  warnings: string[];
}

/**
 * Runs the portfolio limits against the book *as it would be* after the
 * proposed order. Hard limits block the order; soft ones only warn.
 */
export function preTradeCheck(candidate: {
  symbol: string;
  qty: number;
  price: number;
}): PreTradeCheck {
  const limits = getRiskLimits();
  const current = bookPositions();
  const equity = limits.accountEquityUsd > 0 ? limits.accountEquityUsd : 1;
  const addNotional = Math.abs(candidate.qty * candidate.price);
  const symbol = candidate.symbol.toUpperCase();

  const reasons: string[] = [];
  const warnings: string[] = [];

  const gross = current.reduce((a, p) => a + Math.abs(p.notionalUsd), 0) + addNotional;
  const grossPct = pct(gross, equity);
  if (grossPct > limits.maxGrossExposurePct) {
    reasons.push(
      `Total exposure would reach ${grossPct}% of equity, above the ${limits.maxGrossExposurePct}% ceiling.`,
    );
  }

  const symbolNotional =
    current.filter((p) => p.symbol === symbol).reduce((a, p) => a + Math.abs(p.notionalUsd), 0) + addNotional;
  const symbolPct = pct(symbolNotional, equity);
  if (symbolPct > limits.maxSinglePositionPct) {
    reasons.push(
      `${symbol} would be ${symbolPct}% of equity, above the ${limits.maxSinglePositionPct}% single-name ceiling.`,
    );
  }

  const sector = sectorOf(symbol);
  const sectorNotional =
    current.filter((p) => sectorOf(p.symbol) === sector).reduce((a, p) => a + Math.abs(p.notionalUsd), 0) +
    addNotional;
  const sectorPct = pct(sectorNotional, equity);
  if (sectorPct > limits.maxSectorExposurePct) {
    reasons.push(
      `${sector} exposure would be ${sectorPct}% of equity, above the ${limits.maxSectorExposurePct}% sector ceiling.`,
    );
  }

  const isNewSymbol = !current.some((p) => p.symbol === symbol);
  if (isNewSymbol && current.length + 1 > limits.maxOpenPositions) {
    reasons.push(`This would open position #${current.length + 1} against a ${limits.maxOpenPositions} limit.`);
  }

  const dailyPnl = dailyRealizedUsd();
  const dailyLossPct = dailyPnl < 0 ? pct(Math.abs(dailyPnl), equity) : 0;
  if (dailyLossPct > limits.maxDailyLossPct) {
    reasons.push(
      `Today's realised loss is ${dailyLossPct}% of equity — past the ${limits.maxDailyLossPct}% daily stop. No new risk today.`,
    );
  } else if (dailyLossPct > limits.maxDailyLossPct * 0.7) {
    warnings.push(`Today's loss is at ${Math.round((dailyLossPct / limits.maxDailyLossPct) * 100)}% of the daily stop.`);
  }

  if (grossPct > limits.maxGrossExposurePct * 0.85 && !reasons.length) {
    warnings.push(`Total exposure would reach ${grossPct}% of equity — close to the ceiling.`);
  }

  if (reasons.length) {
    journal({
      eventType: "RISK_BREACH",
      severity: "warn",
      source: "risk",
      symbol,
      qty: candidate.qty,
      price: candidate.price,
      message: `Order blocked by portfolio risk limits: ${reasons[0]}`,
      details: { reasons, sector, grossPct, symbolPct, sectorPct },
    });
  }

  return { allowed: reasons.length === 0, reasons, warnings };
}

/**
 * Continuous monitor: engages the emergency halt the moment the daily loss
 * limit breaks. Safe to call on every book update.
 */
export function enforceDailyLossStop(): boolean {
  const limits = getRiskLimits();
  if (!limits.autoHaltOnDailyLoss || isKilled()) return false;
  const assessment = assessRisk();
  const breach = assessment.breaches.find((b) => b.code === "DAILY_LOSS");
  if (!breach) return false;

  engageKillSwitch(
    `Daily loss limit breached (${assessment.dailyLossPct}% of equity)`,
    "risk-guard",
  );
  journal({
    eventType: "KILL_SWITCH",
    severity: "critical",
    source: "risk",
    realizedUsd: assessment.dailyRealizedUsd,
    message: `Automatic halt: daily loss reached ${assessment.dailyLossPct}% of equity, past the ${limits.maxDailyLossPct}% stop.`,
    details: { assessment: { ...assessment, sectors: assessment.sectors } },
  });
  return true;
}

export function useRiskAssessment(pollMs = 5000): RiskAssessment {
  const [state, setState] = useState<RiskAssessment>(() => assessRisk([], DEFAULT_LIMITS));
  useEffect(() => {
    const run = () => {
      enforceDailyLossStop();
      setState(assessRisk());
    };
    run();
    window.addEventListener(RISK_EVENT, run);
    window.addEventListener("ofer:orders-changed", run);
    const t = setInterval(run, pollMs);
    return () => {
      window.removeEventListener(RISK_EVENT, run);
      window.removeEventListener("ofer:orders-changed", run);
      clearInterval(t);
    };
  }, [pollMs]);
  return state;
}
