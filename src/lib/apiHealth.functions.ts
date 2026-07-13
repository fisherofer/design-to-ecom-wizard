/**
 * apiHealth — server function that probes every configured provider key
 * and returns { ok, reason, category, tokens?, quota? } per provider.
 *
 * Only reads env inside the handler (Cloudflare Worker rule).
 * Any missing env is reported as `not-configured` with a hint, never as an error.
 */
import { createServerFn } from "@tanstack/react-start";

export type ApiHealthStatus = "ok" | "warn" | "error" | "missing";

export interface ApiHealthResult {
  id: string;
  provider: string;
  category: string;
  status: ApiHealthStatus;
  reason: string;
  latencyMs?: number;
  quota?: { used?: number; limit?: number; remaining?: number; period?: string };
  modelsCount?: number;
  hint?: string;
}

const TIMEOUT_MS = 6_000;

async function timedFetch(url: string, init?: RequestInit): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

function missing(id: string, provider: string, category: string, envName: string): ApiHealthResult {
  return {
    id,
    provider,
    category,
    status: "missing",
    reason: `${envName} not configured`,
    hint: `Add ${envName} via Settings → Secrets`,
  };
}

async function probeLovableGateway(): Promise<ApiHealthResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return missing("lovable", "Lovable AI Gateway", "AI / API", "LOVABLE_API_KEY");
  const t0 = Date.now();
  try {
    const r = await timedFetch("https://ai.gateway.lovable.dev/v1/models", {
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    const latencyMs = Date.now() - t0;
    if (r.status === 401 || r.status === 403)
      return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "error", reason: `Auth failed (${r.status})`, latencyMs };
    if (r.status === 402)
      return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "warn", reason: "Credits exhausted (402)", latencyMs, hint: "Top up in Workspace → Plans & credits" };
    if (r.status === 429)
      return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "warn", reason: "Rate-limited (429)", latencyMs };
    if (!r.ok) return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "error", reason: `HTTP ${r.status}`, latencyMs };
    const j = (await r.json()) as { data?: unknown[] };
    return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "ok", reason: "Reachable", latencyMs, modelsCount: j.data?.length ?? 0 };
  } catch (e) {
    return { id: "lovable", provider: "Lovable AI Gateway", category: "AI / API", status: "error", reason: (e as Error).message };
  }
}

async function probeOpenAI(): Promise<ApiHealthResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return missing("openai", "OpenAI", "AI / API", "OPENAI_API_KEY");
  const t0 = Date.now();
  try {
    const r = await timedFetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const latencyMs = Date.now() - t0;
    if (r.status === 401) return { id: "openai", provider: "OpenAI", category: "AI / API", status: "error", reason: "Invalid API key (401)", latencyMs };
    if (r.status === 429) return { id: "openai", provider: "OpenAI", category: "AI / API", status: "warn", reason: "Rate-limited or quota exceeded (429)", latencyMs };
    if (!r.ok) return { id: "openai", provider: "OpenAI", category: "AI / API", status: "error", reason: `HTTP ${r.status}`, latencyMs };
    const j = (await r.json()) as { data?: unknown[] };
    return { id: "openai", provider: "OpenAI", category: "AI / API", status: "ok", reason: "Reachable", latencyMs, modelsCount: j.data?.length ?? 0 };
  } catch (e) {
    return { id: "openai", provider: "OpenAI", category: "AI / API", status: "error", reason: (e as Error).message };
  }
}

async function probeGoogleGemini(): Promise<ApiHealthResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return missing("gemini", "Google Gemini", "AI / API", "GOOGLE_API_KEY");
  const t0 = Date.now();
  try {
    const r = await timedFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const latencyMs = Date.now() - t0;
    if (r.status === 400 || r.status === 403) return { id: "gemini", provider: "Google Gemini", category: "AI / API", status: "error", reason: `Auth failed (${r.status})`, latencyMs };
    if (r.status === 429) return { id: "gemini", provider: "Google Gemini", category: "AI / API", status: "warn", reason: "Quota exceeded (429)", latencyMs };
    if (!r.ok) return { id: "gemini", provider: "Google Gemini", category: "AI / API", status: "error", reason: `HTTP ${r.status}`, latencyMs };
    const j = (await r.json()) as { models?: unknown[] };
    return { id: "gemini", provider: "Google Gemini", category: "AI / API", status: "ok", reason: "Reachable", latencyMs, modelsCount: j.models?.length ?? 0 };
  } catch (e) {
    return { id: "gemini", provider: "Google Gemini", category: "AI / API", status: "error", reason: (e as Error).message };
  }
}

async function probeGroq(): Promise<ApiHealthResult> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return missing("groq", "Groq", "AI / API", "GROQ_API_KEY");
  const t0 = Date.now();
  try {
    const r = await timedFetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const latencyMs = Date.now() - t0;
    // Groq surfaces per-minute / per-day headroom in response headers.
    const remainingRpm = Number(r.headers.get("x-ratelimit-remaining-requests") ?? "");
    const limitRpm = Number(r.headers.get("x-ratelimit-limit-requests") ?? "");
    const remainingTokens = Number(r.headers.get("x-ratelimit-remaining-tokens") ?? "");
    const limitTokens = Number(r.headers.get("x-ratelimit-limit-tokens") ?? "");

    if (r.status === 401) return { id: "groq", provider: "Groq", category: "AI / API", status: "error", reason: "Invalid API key (401)", latencyMs };
    if (r.status === 429) return { id: "groq", provider: "Groq", category: "AI / API", status: "warn", reason: "Rate-limited (429)", latencyMs };
    if (!r.ok) return { id: "groq", provider: "Groq", category: "AI / API", status: "error", reason: `HTTP ${r.status}`, latencyMs };
    const j = (await r.json()) as { data?: unknown[] };
    const quota =
      Number.isFinite(remainingTokens) && Number.isFinite(limitTokens) && limitTokens > 0
        ? { used: limitTokens - remainingTokens, limit: limitTokens, remaining: remainingTokens, period: "minute · tokens" }
        : Number.isFinite(remainingRpm) && Number.isFinite(limitRpm) && limitRpm > 0
          ? { used: limitRpm - remainingRpm, limit: limitRpm, remaining: remainingRpm, period: "minute · requests" }
          : undefined;
    return { id: "groq", provider: "Groq", category: "AI / API", status: "ok", reason: "Reachable", latencyMs, modelsCount: j.data?.length ?? 0, quota };
  } catch (e) {
    return { id: "groq", provider: "Groq", category: "AI / API", status: "error", reason: (e as Error).message };
  }
}

async function probeTelegram(): Promise<ApiHealthResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return missing("telegram", "Telegram Bot", "SYSTEM / SECURITY", "TELEGRAM_BOT_TOKEN");
  const t0 = Date.now();
  try {
    const r = await timedFetch(`https://api.telegram.org/bot${token}/getMe`);
    const latencyMs = Date.now() - t0;
    const j = (await r.json()) as { ok?: boolean; description?: string; result?: { username?: string } };
    if (!j.ok) return { id: "telegram", provider: "Telegram Bot", category: "SYSTEM / SECURITY", status: "error", reason: j.description ?? `HTTP ${r.status}`, latencyMs };
    return { id: "telegram", provider: "Telegram Bot", category: "SYSTEM / SECURITY", status: "ok", reason: `@${j.result?.username ?? "bot"}`, latencyMs };
  } catch (e) {
    return { id: "telegram", provider: "Telegram Bot", category: "SYSTEM / SECURITY", status: "error", reason: (e as Error).message };
  }
}

async function probeGoogleDrive(): Promise<ApiHealthResult> {
  const key = process.env.GOOGLE_DRIVE_API_KEY;
  if (!key)
    return {
      id: "gdrive",
      provider: "Google Drive (Connector)",
      category: "DATA / STORAGE",
      status: "missing",
      reason: "Connector not linked",
      hint: "Link Google Drive under Settings → Connectors",
    };
  return {
    id: "gdrive",
    provider: "Google Drive (Connector)",
    category: "DATA / STORAGE",
    status: "ok",
    reason: "Connector linked (calls proxied through gateway)",
  };
}

async function probeSupabase(): Promise<ApiHealthResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return missing("supabase", "Lovable Cloud", "DB / SYSTEM", "SUPABASE_URL/KEY");
  const t0 = Date.now();
  try {
    const r = await timedFetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
    const latencyMs = Date.now() - t0;
    if (!r.ok) return { id: "supabase", provider: "Lovable Cloud", category: "DB / SYSTEM", status: "error", reason: `HTTP ${r.status}`, latencyMs };
    return { id: "supabase", provider: "Lovable Cloud", category: "DB / SYSTEM", status: "ok", reason: "Auth healthy", latencyMs };
  } catch (e) {
    return { id: "supabase", provider: "Lovable Cloud", category: "DB / SYSTEM", status: "error", reason: (e as Error).message };
  }
}

/** Providers whose keys are documented in the user's key vault but not yet
 * injected as sandbox env — we report them as `missing` so the UI shows
 * exactly which vars to add and why. */
function optionalMissing(): ApiHealthResult[] {
  const optional: Array<[string, string, string, string]> = [
    ["alpaca", "Alpaca", "TRADING / API", "ALPACA_API_KEY"],
    ["finnhub", "Finnhub", "DATA / API", "FINNHUB_API_KEY"],
    ["alphavantage", "Alpha Vantage", "DATA / API", "ALPHA_VANTAGE_KEY"],
    ["twelvedata", "TwelveData", "DATA / API", "TWELVEDATA_API_KEY"],
    ["taapi", "Taapi.io (indicators)", "DATA / API", "TAAPI_API_KEY"],
    ["eodhd", "EODHD", "DATA / API", "EODHD_API_KEY"],
    ["newsapi", "NewsAPI", "DATA / NEWS", "NEWSAPI_API_KEY"],
    ["perplexity", "Perplexity", "AI / API", "PERPLEXITY_API_KEY"],
    ["youtube", "YouTube Data", "CONTENT / API", "YOUTUBE_API_KEY"],
    ["gvision", "Google Vision", "AI / API", "GOOGLE_VISION_API_KEY"],
  ];
  return optional
    .filter(([, , , env]) => !process.env[env])
    .map(([id, provider, category, env]) => missing(id, provider, category, env));
}

export const probeAllApis = createServerFn({ method: "GET" }).handler(async (): Promise<ApiHealthResult[]> => {
  const core = await Promise.all([
    probeLovableGateway(),
    probeOpenAI(),
    probeGoogleGemini(),
    probeGroq(),
    probeTelegram(),
    probeGoogleDrive(),
    probeSupabase(),
  ]);
  return [...core, ...optionalMissing()].sort((a, b) => a.category.localeCompare(b.category) || a.provider.localeCompare(b.provider));
});
