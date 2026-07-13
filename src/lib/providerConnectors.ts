/**
 * Provider Connectors
 * ===================
 * Unified adapter layer that lets the Compute Router (and any other engine)
 * *actually* call providers — not just decide on paper.
 *
 * Two families:
 *  - LLM  (chat/reasoning/vision) — Local: Ollama · Cloud: OpenAI, Anthropic,
 *          Google Gemini, plus a generic "custom" adapter for any
 *          OpenAI-compatible URL (LM Studio, Groq, OpenRouter, etc.).
 *  - Data (market/news)           — Alpaca, Yahoo Finance, Finnhub, plus
 *          a generic "custom" REST adapter.
 *
 * Every connector reports its own health, category, cost hint and a single
 * `invoke()` that returns a normalized shape. The registry (see
 * providerRegistry.ts) stores user config in localStorage and exposes hooks.
 *
 * Pure frontend: keys live in localStorage; requests go direct to the
 * provider (CORS-friendly ones) or through the local FastAPI bridge when
 * available. No backend required to *decide* — only to invoke gated ones.
 */

export type ConnectorFamily = "llm" | "data";
export type ConnectorCategory =
  | "llm.local"
  | "llm.cloud"
  | "llm.custom"
  | "data.market"
  | "data.news"
  | "data.custom";

export interface ConnectorConfig {
  id: string;                       // stable id, e.g. "openai", "ollama", "alpaca"
  name: string;                     // display name
  family: ConnectorFamily;
  category: ConnectorCategory;
  baseUrl: string;                  // override endpoint
  apiKey?: string;                  // stored locally; blank for keyless (Yahoo)
  model?: string;                   // llm only — default model id
  enabled: boolean;
  costPer1kUsd?: number;            // rough estimate for router budget
  priority: number;                 // lower = preferred within category
  notes?: string;
}

export interface InvokeInput {
  /** LLM prompt or data path (e.g. "quote/AAPL") */
  prompt?: string;
  symbol?: string;
  path?: string;
  params?: Record<string, string | number>;
  maxTokens?: number;
}

export interface InvokeResult {
  ok: boolean;
  provider: string;
  latencyMs: number;
  costUsd: number;
  data?: unknown;
  text?: string;
  error?: string;
}

export interface HealthResult {
  online: boolean;
  latencyMs: number;
  detail?: string;
}

// -------------------- factory / defaults --------------------

export const DEFAULT_CONNECTORS: ConnectorConfig[] = [
  // ── LLM · local
  { id: "ollama",     name: "Ollama (Local)",     family: "llm",  category: "llm.local",  baseUrl: "http://localhost:11434", model: "llama3.1:8b", enabled: true,  costPer1kUsd: 0,      priority: 1 },
  // ── LLM · cloud
  { id: "openai",     name: "OpenAI",             family: "llm",  category: "llm.cloud",  baseUrl: "https://api.openai.com/v1",         model: "gpt-4o-mini",       enabled: false, costPer1kUsd: 0.0025, priority: 2 },
  { id: "anthropic",  name: "Anthropic Claude",   family: "llm",  category: "llm.cloud",  baseUrl: "https://api.anthropic.com/v1",      model: "claude-3-5-haiku-latest", enabled: false, costPer1kUsd: 0.003, priority: 3 },
  { id: "gemini",     name: "Google Gemini",      family: "llm",  category: "llm.cloud",  baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", enabled: false, costPer1kUsd: 0.0015, priority: 2 },
  // ── LLM · custom (OpenAI-compatible: LM Studio, Groq, OpenRouter, vLLM…)
  { id: "openai_compat", name: "Custom OpenAI-compatible", family: "llm", category: "llm.custom", baseUrl: "http://localhost:1234/v1", model: "", enabled: false, costPer1kUsd: 0, priority: 5, notes: "Point at LM Studio / Groq / OpenRouter / vLLM." },
  // ── Data · market
  { id: "alpaca",     name: "Alpaca Markets",     family: "data", category: "data.market", baseUrl: "https://data.alpaca.markets/v2", enabled: false, costPer1kUsd: 0, priority: 1 },
  { id: "yahoo",      name: "Yahoo Finance",      family: "data", category: "data.market", baseUrl: "https://query1.finance.yahoo.com", enabled: true,  costPer1kUsd: 0, priority: 2, notes: "Keyless public endpoint." },
  { id: "finnhub",    name: "Finnhub",            family: "data", category: "data.market", baseUrl: "https://finnhub.io/api/v1",       enabled: false, costPer1kUsd: 0, priority: 3 },
  // ── Data · news
  { id: "newsapi",    name: "NewsAPI",            family: "data", category: "data.news",   baseUrl: "https://newsapi.org/v2",          enabled: false, costPer1kUsd: 0, priority: 1 },
  // ── Data · custom
  { id: "custom_rest",name: "Custom REST",        family: "data", category: "data.custom", baseUrl: "",                                enabled: false, costPer1kUsd: 0, priority: 9, notes: "Any REST JSON API." },
];

// -------------------- invokers --------------------

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t0) };
}

/** Simple health probe. Keyless endpoints get an unauthenticated GET; keyed ones
 *  just check DNS reachability with a HEAD/GET that expects 401 as "reachable". */
export async function healthCheck(c: ConnectorConfig): Promise<HealthResult> {
  try {
    const { value: res, ms } = await timed(() =>
      fetch(c.baseUrl.replace(/\/$/, "") + (c.id === "ollama" ? "/api/tags" : "/"), {
        method: "GET",
        mode: "cors",
        signal: AbortSignal.timeout(3500),
      }).catch(() => null as Response | null),
    );
    if (!res) return { online: false, latencyMs: ms, detail: "network/CORS blocked" };
    // 200-401 all imply the host is up
    const ok = res.status >= 200 && res.status < 500;
    return { online: ok, latencyMs: ms, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { online: false, latencyMs: 0, detail: (e as Error).message };
  }
}

async function invokeLlm(c: ConnectorConfig, input: InvokeInput): Promise<InvokeResult> {
  const prompt = input.prompt ?? "";
  const maxTokens = input.maxTokens ?? 512;
  const t0 = performance.now();
  try {
    let text = "";
    if (c.id === "ollama") {
      const r = await fetch(`${c.baseUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: c.model || "llama3.1:8b", prompt, stream: false }),
      });
      const j = await r.json();
      text = j.response ?? "";
    } else if (c.id === "openai" || c.category === "llm.custom") {
      const r = await fetch(`${c.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: c.model || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
        }),
      });
      const j = await r.json();
      text = j.choices?.[0]?.message?.content ?? "";
    } else if (c.id === "anthropic") {
      const r = await fetch(`${c.baseUrl.replace(/\/$/, "")}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": c.apiKey ?? "",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: c.model || "claude-3-5-haiku-latest",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const j = await r.json();
      text = j.content?.[0]?.text ?? "";
    } else if (c.id === "gemini") {
      const model = c.model || "gemini-2.5-flash";
      const r = await fetch(
        `${c.baseUrl.replace(/\/$/, "")}/models/${model}:generateContent?key=${c.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      const j = await r.json();
      text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } else {
      throw new Error(`No LLM adapter for ${c.id}`);
    }
    const ms = Math.round(performance.now() - t0);
    const cost = ((maxTokens + prompt.length / 4) / 1000) * (c.costPer1kUsd ?? 0);
    return { ok: true, provider: c.id, latencyMs: ms, costUsd: cost, text };
  } catch (e) {
    return { ok: false, provider: c.id, latencyMs: Math.round(performance.now() - t0), costUsd: 0, error: (e as Error).message };
  }
}

async function invokeData(c: ConnectorConfig, input: InvokeInput): Promise<InvokeResult> {
  const t0 = performance.now();
  try {
    let url = "";
    const headers: Record<string, string> = {};
    if (c.id === "alpaca") {
      const sym = (input.symbol ?? "AAPL").toUpperCase();
      url = `${c.baseUrl.replace(/\/$/, "")}/stocks/${sym}/quotes/latest`;
      if (c.apiKey) {
        const [k, s] = c.apiKey.split(":");
        headers["APCA-API-KEY-ID"] = k ?? "";
        headers["APCA-API-SECRET-KEY"] = s ?? "";
      }
    } else if (c.id === "yahoo") {
      const sym = (input.symbol ?? "AAPL").toUpperCase();
      url = `${c.baseUrl.replace(/\/$/, "")}/v8/finance/chart/${sym}?range=1d&interval=5m`;
    } else if (c.id === "finnhub") {
      const sym = (input.symbol ?? "AAPL").toUpperCase();
      url = `${c.baseUrl.replace(/\/$/, "")}/quote?symbol=${sym}&token=${c.apiKey ?? ""}`;
    } else if (c.id === "newsapi") {
      const q = input.params?.q ?? input.symbol ?? "stocks";
      url = `${c.baseUrl.replace(/\/$/, "")}/top-headlines?category=business&q=${encodeURIComponent(String(q))}&apiKey=${c.apiKey ?? ""}`;
    } else {
      // custom REST
      const path = input.path ?? "";
      url = `${c.baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
      if (c.apiKey) headers["Authorization"] = `Bearer ${c.apiKey}`;
    }
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, provider: c.id, latencyMs: Math.round(performance.now() - t0), costUsd: 0, data, error: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, provider: c.id, latencyMs: Math.round(performance.now() - t0), costUsd: 0, error: (e as Error).message };
  }
}

export async function invoke(c: ConnectorConfig, input: InvokeInput): Promise<InvokeResult> {
  if (!c.enabled) return { ok: false, provider: c.id, latencyMs: 0, costUsd: 0, error: "disabled" };
  return c.family === "llm" ? invokeLlm(c, input) : invokeData(c, input);
}

export const CATEGORY_LABELS: Record<ConnectorCategory, string> = {
  "llm.local":   "LLM · Local",
  "llm.cloud":   "LLM · Cloud",
  "llm.custom":  "LLM · Custom URL",
  "data.market": "Data · Market",
  "data.news":   "Data · News",
  "data.custom": "Data · Custom REST",
};
