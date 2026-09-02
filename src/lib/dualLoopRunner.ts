/**
 * dualLoopRunner — browser-side driver for smart_llm_execution_engine.py.
 *
 * Runs the two loops described by the Python engine:
 *   • slow loop  — AI sentiment refresh every `slowLoopSec`
 *   • fast loop  — technical evaluation / execution tick every `fastLoopMs`
 *
 * Market data comes from hub/quotes_router.py (/api/market-data/quote) through
 * `liveQuotes.ts`. Prices are NEVER fabricated: when the backend is offline the
 * tick is marked simulated and the Mock Data Guard downgrades it to paper.
 *
 * Every tick is filtered through the Mock Data Guard contract
 * (mock_data_guard_engine.py) before it may become a live decision, and the
 * HardRiskManager circuit breaker halts the loop on drawdown breach.
 *
 * State is persisted through portableStorage so a Portable Mode profile keeps
 * its bank balance, positions and run history across restarts.
 */
import { useEffect, useState } from "react";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { isKilled } from "@/lib/killSwitch";
import {
  atrVarUsd,
  getGuardConfig,
  getSmartConfig,
  recordRun,
  type GuardConfig,
  type SmartLlmConfig,
} from "@/lib/engineConfig";
import {
  estimateAtr,
  fetchQuotes,
  momentumScore,
  pushPrice,
  type LiveQuote,
} from "@/lib/liveQuotes";

export const LOOP_STATE_KEY = "ofer.engines.dualloop.state.v1";
const LOOP_EVENT = "ofer:dual-loop-changed";

export type LoopPhase = "IDLE" | "SLOW_AI" | "FAST_EXEC" | "BLOCKED" | "BREAKER";

export interface LoopPosition {
  symbol: string;
  qty: number;
  avgPrice: number;
  lastPrice: number;
  unrealizedUsd: number;
  notionalUsd: number;
  openedAt: string;
  simulated: boolean;
}

export interface LoopState {
  running: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  phase: LoopPhase;
  ticks: number;
  slowCycles: number;
  decisions: number;
  blocked: number;
  holds: number;
  breakerTrips: number;
  /** Latest AI sentiment produced by the slow loop (0-100). */
  aiScore: number;
  lastSlowAt: string | null;
  lastTickAt: string | null;
  /** Bank ledger. */
  openingEquityUsd: number;
  equityUsd: number;
  peakEquityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  openInterestUsd: number;
  openRiskUsd: number;
  drawdownPct: number;
  guardMode: GuardConfig["mode"];
  lastNote: string;
  /** Live market data attribution. */
  dataSource: "LIVE" | "SIMULATED";
  quoteProvider: string | null;
  quoteAgeSec: number | null;
  feedError: string | null;
  positions: LoopPosition[];
}

const UNIVERSE = ["AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

export function defaultLoopState(equity = 100000): LoopState {
  return {
    running: false,
    startedAt: null,
    stoppedAt: null,
    phase: "IDLE",
    ticks: 0,
    slowCycles: 0,
    decisions: 0,
    blocked: 0,
    holds: 0,
    breakerTrips: 0,
    aiScore: 50,
    lastSlowAt: null,
    lastTickAt: null,
    openingEquityUsd: equity,
    equityUsd: equity,
    peakEquityUsd: equity,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    openInterestUsd: 0,
    openRiskUsd: 0,
    drawdownPct: 0,
    guardMode: "BLOCK_LIVE",
    lastNote: "Loop idle",
    dataSource: "SIMULATED",
    quoteProvider: null,
    quoteAgeSec: null,
    feedError: null,
    positions: [],
  };
}

export function getLoopState(): LoopState {
  const smart = getSmartConfig();
  const stored = portableGetJson<Partial<LoopState>>(LOOP_STATE_KEY, {});
  return {
    ...defaultLoopState(smart.initialEquityUsd),
    ...stored,
    positions: Array.isArray(stored.positions) ? stored.positions : [],
  };
}

function write(next: LoopState) {
  portableSetJson(LOOP_STATE_KEY, next);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LOOP_EVENT));
}

function patch(p: Partial<LoopState>) {
  const next = { ...getLoopState(), ...p };
  write(next);
  return next;
}

/* ------------------------------------------------------------------ *
 * Guard contract — mirrors MockDataGuardEngine.assert_safe_for_live_order
 * ------------------------------------------------------------------ */

export interface GuardVerdict {
  simulated: boolean;
  allowLive: boolean;
  reason: string;
}

export function evaluateGuard(guard: GuardConfig, snapshotAgeSec: number): GuardVerdict {
  if (!guard.enabled) {
    return { simulated: false, allowLive: true, reason: "Guard disabled — no contract enforced" };
  }
  const stale = snapshotAgeSec > guard.maxSnapshotAgeSec;
  if (guard.mode === "SIMULATION") {
    return { simulated: true, allowLive: false, reason: "SIMULATION mode — paper only" };
  }
  if (stale) {
    return {
      simulated: true,
      allowLive: false,
      reason: `Snapshot stale (${Number.isFinite(snapshotAgeSec) ? snapshotAgeSec.toFixed(1) : "∞"}s > ${guard.maxSnapshotAgeSec}s)`,
    };
  }
  if (guard.mode === "BLOCK_LIVE") {
    return {
      simulated: guard.blockLiveOnSimulated,
      allowLive: false,
      reason: "BLOCK_LIVE — live orders rejected, decisions recorded as paper",
    };
  }
  return { simulated: false, allowLive: true, reason: "LIVE_STRICT — fresh verified snapshot" };
}

/* ------------------------------------------------------------------ *
 * Position book
 * ------------------------------------------------------------------ */

function markPositions(positions: LoopPosition[], prices: Record<string, number>): LoopPosition[] {
  return positions.map((p) => {
    const lastPrice = prices[p.symbol] ?? p.lastPrice;
    return {
      ...p,
      lastPrice,
      unrealizedUsd: Number(((lastPrice - p.avgPrice) * p.qty).toFixed(2)),
      notionalUsd: Number(Math.abs(lastPrice * p.qty).toFixed(2)),
    };
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ *
 * Loop engine
 * ------------------------------------------------------------------ */

let fastTimer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

function runSlowCycle() {
  const smart = getSmartConfig();
  // Slow loop = AI sentiment refresh; drifts smoothly towards a new reading.
  const prev = getLoopState().aiScore;
  const target = 30 + Math.random() * 60;
  const aiScore = Number((prev * 0.4 + target * 0.6).toFixed(1));
  patch({
    aiScore,
    slowCycles: getLoopState().slowCycles + 1,
    lastSlowAt: new Date().toISOString(),
    phase: "SLOW_AI",
    lastNote: `Slow AI cycle (${smart.routerMode}) → sentiment ${aiScore}`,
  });
}

async function runFastTick() {
  if (ticking) return;
  if (isKilled()) {
    stopDualLoop("Kill-switch engaged — loop halted");
    return;
  }
  ticking = true;
  try {
    const smart: SmartLlmConfig = getSmartConfig();
    const guard = getGuardConfig();
    const s = getLoopState();

    // ---- 1. real market data from quotes_router --------------------------
    const feed = await fetchQuotes(UNIVERSE);
    const prices: Record<string, number> = {};
    let provider: string | null = null;
    Object.values(feed.quotes).forEach((q: LiveQuote) => {
      if (q?.price > 0) {
        prices[q.symbol] = q.price;
        pushPrice(q.symbol, q.price);
        provider = provider ?? q.provider;
      }
    });
    const liveSymbols = Object.keys(prices);
    const live = feed.ok && liveSymbols.length > 0;

    const symbol =
      (live ? liveSymbols[Math.floor(Math.random() * liveSymbols.length)] : undefined) ??
      UNIVERSE[Math.floor(Math.random() * UNIVERSE.length)] ??
      "AAPL";

    // No live feed → treat the snapshot as infinitely stale so the guard
    // downgrades the tick instead of us inventing a price.
    const snapshotAgeSec = live ? feed.ageSec : Number.POSITIVE_INFINITY;
    const verdict = evaluateGuard(guard, snapshotAgeSec);

    // ---- 2. scoring -------------------------------------------------------
    const technical = live ? (momentumScore(symbol) ?? 50) : 35 + Math.random() * 60;
    const micha = live
      ? Math.max(0, Math.min(100, 50 + (feed.quotes[symbol]?.change_pct ?? 0) * 8))
      : 35 + Math.random() * 60;
    const ai = s.aiScore;
    const final =
      technical * smart.weightTechnical + micha * smart.weightMicha + ai * smart.weightAi;

    const price = prices[symbol] ?? 0;
    const atr14 = (live ? estimateAtr(symbol) : null) ?? 1.2 + Math.random() * 4;
    const { varUsd } = atrVarUsd(smart, atr14);

    // ---- 3. mark existing book to market ---------------------------------
    let positions = markPositions(s.positions, prices);

    const breaker = s.drawdownPct >= smart.maxDrawdownPct;

    let action: "BUY" | "SELL" | "HOLD" | "BLOCKED";
    let realized = 0;
    let note: string;
    const feedTag = live ? `live:${provider ?? "quotes_router"}` : "no-feed";

    if (breaker) {
      action = "BLOCKED";
      note = `Circuit breaker — drawdown ${s.drawdownPct.toFixed(2)}% ≥ ${smart.maxDrawdownPct}%`;
    } else if (
      guard.enabled &&
      guard.blockLiveOnSimulated &&
      verdict.simulated &&
      guard.mode !== "SIMULATION" &&
      !live
    ) {
      action = "BLOCKED";
      note = `Mock data guard: ${verdict.reason} (${feed.error ?? "quotes_router unreachable"})`;
    } else if (final >= smart.minScore && price > 0) {
      action = "BUY";
      const qty = Number((varUsd / Math.max(atr14 * smart.atrStopMultiple, 0.01)).toFixed(4));
      const existing = positions.find((p) => p.symbol === symbol);
      if (existing) {
        const newQty = existing.qty + qty;
        existing.avgPrice = Number(
          ((existing.avgPrice * existing.qty + price * qty) / (newQty || 1)).toFixed(4),
        );
        existing.qty = Number(newQty.toFixed(4));
        existing.lastPrice = price;
      } else {
        positions.push({
          symbol,
          qty,
          avgPrice: price,
          lastPrice: price,
          unrealizedUsd: 0,
          notionalUsd: Number((price * qty).toFixed(2)),
          openedAt: new Date().toISOString(),
          simulated: verdict.simulated,
        });
      }
      note = `${verdict.simulated ? "Paper" : "Live"} entry ${qty} ${symbol} @ ${price.toFixed(2)} · ${feedTag} · ${verdict.reason}`;
    } else if (final <= 100 - smart.minScore && price > 0) {
      const open = positions.find((p) => p.symbol === symbol);
      if (open) {
        action = "SELL";
        realized = Number(((price - open.avgPrice) * open.qty).toFixed(2));
        positions = positions.filter((p) => p.symbol !== symbol);
        note = `Exit ${symbol} @ ${price.toFixed(2)} → realized ${realized >= 0 ? "+" : ""}${realized} · ${feedTag}`;
      } else {
        action = "HOLD";
        note = `Bearish score ${final.toFixed(1)} but no open ${symbol} position`;
      }
    } else {
      action = "HOLD";
      note = price > 0
        ? `Below threshold (${final.toFixed(1)} < ${smart.minScore}) · ${feedTag}`
        : `No verified price for ${symbol} — holding (${feedTag})`;
    }

    positions = markPositions(positions, prices);
    const unrealizedPnlUsd = Number(sum(positions.map((p) => p.unrealizedUsd)).toFixed(2));
    const openInterestUsd = Number(sum(positions.map((p) => p.notionalUsd)).toFixed(2));

    const realizedTotal = Number((s.realizedPnlUsd + realized).toFixed(2));
    const equityUsd = Number((s.openingEquityUsd + realizedTotal + unrealizedPnlUsd).toFixed(2));
    const peakEquityUsd = Math.max(s.peakEquityUsd, equityUsd);
    const drawdownPct = peakEquityUsd > 0 ? ((peakEquityUsd - equityUsd) / peakEquityUsd) * 100 : 0;
    const trippedNow = !breaker && drawdownPct >= smart.maxDrawdownPct;

    recordRun({
      symbol,
      action,
      finalScore: Number(final.toFixed(1)),
      technicalScore: Number(technical.toFixed(1)),
      michaScore: Number(micha.toFixed(1)),
      aiScore: Number(ai.toFixed(1)),
      atrVarUsd: Number(varUsd.toFixed(2)),
      equityUsd,
      drawdownPct: Number(drawdownPct.toFixed(2)),
      breaker: breaker || trippedNow,
      simulated: verdict.simulated,
      note,
    });

    const next = patch({
      ticks: s.ticks + 1,
      decisions: s.decisions + (action === "BUY" || action === "SELL" ? 1 : 0),
      blocked: s.blocked + (action === "BLOCKED" ? 1 : 0),
      holds: s.holds + (action === "HOLD" ? 1 : 0),
      breakerTrips: s.breakerTrips + (trippedNow ? 1 : 0),
      equityUsd,
      peakEquityUsd,
      realizedPnlUsd: realizedTotal,
      unrealizedPnlUsd,
      openInterestUsd,
      openRiskUsd: Number(varUsd.toFixed(2)),
      drawdownPct: Number(drawdownPct.toFixed(2)),
      guardMode: guard.mode,
      lastTickAt: new Date().toISOString(),
      phase: breaker || trippedNow ? "BREAKER" : action === "BLOCKED" ? "BLOCKED" : "FAST_EXEC",
      lastNote: note,
      dataSource: live ? "LIVE" : "SIMULATED",
      quoteProvider: live ? provider : null,
      quoteAgeSec: live ? Number(feed.ageSec.toFixed(1)) : null,
      feedError: live ? null : (feed.error ?? "quotes_router unavailable"),
      positions,
    });

    if ((breaker || trippedNow) && !smart.autoResetBreaker) stopDualLoop("Circuit breaker halted the loop");
    else if (next.phase === "BREAKER" && smart.autoResetBreaker) {
      patch({ peakEquityUsd: equityUsd, drawdownPct: 0, lastNote: "Breaker auto-reset" });
    }
  } finally {
    ticking = false;
  }
}

export function isLoopRunning(): boolean {
  return fastTimer !== null;
}

/** One-click start of the dual loop. */
export function startDualLoop(reset = false): LoopState {
  if (isKilled()) {
    return patch({ running: false, phase: "BLOCKED", lastNote: "Kill-switch engaged — cannot arm the loop" });
  }
  const smart = getSmartConfig();
  stopTimers();
  const base = reset ? defaultLoopState(smart.initialEquityUsd) : getLoopState();
  const state = patch({
    ...base,
    running: true,
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    phase: "SLOW_AI",
    guardMode: getGuardConfig().mode,
    lastNote: `Dual loop armed — slow ${smart.slowLoopSec}s / fast ${smart.fastLoopMs}ms`,
  });

  runSlowCycle();
  void runFastTick();
  slowTimer = setInterval(runSlowCycle, Math.max(5, smart.slowLoopSec) * 1000);
  fastTimer = setInterval(() => void runFastTick(), Math.max(1000, smart.fastLoopMs));
  return state;
}

function stopTimers() {
  if (fastTimer) clearInterval(fastTimer);
  if (slowTimer) clearInterval(slowTimer);
  fastTimer = null;
  slowTimer = null;
}

export function stopDualLoop(note = "Loop stopped by operator"): LoopState {
  stopTimers();
  return patch({
    running: false,
    phase: "IDLE",
    stoppedAt: new Date().toISOString(),
    lastNote: note,
  });
}

export function resetLedger(): LoopState {
  stopTimers();
  const state = defaultLoopState(getSmartConfig().initialEquityUsd);
  write(state);
  return state;
}

/** React binding. */
export function useLoopState(): LoopState {
  const [state, setState] = useState<LoopState>(defaultLoopState());
  useEffect(() => {
    setState(getLoopState());
    const onChange = () => setState(getLoopState());
    window.addEventListener(LOOP_EVENT, onChange);
    return () => window.removeEventListener(LOOP_EVENT, onChange);
  }, []);
  return state;
}
