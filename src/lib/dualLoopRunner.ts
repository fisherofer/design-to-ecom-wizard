/**
 * dualLoopRunner — browser-side driver for smart_llm_execution_engine.py.
 *
 * Runs the two loops described by the Python engine:
 *   • slow loop  — AI sentiment refresh every `slowLoopSec`
 *   • fast loop  — technical evaluation / execution tick every `fastLoopMs`
 *
 * Every tick is filtered through the Mock Data Guard contract
 * (mock_data_guard_engine.py) before it may become a live decision, and the
 * HardRiskManager circuit breaker halts the loop on drawdown breach.
 *
 * State is persisted through portableStorage so a Portable Mode profile keeps
 * its bank balance and run history across restarts.
 */
import { useEffect, useState } from "react";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import {
  atrVarUsd,
  getGuardConfig,
  getSmartConfig,
  recordRun,
  type GuardConfig,
  type SmartLlmConfig,
} from "@/lib/engineConfig";

export const LOOP_STATE_KEY = "ofer.engines.dualloop.state.v1";
const LOOP_EVENT = "ofer:dual-loop-changed";

export type LoopPhase = "IDLE" | "SLOW_AI" | "FAST_EXEC" | "BLOCKED" | "BREAKER";

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
  openRiskUsd: number;
  drawdownPct: number;
  guardMode: GuardConfig["mode"];
  lastNote: string;
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
    openRiskUsd: 0,
    drawdownPct: 0,
    guardMode: "BLOCK_LIVE",
    lastNote: "Loop idle",
  };
}

export function getLoopState(): LoopState {
  const smart = getSmartConfig();
  return {
    ...defaultLoopState(smart.initialEquityUsd),
    ...portableGetJson<Partial<LoopState>>(LOOP_STATE_KEY, {}),
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
      reason: `Snapshot stale (${snapshotAgeSec.toFixed(1)}s > ${guard.maxSnapshotAgeSec}s)`,
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
 * Loop engine
 * ------------------------------------------------------------------ */

let fastTimer: ReturnType<typeof setInterval> | null = null;
let slowTimer: ReturnType<typeof setInterval> | null = null;

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

function runFastTick() {
  const smart: SmartLlmConfig = getSmartConfig();
  const guard = getGuardConfig();
  const s = getLoopState();

  const symbol = UNIVERSE[Math.floor(Math.random() * UNIVERSE.length)] ?? "AAPL";
  const snapshotAgeSec = Math.random() * guard.maxSnapshotAgeSec * 1.6;
  const verdict = evaluateGuard(guard, snapshotAgeSec);

  const technical = 35 + Math.random() * 60;
  const micha = 35 + Math.random() * 60;
  const ai = s.aiScore;
  const final =
    technical * smart.weightTechnical + micha * smart.weightMicha + ai * smart.weightAi;

  const atr14 = 1.2 + Math.random() * 4;
  const { varUsd } = atrVarUsd(smart, atr14);

  // Circuit breaker on drawdown.
  const breaker = s.drawdownPct >= smart.maxDrawdownPct;

  let action: "BUY" | "SELL" | "HOLD" | "BLOCKED";
  let pnl = 0;
  let note: string;

  if (breaker) {
    action = "BLOCKED";
    note = `Circuit breaker — drawdown ${s.drawdownPct.toFixed(2)}% ≥ ${smart.maxDrawdownPct}%`;
  } else if (guard.enabled && guard.blockLiveOnSimulated && verdict.simulated && guard.mode !== "SIMULATION") {
    action = "BLOCKED";
    note = `Mock data guard: ${verdict.reason}`;
  } else if (final >= smart.minScore) {
    action = "BUY";
    // Paper P&L: ATR target vs stop with the configured multiples.
    const win = Math.random() < 0.5 + (final - smart.minScore) / 200;
    pnl = win
      ? (varUsd * smart.atrTargetMultiple) / smart.atrStopMultiple
      : -varUsd;
    note = `${verdict.simulated ? "Paper" : "Live"} entry @ score ${final.toFixed(1)} · ${verdict.reason}`;
  } else if (final <= 100 - smart.minScore) {
    action = "SELL";
    pnl = Math.random() < 0.5 ? varUsd * 0.6 : -varUsd * 0.8;
    note = `Exit signal @ score ${final.toFixed(1)}`;
  } else {
    action = "HOLD";
    note = `Below threshold (${final.toFixed(1)} < ${smart.minScore})`;
  }

  const equityUsd = s.equityUsd + pnl;
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
    realizedPnlUsd: Number((equityUsd - s.openingEquityUsd).toFixed(2)),
    openRiskUsd: Number(varUsd.toFixed(2)),
    drawdownPct: Number(drawdownPct.toFixed(2)),
    guardMode: guard.mode,
    lastTickAt: new Date().toISOString(),
    phase: breaker || trippedNow ? "BREAKER" : action === "BLOCKED" ? "BLOCKED" : "FAST_EXEC",
    lastNote: note,
  });

  if ((breaker || trippedNow) && !smart.autoResetBreaker) stopDualLoop("Circuit breaker halted the loop");
  else if (next.phase === "BREAKER" && smart.autoResetBreaker) {
    patch({ peakEquityUsd: equityUsd, drawdownPct: 0, lastNote: "Breaker auto-reset" });
  }
}

export function isLoopRunning(): boolean {
  return fastTimer !== null;
}

/** One-click start of the dual loop. */
export function startDualLoop(reset = false): LoopState {
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
  slowTimer = setInterval(runSlowCycle, Math.max(5, smart.slowLoopSec) * 1000);
  fastTimer = setInterval(runFastTick, Math.max(250, smart.fastLoopMs));
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
