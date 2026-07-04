import {
  MOCK_GOOSE_STATUS,
  type GooseStatus,
  type GooseVerification,
} from "./goose";

/**
 * AI Executive OS — Local API Bridge
 * ==================================
 * All requests target the local Python backend (QuantEngine `hub/api_server.py`)
 * on http://localhost:8050. If the backend is unreachable, mock data is returned
 * so the UI stays alive.
 *
 * WIRED (real backend endpoints):
 *   GET  /health
 *   GET  /api/status                 (system status)
 *   GET  /api/health/full            (deep health scan)
 *   POST /api/health/doctor          (AI-driven self-repair)
 *   GET  /api/keys                   (vault list)
 *   POST /api/keys                   (add key)
 *   DELETE /api/keys/:provider       (remove key)
 *   GET  /api/recommendations        (dashboard signals)
 *   GET  /api/market-data            (dashboard tickers)
 *   GET  /api/reports/today          (dashboard KPIs)
 *   GET  /api/agents                 (agent registry)
 *   POST /api/agent/start | stop | run-pipeline
 *   GET  /api/capabilities           (system capability map)
 *   GET  /api/ports                  (dynamic service discovery)
 *   GET  /api/tray/state             (tray/sidebar state)
 *
 * NOT YET WIRED — planned features, still returning mock data. Kept as
 * roadmap; do NOT delete without discussion. Callers are marked visually
 * with <NotWiredBadge/> in the UI.
 *   GET  /personas                   (Persona tracker system)
 *   POST /personas/:id/toggle
 *   POST /personas/:id/extract
 *   GET  /evolution/proposals        (Self-evolving Meta-Agent)
 *   POST /evolution/proposals/:id/decide
 *   GET  /logs                       (backend log stream)
 *   POST /chat                       (LLM chat bridge)
 *   POST /api/goose/verify
 *   POST /api/goose/update-code
 *   POST /api/goose/chat
 */

/** Endpoints not yet wired to the real backend — see JSDoc above. */
export const NOT_WIRED_ENDPOINTS = new Set<string>([
  "listPersonas",
  "togglePersona",
  "rescanPersona",
  "listProposals",
  "decideProposal",
  "listLogs",
  "chat",
  "gooseVerify",
  "gooseUpdateCode",
  "gooseChat",
]);

export const API_BASE =
  (typeof window !== "undefined" && (window as { __API_BASE__?: string }).__API_BASE__) ||
  "http://localhost:8050";

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
export type EngineId = "gemini" | "ollama" | "groq" | "claude" | "perplexity" | "goose";

export interface SystemStatus {
  cloudEngine: { id: EngineId; label: string; online: boolean };
  localEngine: { id: EngineId; label: string; online: boolean };
  dbConnected: boolean;
  latencyMs: number;
  docker: { running: boolean; version: string };
  npm: { installed: boolean; version: string };
}

export type HealthLevel = "ok" | "warn" | "error" | "missing";
export interface HealthComponent {
  name: string;
  level: HealthLevel;
  version?: string;
  required?: string;
  message?: string;
  fixable: boolean;
}
export interface HealthReport {
  overall: HealthLevel;
  ts: string;
  components: HealthComponent[];
}

// -------- API Vault: provider keys + smart routing --------
export type ApiKeyTier = "primary" | "fallback" | "emergency" | "disabled";
export type ApiKeyType = "LLM" | "Data" | "Broker";

export interface ApiKey {
  id: string;
  provider: string;
  type: ApiKeyType;
  maskedKey: string;
  /** Quota tier label: Free / Pro / Live etc. */
  quotaTier: string;
  /** Routing priority within its provider/use-case bucket. */
  tier: ApiKeyTier;
  /** Whether this key has billing implications (emergency = avoid unless needed). */
  paid: boolean;
  status: "ok" | "warn" | "err";
  /** Rate limit budget per minute (requests). */
  rpmLimit: number;
  /** Current usage in the last minute. */
  rpmUsed: number;
  /** Allowed use cases — categories the smart router may dispatch to this key. */
  useCases: UseCase[];
}

export type UseCase =
  | "trading_decisions"
  | "market_analysis"
  | "code_generation"
  | "persona_extraction"
  | "general_chat";

export const USE_CASE_LABELS: Record<UseCase, string> = {
  trading_decisions: "Trading Decisions",
  market_analysis: "Market Analysis",
  code_generation: "Code Generation",
  persona_extraction: "Persona Extraction",
  general_chat: "General Chat",
};

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
  engine?: EngineId | "goose";
  ts: number;
}

export interface ChatResponse {
  reply: string;
  engine: EngineId | "goose";
  route?: "llm" | "goose" | "fallback";
  toolsUsed?: string[];
}

// -------- Persona / Alpha tracking --------
export interface PersonaThesis {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryLogic: string;
  catalyst: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  ts: string;
  outcome?: "win" | "loss" | "open";
}

export interface Persona {
  id: string;
  name: string;
  handle: string;
  platform: "YouTube" | "X" | "Substack" | "Reddit";
  trustScore: number; // 0..1
  totalTracked: number;
  successful: number;
  learningMode: "strict" | "broad";
  active: boolean;
  activeTheses: PersonaThesis[];
  lastScan: string;
}

// -------- Evolution Proposals (Meta-Agent) --------
export interface EvolutionProposal {
  id: string;
  source: string;
  proposedAgent: string;
  description: string;
  estimatedAlpha: number; // backtest improvement %
  safetyScore: number; // 0..100
  audits: { label: string; pass: boolean }[];
  status: "pending" | "approved" | "rejected" | "sandboxed";
  createdAt: string;
}

// -------------------- API surface --------------------
export const api = {
  // ---------- System ----------
  health: () => request<{ ok: boolean }>("/health", {}, { ok: false }),

  systemStatus: () =>
    request<SystemStatus>("/api/status", {}, {
      cloudEngine: { id: "gemini", label: "Gemini 1.5 Pro", online: true },
      localEngine: { id: "ollama", label: "Ollama 8B", online: true },
      dbConnected: true,
      latencyMs: 12,
      docker: { running: true, version: "27.3.1" },
      npm: { installed: true, version: "10.8.2" },
    }),

  healthCheck: () =>
    request<HealthReport>("/api/health/full", {}, {
      overall: "warn",
      ts: new Date().toISOString(),
      components: [
        { name: "Python", level: "ok", version: "3.11.9", required: ">=3.10", fixable: false },
        { name: "Docker Engine", level: "ok", version: "27.3.1", required: ">=24", fixable: false },
        { name: "Ollama", level: "ok", version: "0.3.14", required: ">=0.3", fixable: true },
        { name: "node / npm", level: "ok", version: "20.18.0 / 10.8.2", required: "node >=20", fixable: true },
        {
          name: "Python deps (fastapi, uvicorn)",
          level: "warn",
          version: "fastapi 0.110",
          required: ">=0.115",
          message: "FastAPI behind 5 minor versions. AI can auto-upgrade.",
          fixable: true,
        },
        {
          name: "ta-lib (native)",
          level: "missing",
          required: "any",
          message: "Optional but recommended for technical indicators.",
          fixable: true,
        },
      ],
    }),

  systemRepair: (component?: string) =>
    request<{ ok: boolean; log: string[] }>(
      "/system/repair",
      { method: "POST", body: JSON.stringify({ component }) },
      {
        ok: true,
        log: [
          `[mock] Backend offline — would auto-repair ${component ?? "all components"}`,
          "[mock] Run `python api_bridge.py` to enable real fixes.",
        ],
      },
    ),

  // ---------- Vault ----------
  listKeys: () => request<ApiKey[]>("/vault/keys", {}, MOCK_KEYS),
  addKey: (k: Omit<ApiKey, "id" | "status" | "rpmUsed">) =>
    request<ApiKey>("/vault/keys", { method: "POST", body: JSON.stringify(k) }),
  updateKey: (id: string, patch: Partial<ApiKey>) =>
    request<ApiKey>(
      `/vault/keys/${encodeURIComponent(id)}`,
      { method: "PATCH", body: JSON.stringify(patch) },
      { ...(MOCK_KEYS.find((k) => k.id === id) as ApiKey), ...patch },
    ),

  // ---------- Config (Safe-Change Workflow) ----------
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

  // ---------- Personas / Alpha trackers ----------
  listPersonas: () => request<Persona[]>("/personas", {}, MOCK_PERSONAS),
  togglePersona: (id: string, active: boolean) =>
    request<Persona>(
      `/personas/${id}/toggle`,
      { method: "POST", body: JSON.stringify({ active }) },
      { ...(MOCK_PERSONAS.find((p) => p.id === id) as Persona), active },
    ),
  rescanPersona: (id: string) =>
    request<{ ok: boolean }>(`/personas/${id}/extract`, { method: "POST" }, { ok: true }),

  // ---------- Evolution / Meta-Agent ----------
  listProposals: () => request<EvolutionProposal[]>("/evolution/proposals", {}, MOCK_PROPOSALS),
  decideProposal: (id: string, decision: "approve" | "reject" | "sandbox") =>
    request<EvolutionProposal>(
      `/evolution/proposals/${id}/decide`,
      { method: "POST", body: JSON.stringify({ decision }) },
      { ...(MOCK_PROPOSALS.find((p) => p.id === id) as EvolutionProposal), status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "sandboxed" },
    ),

  // ---------- Logs ----------
  listLogs: (level?: string, limit = 200) =>
    request<LogEntry[]>(
      `/logs?limit=${limit}${level ? `&level=${level}` : ""}`,
      {},
      [],
    ),

  // ---------- Chat ----------
  chat: (
    messages: ChatMessage[],
    engine: EngineId = "gemini",
  ): Promise<ChatResponse> => {
    const path = engine === "goose" ? "/api/goose/chat" : "/chat";
    return request(
      path,
      { method: "POST", body: JSON.stringify({ messages, engine }) },
      {
        reply: mockReply(messages.at(-1)?.content ?? "", engine),
        engine,
        route: "fallback",
      },
    );
  },

  // ---------- Goose MCP bridge ----------
  gooseStatus: () =>
    request<GooseStatus>("/api/goose/status", {}, MOCK_GOOSE_STATUS),
  gooseVerify: () =>
    request<GooseVerification>(
      "/api/goose/verify",
      { method: "POST" },
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        checks: [
          { id: "backend", label: "FastAPI bridge", state: "warn", detail: "Fallback פעיל — backend לא זמין" },
          { id: "mcp", label: "Goose MCP extension", state: "fail", detail: "נדרשת התקנה/הפעלה ב-Goose" },
          { id: "tools", label: "Tool manifest", state: "warn", detail: "5 מתוך 6 כלים זמינים במפרט" },
          { id: "approval", label: "Code approval guardrail", state: "pass", detail: "שינויי קוד מחייבים אישור מפורש" },
        ],
      },
    ),
  gooseUpdateCode: (description: string, instructionAudit: unknown) =>
    request<{ ok: boolean; jobId?: string; message: string }>(
      "/api/goose/update-code",
      { method: "POST", body: JSON.stringify({ description, instruction_audit: instructionAudit }) },
      { ok: true, jobId: `mock_${Date.now()}`, message: "בקשת שינוי הוכנה במצב הדגמה; חבר את FastAPI לביצוע אמיתי." },
    ),
  gooseChat: (messages: ChatMessage[], fallbackEngine: EngineId): Promise<ChatResponse> =>
    request<ChatResponse>(
      "/api/goose/chat",
      {
        method: "POST",
        body: JSON.stringify({
          messages,
          fallback_engine: fallbackEngine,
          use_tools: true,
          approval_mode: "guarded",
        }),
      },
    ),

  // ---------- Infra ----------
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

function mockReply(prompt: string, engine?: EngineId): string {
  if (!prompt) return "Connected to local Python backend (mock fallback).";
  if (engine === "goose") return "Goose (MCP) is currently in fallback mode. The local model is handling the request, but tools are limited until the bridge is active.";
  if (/docker/i.test(prompt))
    return "Docker is running v27.3.1. Use the **System Config** panel to restart or update the stack.";
  if (/ollama|local/i.test(prompt))
    return "Local engine **Ollama 8B** is online at `http://localhost:11434`. Failover policy: cloud kicks in when p95 > 800ms.";
  if (/code|fix|update/i.test(prompt))
    return "```ts\n// Suggested patch\nexport const RISK_PER_TRADE_PCT = 1.2;\n```\nRun this through the **Safe-Change Workflow** before applying.";
  if (/persona|micha/i.test(prompt))
    return "Persona tracker found 3 new theses. **Micha Stocks** trust score: 0.78 (24/31 calls profitable). See the **Personas** tab.";
  return `Acknowledged: "${prompt.slice(0, 80)}". Backend offline → returning mock reply.`;
}

// -------------------- MOCK DATA --------------------
const MOCK_KEYS: ApiKey[] = [
  // Google — many keys, smart pool
  { id: "g1", provider: "Google Gemini", type: "LLM", maskedKey: "AIzaSy•••K2pQ", quotaTier: "Pro", tier: "primary", paid: false, status: "ok", rpmLimit: 60, rpmUsed: 22, useCases: ["trading_decisions", "market_analysis", "general_chat"] },
  { id: "g2", provider: "Google Gemini", type: "LLM", maskedKey: "AIzaSy•••aBxY", quotaTier: "Free", tier: "fallback", paid: false, status: "ok", rpmLimit: 15, rpmUsed: 4, useCases: ["general_chat", "persona_extraction"] },
  { id: "g3", provider: "Google Gemini", type: "LLM", maskedKey: "AIzaSy•••7Hjk", quotaTier: "Free", tier: "fallback", paid: false, status: "ok", rpmLimit: 15, rpmUsed: 0, useCases: ["persona_extraction"] },
  { id: "g4", provider: "Google Gemini", type: "LLM", maskedKey: "AIzaSy•••Mx88", quotaTier: "Free", tier: "fallback", paid: false, status: "warn", rpmLimit: 15, rpmUsed: 14, useCases: ["general_chat"] },
  { id: "g5", provider: "Google Gemini", type: "LLM", maskedKey: "AIzaSy•••pQrS", quotaTier: "Free", tier: "fallback", paid: false, status: "ok", rpmLimit: 15, rpmUsed: 7, useCases: ["market_analysis"] },
  // OpenAI — paid, only emergency
  { id: "o1", provider: "OpenAI", type: "LLM", maskedKey: "sk-proj-•••xY2Z", quotaTier: "Pro", tier: "emergency", paid: true, status: "ok", rpmLimit: 500, rpmUsed: 0, useCases: ["code_generation", "trading_decisions"] },
  { id: "o2", provider: "OpenAI", type: "LLM", maskedKey: "sk-proj-•••Aq8v", quotaTier: "Pro", tier: "emergency", paid: true, status: "ok", rpmLimit: 500, rpmUsed: 0, useCases: ["code_generation"] },
  // Anthropic — paid, emergency for trading decisions only
  { id: "a1", provider: "Anthropic", type: "LLM", maskedKey: "sk-ant-•••j3kP", quotaTier: "Pro", tier: "emergency", paid: true, status: "err", rpmLimit: 100, rpmUsed: 0, useCases: ["trading_decisions"] },
  // Groq — fast & free fallback
  { id: "gr1", provider: "Groq", type: "LLM", maskedKey: "gsk_•••Mn3X", quotaTier: "Free", tier: "fallback", paid: false, status: "ok", rpmLimit: 30, rpmUsed: 11, useCases: ["general_chat", "code_generation"] },
  // Perplexity
  { id: "px1", provider: "Perplexity", type: "LLM", maskedKey: "pplx-•••Vk9R", quotaTier: "Pro", tier: "fallback", paid: true, status: "warn", rpmLimit: 50, rpmUsed: 32, useCases: ["market_analysis"] },
  // Data
  { id: "d1", provider: "Polygon", type: "Data", maskedKey: "Lqh8K•••ftR4", quotaTier: "Free", tier: "primary", paid: false, status: "ok", rpmLimit: 5, rpmUsed: 2, useCases: ["market_analysis"] },
  // Brokers
  { id: "b1", provider: "Alpaca", type: "Broker", maskedKey: "PKE7XV•••92AB", quotaTier: "Live", tier: "primary", paid: true, status: "ok", rpmLimit: 200, rpmUsed: 18, useCases: ["trading_decisions"] },
  { id: "b2", provider: "Binance", type: "Broker", maskedKey: "MhT5q•••C8Wn", quotaTier: "Live", tier: "fallback", paid: true, status: "warn", rpmLimit: 1200, rpmUsed: 84, useCases: ["trading_decisions"] },
];

const MOCK_PERSONAS: Persona[] = [
  {
    id: "micha",
    name: "Micha Stocks",
    handle: "@MichaStocks",
    platform: "YouTube",
    trustScore: 0.78,
    totalTracked: 31,
    successful: 24,
    learningMode: "strict",
    active: true,
    lastScan: "2 min ago",
    activeTheses: [
      { ticker: "ZIM", direction: "LONG", entryLogic: "Red Sea bottleneck → freight rates spike", catalyst: "Earnings + dividend", confidence: "HIGH", ts: new Date().toISOString(), outcome: "open" },
      { ticker: "NVDA", direction: "LONG", entryLogic: "Blackwell adoption acceleration", catalyst: "Hyperscaler capex guide", confidence: "HIGH", ts: new Date().toISOString(), outcome: "open" },
    ],
  },
  {
    id: "kerrisdale",
    name: "Kerrisdale Capital",
    handle: "@KerrisdaleCap",
    platform: "X",
    trustScore: 0.71,
    totalTracked: 47,
    successful: 33,
    learningMode: "strict",
    active: true,
    lastScan: "11 min ago",
    activeTheses: [
      { ticker: "DJT", direction: "SHORT", entryLogic: "Valuation disconnect from fundamentals", catalyst: "Lockup expiry", confidence: "MEDIUM", ts: new Date().toISOString(), outcome: "open" },
    ],
  },
  {
    id: "burry",
    name: "Michael Burry (13F)",
    handle: "Scion 13F",
    platform: "Substack",
    trustScore: 0.62,
    totalTracked: 18,
    successful: 11,
    learningMode: "broad",
    active: true,
    lastScan: "1h ago",
    activeTheses: [
      { ticker: "BABA", direction: "LONG", entryLogic: "Discount to NAV + buybacks", catalyst: "Shareholder return", confidence: "MEDIUM", ts: new Date().toISOString() },
    ],
  },
  {
    id: "wsb",
    name: "r/WallStreetBets Top",
    handle: "Reddit aggregator",
    platform: "Reddit",
    trustScore: 0.41,
    totalTracked: 124,
    successful: 51,
    learningMode: "broad",
    active: false,
    lastScan: "paused",
    activeTheses: [],
  },
];

const MOCK_PROPOSALS: EvolutionProposal[] = [
  {
    id: "ev_001",
    source: "GitHub: stefan-jansen/machine-learning-for-trading",
    proposedAgent: "Stat-Arb Pairs Engine",
    description:
      "Cointegration-based pairs trading using Engle-Granger test on S&P500 sector pairs. Backtest +14.2% Sharpe vs current ensemble.",
    estimatedAlpha: 14.2,
    safetyScore: 96,
    audits: [
      { label: "No outbound network calls", pass: true },
      { label: "No filesystem writes outside /tmp", pass: true },
      { label: "All deps in allowlist", pass: true },
      { label: "Static analysis clean", pass: true },
    ],
    status: "pending",
    createdAt: "12 min ago",
  },
  {
    id: "ev_002",
    source: "GitHub: hudson-and-thames/mlfinlab",
    proposedAgent: "Triple-Barrier Labeling",
    description:
      "Replaces fixed-horizon labels with TP/SL/timeout barriers. Reduces label noise on volatile assets like BTC/ETH.",
    estimatedAlpha: 6.8,
    safetyScore: 92,
    audits: [
      { label: "No outbound network calls", pass: true },
      { label: "No filesystem writes outside /tmp", pass: true },
      { label: "All deps in allowlist", pass: true },
      { label: "Static analysis: 1 warning (unused import)", pass: true },
    ],
    status: "pending",
    createdAt: "47 min ago",
  },
  {
    id: "ev_003",
    source: "ArXiv: 2403.12832 — LLM market regime classifier",
    proposedAgent: "Regime-Aware Router",
    description:
      "Uses local Ollama to classify market into {bull, bear, chop, vol-spike} every 15min, routes to different strategy clusters.",
    estimatedAlpha: 9.4,
    safetyScore: 88,
    audits: [
      { label: "No outbound network calls", pass: true },
      { label: "No filesystem writes outside /tmp", pass: true },
      { label: "All deps in allowlist", pass: true },
      { label: "Sandbox required (uses subprocess)", pass: false },
    ],
    status: "sandboxed",
    createdAt: "2h ago",
  },
];
