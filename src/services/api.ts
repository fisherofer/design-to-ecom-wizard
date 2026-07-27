// Path: src/services/api.ts
// Role: Core API Bridge to the local QuantEngine FastAPI backend (:8000).
// Separate from src/lib/api.ts which targets the AI Executive OS bridge (:8050).
//
// All endpoints are unauthenticated on localhost. Do NOT include API keys
// in requests from here — the backend proxies to Alpaca / OpenAI / Ollama
// using keys stored server-side in .env (encrypted at rest).

import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from "axios";
import { getQuantApiBase } from "@/lib/apiConfig";

const MAX_RETRIES = 3;

export const apiClient: AxiosInstance = axios.create({
  baseURL: getQuantApiBase(),
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Rewrite baseURL on every request so runtime updates via setQuantApiBase()
// take effect without recreating the axios client.
apiClient.interceptors.request.use((config) => {
  config.baseURL = getQuantApiBase();
  return config;
});

apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, config.data || "");
    return config;
  },
  (error: AxiosError) => {
    console.error("[API Request Error]", error.message);
    return Promise.reject(error);
  },
);

apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const config = error.config as (typeof error.config & { retryCount?: number }) | undefined;
    if (!config) return Promise.reject(error);

    config.retryCount = config.retryCount ?? 0;
    if (config.retryCount < MAX_RETRIES && (!error.response || error.response.status >= 500)) {
      config.retryCount += 1;
      console.warn(`[API Retry] ${config.url} attempt ${config.retryCount}/${MAX_RETRIES}`);
      await new Promise((resolve) =>
        setTimeout(resolve, 500 * Math.pow(2, (config.retryCount ?? 1) - 1)),
      );
      return apiClient(config);
    }

    console.error(`[API Final Error] ${config.url}: ${error.message}`);
    return Promise.reject(error);
  },
);

// ============================================================
// Type contracts — aligned with CLAUDE-FINAL backend models.
// ============================================================

export interface SystemHealth {
  status: "ok" | "degraded" | "down";
  ollama: { online: boolean; models: string[]; latency_ms?: number };
  cloud: { openai: boolean; anthropic: boolean; google: boolean };
  backend_version?: string;
  uptime_s?: number;
}

export type AgentStatus = "idle" | "running" | "error" | "starting" | "stopping";

export interface Agent {
  id: string;
  name: string;
  kind: "goose" | "market-brain" | "news-scanner" | "risk-guard" | "custom";
  status: AgentStatus;
  model?: string;
  pid?: number;
  last_thought?: string;
  started_at?: string;
  metrics?: { cpu?: number; mem_mb?: number; tokens_used?: number };
}

export interface GitRepoEntry {
  name: string;
  path: string;
  language?: string;
  stars?: number;
  extracted_patterns: string[];
  last_scanned?: string;
  summary?: string;
}

export interface DriveDocument {
  path: string;
  name: string;
  kind: "md" | "yaml" | "json" | "other";
  size: number;
  modified: string;
}

export interface TradePayload {
  symbol: string;
  direction: "buy" | "sell";
  quantity: number;
  confidence: number;
}

export interface PortfolioSnapshot {
  equity: number;
  cash: number;
  pnl_day: number;
  pnl_day_pct: number;
  positions: Array<{
    symbol: string;
    qty: number;
    avg_price: number;
    last_price: number;
    unrealized: number;
  }>;
}

// ============================================================
// Services
// ============================================================

export const HealthService = {
  checkStatus: async (): Promise<SystemHealth> => {
    const r = await apiClient.get<SystemHealth>("/health");
    return r.data;
  },
};

export const TradingService = {
  executeTrade: async (p: TradePayload) => {
    const r = await apiClient.post("/api/trade", p);
    return r.data;
  },
  getPortfolio: async (): Promise<PortfolioSnapshot> => {
    const r = await apiClient.get<PortfolioSnapshot>("/api/portfolio");
    return r.data;
  },
};

export const AgentsService = {
  list: async (): Promise<Agent[]> => {
    const r = await apiClient.get<Agent[]>("/api/agents");
    return r.data;
  },
  start: async (id: string): Promise<Agent> => {
    const r = await apiClient.post<Agent>(`/api/agents/${encodeURIComponent(id)}/start`);
    return r.data;
  },
  stop: async (id: string): Promise<Agent> => {
    const r = await apiClient.post<Agent>(`/api/agents/${encodeURIComponent(id)}/stop`);
    return r.data;
  },
  configure: async (id: string, config: Record<string, unknown>): Promise<Agent> => {
    const r = await apiClient.patch<Agent>(`/api/agents/${encodeURIComponent(id)}`, config);
    return r.data;
  },
  /** Live log stream. Returns null if WS not available (SSR / unsupported env). */
  streamLogs: (id: string, onMessage: (line: string) => void): WebSocket | null => {
    if (typeof window === "undefined" || typeof WebSocket === "undefined") return null;
    const base = getQuantApiBase().replace(/^http/i, "ws");
    const ws = new WebSocket(`${base}/api/agents/${encodeURIComponent(id)}/logs`);
    ws.onmessage = (ev) => onMessage(typeof ev.data === "string" ? ev.data : String(ev.data));
    return ws;
  },
};

export const DriveService = {
  listGitRepos: async (): Promise<GitRepoEntry[]> => {
    const r = await apiClient.get<GitRepoEntry[]>("/api/drive/git-repos");
    return r.data;
  },
  listDocs: async (folder = "AI"): Promise<DriveDocument[]> => {
    const r = await apiClient.get<DriveDocument[]>("/api/drive/docs", { params: { folder } });
    return r.data;
  },
  readDoc: async (path: string): Promise<{ path: string; content: string; kind: string }> => {
    const r = await apiClient.get("/api/drive/doc", { params: { path } });
    return r.data;
  },
  triggerRescan: async (): Promise<{ started: boolean; job_id?: string }> => {
    const r = await apiClient.post("/api/drive/rescan");
    return r.data;
  },
};

// ============================================================
// Account — real brokerage state from /api/account (Alpaca paper).
// ============================================================

export interface AccountSummary {
  equity: number;
  buying_power: number;
  day_pnl: number;
  day_pnl_pct: number;
  maintenance_margin: number;
  cash: number;
  currency: string;
  account_status: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  is_simulated: boolean;
  source: string;
  as_of: string;
  error?: string;
}

export interface AccountHealth {
  credentials_present: boolean;
  base_url: string;
  trading_stage: string;
  http_client: string;
  checked_at: string;
}

export const AccountService = {
  getSummary: async (): Promise<AccountSummary> => {
    const r = await apiClient.get<AccountSummary>("/api/account/summary");
    return r.data;
  },
  getHealth: async (): Promise<AccountHealth> => {
    const r = await apiClient.get<AccountHealth>("/api/account/health");
    return r.data;
  },
};
