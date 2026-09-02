/**
 * backtest — browser driver for backtesting_engine.py.
 *
 * Pulls real daily bars from the local backend (`/api/alpaca/bars`) and runs
 * the same momentum / mean-reversion rules the Python engine implements, then
 * reports the institutional metric set:
 *
 *   equity curve · CAGR · Sharpe · Sortino · max drawdown · Calmar
 *   win rate · profit factor · expectancy · exposure
 *   walk-forward folds (in-sample train → out-of-sample test)
 *
 * If the backend is unreachable the run fails loudly — no synthetic prices.
 */
import { getApiBase } from "@/lib/apiConfig";
import type { AlpacaBar } from "@/lib/alpaca";

export type StrategyId = "sma_cross" | "momentum" | "mean_reversion" | "breakout";

export interface BacktestParams {
  symbol: string;
  timeframe: "1D" | "1H";
  lookbackBars: number;
  strategy: StrategyId;
  fastPeriod: number;
  slowPeriod: number;
  initialEquity: number;
  riskPctPerTrade: number;
  stopAtrMultiple: number;
  feeBps: number;
  slippageBps: number;
  walkForwardFolds: number;
}

export const DEFAULT_PARAMS: BacktestParams = {
  symbol: "AAPL",
  timeframe: "1D",
  lookbackBars: 500,
  strategy: "sma_cross",
  fastPeriod: 10,
  slowPeriod: 30,
  initialEquity: 100_000,
  riskPctPerTrade: 1,
  stopAtrMultiple: 2,
  feeBps: 1,
  slippageBps: 2,
  walkForwardFolds: 4,
};

export interface Trade {
  entryIndex: number;
  exitIndex: number;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnlUsd: number;
  pnlPct: number;
  reason: "signal" | "stop" | "end";
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdownPct: number;
  buyHold: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  calmar: number;
  winRatePct: number;
  profitFactor: number;
  expectancyUsd: number;
  trades: number;
  exposurePct: number;
  buyHoldReturnPct: number;
  finalEquity: number;
}

export interface WalkForwardFold {
  fold: number;
  trainFrom: string;
  trainTo: string;
  testFrom: string;
  testTo: string;
  trainReturnPct: number;
  testReturnPct: number;
  testSharpe: number;
  testMaxDdPct: number;
  degradationPct: number;
  verdict: "robust" | "fragile" | "overfit";
}

export interface BacktestResult {
  ok: boolean;
  error?: string;
  params: BacktestParams;
  bars: number;
  from: string;
  to: string;
  metrics: BacktestMetrics;
  equity: EquityPoint[];
  trades: Trade[];
  walkForward: WalkForwardFold[];
  source: string;
  ranAt: string;
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

export async function fetchBars(
  symbol: string,
  timeframe: string,
  limit: number,
): Promise<{ bars: AlpacaBar[]; source: string; error?: string }> {
  try {
    const res = await fetch(
      `${getApiBase()}/api/alpaca/bars?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&limit=${limit}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return { bars: [], source: "unavailable", error: `HTTP ${res.status}` };
    const data = (await res.json()) as AlpacaBar[] | { bars?: AlpacaBar[] };
    const bars = Array.isArray(data) ? data : (data.bars ?? []);
    const clean = bars.filter((b) => b && b.c > 0).sort((a, b) => a.t - b.t);
    return { bars: clean, source: "alpaca/bars" };
  } catch (err) {
    return { bars: [], source: "unavailable", error: (err as Error).message };
  }
}

/* ------------------------------------------------------------------ *
 * Indicators
 * ------------------------------------------------------------------ */

function sma(values: number[], period: number, i: number): number | null {
  if (i + 1 < period) return null;
  let s = 0;
  for (let k = i - period + 1; k <= i; k += 1) s += values[k]!;
  return s / period;
}

function atr(bars: AlpacaBar[], period: number, i: number): number | null {
  if (i < period) return null;
  let s = 0;
  for (let k = i - period + 1; k <= i; k += 1) {
    const b = bars[k]!;
    const prev = bars[k - 1]!;
    s += Math.max(b.h - b.l, Math.abs(b.h - prev.c), Math.abs(b.l - prev.c));
  }
  return s / period;
}

function signalAt(p: BacktestParams, closes: number[], bars: AlpacaBar[], i: number): 1 | -1 | 0 {
  const fast = sma(closes, p.fastPeriod, i);
  const slow = sma(closes, p.slowPeriod, i);
  if (fast === null || slow === null) return 0;

  switch (p.strategy) {
    case "sma_cross":
      return fast > slow ? 1 : -1;
    case "momentum": {
      const back = closes[Math.max(0, i - p.slowPeriod)]!;
      const chg = (closes[i]! - back) / back;
      return chg > 0.02 ? 1 : chg < -0.02 ? -1 : 0;
    }
    case "mean_reversion": {
      const dev = (closes[i]! - slow) / slow;
      return dev < -0.03 ? 1 : dev > 0.03 ? -1 : 0;
    }
    case "breakout": {
      const window = closes.slice(Math.max(0, i - p.slowPeriod), i);
      if (window.length < 5) return 0;
      const hi = Math.max(...window);
      const lo = Math.min(...window);
      return closes[i]! > hi ? 1 : closes[i]! < lo ? -1 : 0;
    }
    default:
      return 0;
  }
}

/* ------------------------------------------------------------------ *
 * Core simulation
 * ------------------------------------------------------------------ */

interface SimOutput {
  equity: EquityPoint[];
  trades: Trade[];
  metrics: BacktestMetrics;
}

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export function simulate(bars: AlpacaBar[], p: BacktestParams): SimOutput {
  const closes = bars.map((b) => b.c);
  const costRate = (p.feeBps + p.slippageBps) / 10_000;

  let cash = p.initialEquity;
  let qty = 0;
  let entryPrice = 0;
  let entryIndex = 0;
  let stop = 0;
  let peak = p.initialEquity;
  let barsInMarket = 0;

  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];
  const returns: number[] = [];
  const first = closes[0] ?? 1;

  const closeTrade = (i: number, price: number, reason: Trade["reason"]) => {
    const exec = price * (1 - costRate);
    const pnl = (exec - entryPrice) * qty;
    cash += exec * qty;
    trades.push({
      entryIndex,
      exitIndex: i,
      entryDate: iso(bars[entryIndex]!.t),
      exitDate: iso(bars[i]!.t),
      entryPrice: Number(entryPrice.toFixed(4)),
      exitPrice: Number(exec.toFixed(4)),
      qty: Number(qty.toFixed(4)),
      pnlUsd: Number(pnl.toFixed(2)),
      pnlPct: Number((((exec - entryPrice) / entryPrice) * 100).toFixed(3)),
      reason,
    });
    qty = 0;
    entryPrice = 0;
  };

  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const price = bar.c;
    const sig = signalAt(p, closes, bars, i);
    const a = atr(bars, 14, i) ?? price * 0.02;

    if (qty > 0) {
      barsInMarket += 1;
      if (bar.l <= stop) {
        closeTrade(i, stop, "stop");
      } else if (sig === -1) {
        closeTrade(i, price, "signal");
      }
    }

    if (qty === 0 && sig === 1) {
      const equityNow = cash;
      const riskUsd = (equityNow * p.riskPctPerTrade) / 100;
      const perShareRisk = Math.max(a * p.stopAtrMultiple, price * 0.005);
      const size = Math.max(0, Math.floor((riskUsd / perShareRisk) * 100) / 100);
      const exec = price * (1 + costRate);
      const cost = size * exec;
      if (size > 0 && cost <= cash) {
        qty = size;
        entryPrice = exec;
        entryIndex = i;
        stop = price - perShareRisk;
        cash -= cost;
      }
    }

    const equityNow = cash + qty * price;
    peak = Math.max(peak, equityNow);
    const dd = peak > 0 ? ((peak - equityNow) / peak) * 100 : 0;
    const prev = equity[equity.length - 1]?.equity ?? p.initialEquity;
    if (prev > 0) returns.push(equityNow / prev - 1);

    equity.push({
      date: iso(bar.t),
      equity: Number(equityNow.toFixed(2)),
      drawdownPct: Number(dd.toFixed(3)),
      buyHold: Number(((price / first) * p.initialEquity).toFixed(2)),
    });
  }

  if (qty > 0 && bars.length > 1) closeTrade(bars.length - 1, closes[closes.length - 1]!, "end");

  const finalEquity = equity[equity.length - 1]?.equity ?? p.initialEquity;
  const totalReturnPct = ((finalEquity - p.initialEquity) / p.initialEquity) * 100;

  const periodsPerYear = p.timeframe === "1D" ? 252 : 252 * 6.5;
  const years = bars.length / periodsPerYear || 1;
  const cagrPct = (Math.pow(finalEquity / p.initialEquity, 1 / years) - 1) * 100;

  const mean = returns.length ? returns.reduce((a2, b) => a2 + b, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((a2, b) => a2 + (b - mean) ** 2, 0) / returns.length
    : 0;
  const std = Math.sqrt(variance);
  const downside = returns.filter((r) => r < 0);
  const downStd = downside.length
    ? Math.sqrt(downside.reduce((a2, b) => a2 + b ** 2, 0) / downside.length)
    : 0;

  const sharpe = std > 0 ? (mean / std) * Math.sqrt(periodsPerYear) : 0;
  const sortino = downStd > 0 ? (mean / downStd) * Math.sqrt(periodsPerYear) : 0;
  const maxDrawdownPct = equity.reduce((m, e) => Math.max(m, e.drawdownPct), 0);

  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const grossWin = wins.reduce((a2, t) => a2 + t.pnlUsd, 0);
  const grossLoss = Math.abs(losses.reduce((a2, t) => a2 + t.pnlUsd, 0));

  const buyHoldReturnPct =
    closes.length > 1 ? ((closes[closes.length - 1]! - first) / first) * 100 : 0;

  return {
    equity,
    trades,
    metrics: {
      totalReturnPct: Number(totalReturnPct.toFixed(2)),
      cagrPct: Number(cagrPct.toFixed(2)),
      sharpe: Number(sharpe.toFixed(2)),
      sortino: Number(sortino.toFixed(2)),
      maxDrawdownPct: Number(maxDrawdownPct.toFixed(2)),
      calmar: Number((maxDrawdownPct > 0 ? cagrPct / maxDrawdownPct : 0).toFixed(2)),
      winRatePct: Number((trades.length ? (wins.length / trades.length) * 100 : 0).toFixed(1)),
      profitFactor: Number((grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0).toFixed(2)),
      expectancyUsd: Number(
        (trades.length ? trades.reduce((a2, t) => a2 + t.pnlUsd, 0) / trades.length : 0).toFixed(2),
      ),
      trades: trades.length,
      exposurePct: Number(((barsInMarket / Math.max(1, bars.length)) * 100).toFixed(1)),
      buyHoldReturnPct: Number(buyHoldReturnPct.toFixed(2)),
      finalEquity: Number(finalEquity.toFixed(2)),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Walk-forward
 * ------------------------------------------------------------------ */

export function walkForward(bars: AlpacaBar[], p: BacktestParams): WalkForwardFold[] {
  const folds = Math.max(1, Math.min(8, p.walkForwardFolds));
  const out: WalkForwardFold[] = [];
  const segment = Math.floor(bars.length / (folds + 1));
  if (segment < p.slowPeriod + 10) return out;

  for (let f = 0; f < folds; f += 1) {
    const trainStart = 0;
    const trainEnd = segment * (f + 1);
    const testEnd = Math.min(bars.length, trainEnd + segment);
    const train = bars.slice(trainStart, trainEnd);
    const test = bars.slice(trainEnd, testEnd);
    if (test.length < p.slowPeriod + 5) continue;

    const trainRes = simulate(train, p);
    const testRes = simulate(test, p);
    const degradation =
      trainRes.metrics.totalReturnPct !== 0
        ? ((trainRes.metrics.totalReturnPct - testRes.metrics.totalReturnPct) /
            Math.abs(trainRes.metrics.totalReturnPct)) *
          100
        : 0;

    out.push({
      fold: f + 1,
      trainFrom: iso(train[0]!.t),
      trainTo: iso(train[train.length - 1]!.t),
      testFrom: iso(test[0]!.t),
      testTo: iso(test[test.length - 1]!.t),
      trainReturnPct: trainRes.metrics.totalReturnPct,
      testReturnPct: testRes.metrics.totalReturnPct,
      testSharpe: testRes.metrics.sharpe,
      testMaxDdPct: testRes.metrics.maxDrawdownPct,
      degradationPct: Number(degradation.toFixed(1)),
      verdict:
        testRes.metrics.totalReturnPct > 0 && degradation < 40
          ? "robust"
          : testRes.metrics.totalReturnPct > 0
            ? "fragile"
            : "overfit",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

const HISTORY_KEY = "ofer.backtest.history.v1";

export async function runBacktest(params: BacktestParams): Promise<BacktestResult> {
  const empty: BacktestResult = {
    ok: false,
    params,
    bars: 0,
    from: "",
    to: "",
    metrics: {
      totalReturnPct: 0,
      cagrPct: 0,
      sharpe: 0,
      sortino: 0,
      maxDrawdownPct: 0,
      calmar: 0,
      winRatePct: 0,
      profitFactor: 0,
      expectancyUsd: 0,
      trades: 0,
      exposurePct: 0,
      buyHoldReturnPct: 0,
      finalEquity: params.initialEquity,
    },
    equity: [],
    trades: [],
    walkForward: [],
    source: "unavailable",
    ranAt: new Date().toISOString(),
  };

  const { bars, source, error } = await fetchBars(params.symbol, params.timeframe, params.lookbackBars);
  if (bars.length < params.slowPeriod + 20) {
    return {
      ...empty,
      error:
        error ??
        `Not enough verified bars for ${params.symbol} (${bars.length}). Start the local backend so /api/alpaca/bars can serve real history.`,
    };
  }

  const sim = simulate(bars, params);
  const result: BacktestResult = {
    ok: true,
    params,
    bars: bars.length,
    from: iso(bars[0]!.t),
    to: iso(bars[bars.length - 1]!.t),
    metrics: sim.metrics,
    equity: sim.equity,
    trades: sim.trades,
    walkForward: walkForward(bars, params),
    source,
    ranAt: new Date().toISOString(),
  };

  saveRun(result);
  return result;
}

export interface BacktestHistoryItem {
  ranAt: string;
  symbol: string;
  strategy: StrategyId;
  totalReturnPct: number;
  sharpe: number;
  maxDrawdownPct: number;
  trades: number;
}

function saveRun(r: BacktestResult) {
  if (typeof window === "undefined") return;
  try {
    const prev = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as BacktestHistoryItem[];
    const next = [
      {
        ranAt: r.ranAt,
        symbol: r.params.symbol,
        strategy: r.params.strategy,
        totalReturnPct: r.metrics.totalReturnPct,
        sharpe: r.metrics.sharpe,
        maxDrawdownPct: r.metrics.maxDrawdownPct,
        trades: r.metrics.trades,
      },
      ...prev,
    ].slice(0, 25);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function getBacktestHistory(): BacktestHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? "[]") as BacktestHistoryItem[];
  } catch {
    return [];
  }
}
