/**
 * AI Executive OS — Local API Bridge
 * ==================================
 * All requests target the local Python backend at http://localhost:8000.
 * If the backend is unreachable, mock data is returned so the UI stays alive.
 *
 * Backend contract (FastAPI / api_bridge.py):
 *   GET  /health
 *   GET  /system/status
 *   GET  /system/telemetry
 *   GET  /vault/keys
 *   POST /vault/keys
 *   GET  /config/params
 *   POST /config/params/:key            (Safe-Change Workflow)
 *   GET  /strategies
 *   POST /strategies/:id/toggle
 *   GET  /intelligence/feed
 *   GET  /intelligence/narratives
 *   GET  /agents
 *   GET  /logs?level=&limit=
 *   POST /chat                          (streams Gemini / Ollama / Claude)
 *   POST /docker/restart
 *   POST /docker/update
 *   POST /npm/check
 *   POST /npm/install
 */

export const API_BASE =
  (typeof window !== "undefined" && (window as any).__API_BASE__) ||
  "http://localhost:8000";

const DEFAULT_TIMEOUT_MS = 8_000;

async function request<T>(
  path: string,
  init: RequestInit = {},
  fallback?: T,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// -------------------- Types --------------------
export type EngineId = "gemini" | "ollama" | "groq" | "claude" | "perplexity";

export interface SystemStatus {
  cloudEngine: { id: EngineId; label: string; online: boolean };
  localEngine: { id: EngineId; label: string; online: boolean };
  dbConnected: boolean;
  latencyMs: number;
  docker: { running: boolean; version: string };
  npm: { installed: boolean; version: string };
}

export interface ApiKey {
  id: string;
  provider: string;
  type: "LLM" | "Data" | "Broker";
  maskedKey: string;
  tier: string;
  status: "ok" | "warn" | "err";
}

export interface ConfigParam {
  key: string;
  value: string;
  category: string;
  confidence: number;
  editable: boolean;
}

export interface LogEntry {
  ts: string;
  level: "ERROR" | "WARN" | "INFO" | "DEBUG";
  source: string;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  engine?: EngineId;
  ts: number;
}

// -------------------- API surface --------------------
export const api = {
  // System
  health: () => request<{ ok: boolean }>("/health", {}, { ok: false }),

  systemStatus: () =>
    request<SystemStatus>("/system/status", {}, {
      cloudEngine: { id: "gemini", label: "Gemini 1.5 Pro", online: true },
      localEngine: { id: "ollama", label: "Ollama 8B", online: true },
      dbConnected: true,
      latencyMs: 12,
      docker: { running: true, version: "27.3.1" },
      npm: { installed: true, version: "10.8.2" },
    }),

  // Vault
  listKeys: () =>
    request<ApiKey[]>("/vault/keys", {}, []),
  addKey: (k: Omit<ApiKey, "id" | "status">) =>
    request<ApiKey>("/vault/keys", { method: "POST", body: JSON.stringify(k) }),

  // Config (Safe-Change Workflow)
  listParams: () => request<ConfigParam[]>("/config/params", {}, []),
  applyParamChange: (key: string, value: string, approvalToken: string) =>
    request<{ ok: boolean; snapshotId: string }>(
      `/config/params/${encodeURIComponent(key)}`,
      {
        method: "POST",
        body: JSON.stringify({ value, approvalToken }),
      },
      { ok: true, snapshotId: `snap_${Date.now()}` },
    ),

  // Logs
  listLogs: (level?: string, limit = 200) =>
    request<LogEntry[]>(
      `/logs?limit=${limit}${level ? `&level=${level}` : ""}`,
      {},
      [],
    ),

  // Chat — Gemini / Ollama / Claude
  chat: (
    messages: ChatMessage[],
    engine: EngineId = "gemini",
  ): Promise<{ reply: string; engine: EngineId }> =>
    request(
      "/chat",
      { method: "POST", body: JSON.stringify({ messages, engine }) },
      {
        reply: mockReply(messages.at(-1)?.content ?? ""),
        engine,
      },
    ),

  // Infra controls (called from System Config UI)
  dockerRestart: () =>
    request<{ ok: boolean }>("/docker/restart", { method: "POST" }, { ok: true }),
  dockerUpdate: () =>
    request<{ ok: boolean; version: string }>(
      "/docker/update",
      { method: "POST" },
      { ok: true, version: "27.3.1" },
    ),
  npmCheck: () =>
    request<{ installed: boolean; version: string }>(
      "/npm/check",
      { method: "POST" },
      { installed: true, version: "10.8.2" },
    ),
  npmInstall: (pkg?: string) =>
    request<{ ok: boolean; log: string }>(
      "/npm/install",
      { method: "POST", body: JSON.stringify({ pkg }) },
      { ok: true, log: `mock install ${pkg ?? "all"} complete` },
    ),
};

function mockReply(prompt: string): string {
  if (!prompt) return "Connected to local Python backend (mock fallback).";
  if (/docker/i.test(prompt))
    return "Docker is running v27.3.1. Use the **System Config** panel to restart or update the stack.";
  if (/ollama|local/i.test(prompt))
    return "Local engine **Ollama 8B** is online at `http://localhost:11434`. Failover policy: cloud kicks in when p95 > 800ms.";
  if (/code|fix|update/i.test(prompt))
    return "```ts\n// Suggested patch\nexport const RISK_PER_TRADE_PCT = 1.2;\n```\nRun this through the **Safe-Change Workflow** before applying.";
  return `Acknowledged: "${prompt.slice(0, 80)}". Backend offline → returning mock reply.`;
}
