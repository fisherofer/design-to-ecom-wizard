/**
 * engineConfig — runtime configuration + run telemetry for the two Python
 * engines imported from the backup:
 *
 *   • mock_data_guard_engine.py    — simulated-data contract / live-order guard
 *   • smart_llm_execution_engine.py — dual-loop (slow AI, fast execution) + circuit breaker
 *
 * Everything is persisted through portableStorage, so the profile travels with
 * the desktop (SQLite) build and falls back to localStorage in the browser.
 */
import { useCallback, useEffect, useState } from "react";
import {
  portableGetJson,
  portableSetJson,
  portableGet,
  portableSet,
} from "@/lib/portableStorage";

export const GUARD_KEY = "ofer.engines.mock-data-guard.v1";
export const SMART_KEY = "ofer.engines.smart-llm.v1";
export const RUNS_KEY = "ofer.engines.smart-llm.runs.v1";
export const SEED_KEY = "ofer.engines.seeded.v1";
const EVENT = "ofer:engine-config-changed";

/** Execution mode enforced by MockDataGuardEngine.assert_safe_for_live_order. */
export type GuardMode = "SIMULATION" | "BLOCK_LIVE" | "LIVE_STRICT";

export interface GuardConfig {
  enabled: boolean;
  mode: GuardMode;
  /** Max seconds a cached snapshot may be stale before it is flagged simulated. */
  maxSnapshotAgeSec: number;
  /** Refuse live orders when the payload carries is_simulated=true. */
  blockLiveOnSimulated: boolean;
  /** Pull the active watchlist from the engine SQLite DB instead of the UI list. */
  useDynamicWatchlist: boolean;
}

export interface SmartLlmConfig {
  enabled: boolean;
  /** Slow loop — AI sentiment refresh. */
  slowLoopSec: number;
  /** Fast loop — technical evaluation / execution tick. */
  fastLoopMs: number;
  /** Weights for the blended final score (technical / micha / ai). */
  weightTechnical: number;
  weightMicha: number;
  weightAi: number;
  /** Minimum blended score required to emit a BUY ticket. */
  minScore: number;
  /** Router preference for the slow loop. */
  routerMode: "local-first" | "cloud-first" | "local-only" | "cloud-only";
  ollamaEndpoint: string;
  /** Risk / circuit breaker policy (HardRiskManager). */
  initialEquityUsd: number;
  maxDrawdownPct: number;
  riskPerTradePct: number;
  atrStopMultiple: number;
  atrTargetMultiple: number;
  maxOpenPositions: number;
  cooldownMin: number;
  autoResetBreaker: boolean;
}

export interface EngineRun {
  id: string;
  ts: string;
  symbol: string;
  action: "BUY" | "SELL" | "HOLD" | "BLOCKED";
  finalScore: number;
  technicalScore: number;
  michaScore: number;
  aiScore: number;
  atrVarUsd: number;
  equityUsd: number;
  drawdownPct: number;
  breaker: boolean;
  simulated: boolean;
  note?: string;
}

export const DEFAULT_GUARD: GuardConfig = {
  enabled: true,
  mode: "BLOCK_LIVE",
  maxSnapshotAgeSec: 30,
  blockLiveOnSimulated: true,
  useDynamicWatchlist: true,
};

export const DEFAULT_SMART: SmartLlmConfig = {
  enabled: false,
  slowLoopSec: 300,
  fastLoopMs: 250,
  weightTechnical: 0.4,
  weightMicha: 0.35,
  weightAi: 0.25,
  minScore: 70,
  routerMode: "local-first",
  ollamaEndpoint: "http://127.0.0.1:11434/api/generate",
  initialEquityUsd: 100000,
  maxDrawdownPct: 5,
  riskPerTradePct: 1,
  atrStopMultiple: 1.5,
  atrTargetMultiple: 3,
  maxOpenPositions: 5,
  cooldownMin: 30,
  autoResetBreaker: false,
};

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

export function getGuardConfig(): GuardConfig {
  return { ...DEFAULT_GUARD, ...portableGetJson<Partial<GuardConfig>>(GUARD_KEY, {}) };
}
export function setGuardConfig(cfg: GuardConfig) {
  portableSetJson(GUARD_KEY, cfg);
  emit();
}
export function getSmartConfig(): SmartLlmConfig {
  return { ...DEFAULT_SMART, ...portableGetJson<Partial<SmartLlmConfig>>(SMART_KEY, {}) };
}
export function setSmartConfig(cfg: SmartLlmConfig) {
  portableSetJson(SMART_KEY, cfg);
  emit();
}

export function getRuns(): EngineRun[] {
  return portableGetJson<EngineRun[]>(RUNS_KEY, []);
}

export function recordRun(run: Omit<EngineRun, "id" | "ts"> & Partial<Pick<EngineRun, "ts">>) {
  const entry: EngineRun = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: run.ts ?? new Date().toISOString(),
    ...run,
  } as EngineRun;
  const next = [entry, ...getRuns()].slice(0, 300);
  portableSetJson(RUNS_KEY, next);
  emit();
  return entry;
}

export function clearRuns() {
  portableSetJson(RUNS_KEY, []);
  emit();
}

/** Aggregate view for the status dashboard. */
export function summarizeRuns(runs: EngineRun[]) {
  const total = runs.length;
  const decisions = runs.filter((r) => r.action === "BUY" || r.action === "SELL").length;
  const blocked = runs.filter((r) => r.action === "BLOCKED").length;
  const breakerHits = runs.filter((r) => r.breaker).length;
  const avgVar = total ? runs.reduce((s, r) => s + r.atrVarUsd, 0) / total : 0;
  const maxDd = runs.reduce((m, r) => Math.max(m, r.drawdownPct), 0);
  const last = runs[0] ?? null;
  return { total, decisions, blocked, breakerHits, avgVar, maxDd, last };
}

/** Position-size / VaR helper mirroring HardRiskManager.create_execution_ticket. */
export function atrVarUsd(cfg: SmartLlmConfig, atr14: number) {
  const riskUsd = (cfg.initialEquityUsd * cfg.riskPerTradePct) / 100;
  const stopDistance = atr14 * cfg.atrStopMultiple;
  const shares = stopDistance > 0 ? Math.floor(riskUsd / stopDistance) : 0;
  return { riskUsd, stopDistance, shares, varUsd: shares * stopDistance };
}

/* ------------------------------------------------------------------ *
 * Automatic import of the engine settings + tests captured in backup
 * ------------------------------------------------------------------ */

const ENGINE_SOURCES = import.meta.glob(
  [
    "/src/assets/backend/mock_data_guard_engine.py",
    "/src/assets/backend/smart_llm_execution_engine.py",
    "/src/assets/backend/tests/test_mock_data_guard.py",
    "/src/assets/backend/tests/test_smart_llm_execution_engine.py",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

export interface SeedResult {
  seeded: boolean;
  files: Array<{ path: string; bytes: number; kind: "engine" | "test" }>;
  configs: string[];
}

/**
 * Copies default engine configs and the captured Python engine/test sources
 * into the Portable Data profile. Idempotent — pass force to re-import.
 */
export function importEngineProfile(force = false): SeedResult {
  const already = portableGet(SEED_KEY);
  const files: SeedResult["files"] = [];
  const configs: string[] = [];

  if (!already || force) {
    if (force || !portableGet(GUARD_KEY)) {
      portableSetJson(GUARD_KEY, DEFAULT_GUARD);
      configs.push(GUARD_KEY);
    }
    if (force || !portableGet(SMART_KEY)) {
      portableSetJson(SMART_KEY, DEFAULT_SMART);
      configs.push(SMART_KEY);
    }
    for (const [path, code] of Object.entries(ENGINE_SOURCES)) {
      const kind = path.includes("/tests/") ? "test" : "engine";
      portableSet(`ofer.engines.source.${path.split("/").pop()}`, code);
      files.push({ path, bytes: code.length, kind });
    }
    portableSet(SEED_KEY, new Date().toISOString());
    emit();
    return { seeded: true, files, configs };
  }

  for (const [path, code] of Object.entries(ENGINE_SOURCES)) {
    files.push({ path, bytes: code.length, kind: path.includes("/tests/") ? "test" : "engine" });
  }
  return { seeded: false, files, configs };
}

export function seededAt(): string | null {
  return portableGet(SEED_KEY);
}

/* ------------------------------- hooks ------------------------------- */

function useEngineStore<T>(read: () => T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    setValue(read());
    const onChange = () => setValue(read());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [value, setValue];
}

export function useGuardConfig(): [GuardConfig, (patch: Partial<GuardConfig>) => void] {
  const [cfg, setCfg] = useEngineStore(getGuardConfig);
  const patch = useCallback(
    (p: Partial<GuardConfig>) => {
      const next = { ...getGuardConfig(), ...p };
      setGuardConfig(next);
      setCfg(next);
    },
    [setCfg],
  );
  return [cfg, patch];
}

export function useSmartConfig(): [SmartLlmConfig, (patch: Partial<SmartLlmConfig>) => void] {
  const [cfg, setCfg] = useEngineStore(getSmartConfig);
  const patch = useCallback(
    (p: Partial<SmartLlmConfig>) => {
      const next = { ...getSmartConfig(), ...p };
      setSmartConfig(next);
      setCfg(next);
    },
    [setCfg],
  );
  return [cfg, patch];
}

export function useEngineRuns(): EngineRun[] {
  const [runs] = useEngineStore(getRuns);
  return runs;
}

/** Downloadable log payload (config snapshot + every recorded run). */
export function buildLogBundle() {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      guard: getGuardConfig(),
      smartLlm: getSmartConfig(),
      summary: summarizeRuns(getRuns()),
      runs: getRuns(),
    },
    null,
    2,
  );
}

export function buildLogCsv() {
  const rows = getRuns();
  const head =
    "ts,symbol,action,final,technical,micha,ai,atr_var_usd,equity,drawdown_pct,breaker,simulated,note";
  return [
    head,
    ...rows.map((r) =>
      [
        r.ts,
        r.symbol,
        r.action,
        r.finalScore,
        r.technicalScore,
        r.michaScore,
        r.aiScore,
        r.atrVarUsd.toFixed(2),
        r.equityUsd.toFixed(2),
        r.drawdownPct.toFixed(2),
        r.breaker ? 1 : 0,
        r.simulated ? 1 : 0,
        (r.note ?? "").replace(/,/g, ";"),
      ].join(","),
    ),
  ].join("\n");
}
