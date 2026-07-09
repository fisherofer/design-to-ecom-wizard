/**
 * Refresh Intervals
 * =================
 * Centralized control over how often each data-driven widget refetches.
 * Stores per-component overrides + a global default in localStorage so the
 * user can tune the entire app from Settings → Refresh.
 *
 * Usage in a component:
 *   const ms = useRefreshInterval("ticker");
 *   useEffect(() => { const id = setInterval(fetch, ms); return () => clearInterval(id); }, [ms]);
 */
import { useEffect, useState } from "react";
import { scaleForPhase } from "./marketPhase";

const STORAGE_KEY = "ai-os.refresh.v1";
const EVENT = "ai-os:refresh-changed";

export type ComponentId =
  | "ticker"
  | "kpi"
  | "fearGreed"
  | "logs"
  | "agents"
  | "intelligence"
  | "rateLimits"
  | "ollama"
  | "news"
  | "breakouts";

export interface RefreshConfig {
  /** Global default in milliseconds, used when a component has no override. */
  globalMs: number;
  /** Per-component overrides. 0 = paused, undefined = use global. */
  overrides: Partial<Record<ComponentId, number>>;
  /**
   * When true, the smart engine scales the effective interval based on the
   * current market phase (regular / pre / post / closed) with a 90/5/5 budget.
   */
  smart: boolean;
}

export const COMPONENT_META: Record<ComponentId, { label: string; description: string }> = {
  ticker: { label: "Market Ticker", description: "Live price tape on the dashboard" },
  kpi: { label: "KPI Cards", description: "Headline metrics on the home view" },
  fearGreed: { label: "Fear & Greed", description: "Sentiment gauge" },
  logs: { label: "System Logs", description: "Tail of structured logs" },
  agents: { label: "Agents Status", description: "Agent health & queue" },
  intelligence: { label: "Intelligence Feed", description: "AI-generated alerts" },
  rateLimits: { label: "Rate Limits", description: "API key usage snapshot" },
  ollama: { label: "Ollama Models", description: "Local model registry" },
  news: { label: "Hot News", description: "Market-moving headlines" },
  breakouts: { label: "Breakout Candidates", description: "AI-scored breakout picks" },
};

export const PRESETS = [
  { label: "1s", ms: 1_000 },
  { label: "5s", ms: 5_000 },
  { label: "15s", ms: 15_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "Paused", ms: 0 },
];

const DEFAULT: RefreshConfig = { globalMs: 30_000, overrides: {}, smart: true };

function read(): RefreshConfig {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { globalMs: parsed.globalMs ?? DEFAULT.globalMs, overrides: parsed.overrides ?? {} };
  } catch {
    return DEFAULT;
  }
}

function write(cfg: RefreshConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const refreshConfig = {
  get: read,
  setGlobal(ms: number) {
    const cur = read();
    write({ ...cur, globalMs: ms });
  },
  setOverride(id: ComponentId, ms: number | undefined) {
    const cur = read();
    const next = { ...cur.overrides };
    if (ms === undefined) delete next[id];
    else next[id] = ms;
    write({ ...cur, overrides: next });
  },
  effective(id: ComponentId): number {
    const cur = read();
    return cur.overrides[id] ?? cur.globalMs;
  },
  reset() {
    write(DEFAULT);
  },
  exportJson(): string {
    return JSON.stringify(read(), null, 2);
  },
  importJson(json: string) {
    const parsed = JSON.parse(json);
    write({ globalMs: parsed.globalMs ?? DEFAULT.globalMs, overrides: parsed.overrides ?? {} });
  },
};

/** React hook — re-renders when the user changes intervals from Settings. */
export function useRefreshInterval(id: ComponentId): number {
  const [ms, setMs] = useState(() => refreshConfig.effective(id));
  useEffect(() => {
    const sync = () => setMs(refreshConfig.effective(id));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [id]);
  return ms;
}

export function useRefreshConfig(): RefreshConfig {
  const [cfg, setCfg] = useState<RefreshConfig>(() => read());
  useEffect(() => {
    const sync = () => setCfg(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return cfg;
}
