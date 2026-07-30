/**
 * apiPreflight.server — endpoint-level readiness verification.
 *
 * The health probe answers "is the key valid?". Preflight answers the harder
 * question agents actually depend on: for every connected provider, which
 * concrete endpoints respond, which required response fields are present, and
 * which credentials are still missing — BEFORE any agent is allowed to run.
 *
 * Server-only: every env read happens inside the exported runner (Worker rule).
 */

export type PreflightStatus = "pass" | "fail" | "skipped";

export interface EndpointCheck {
  /** endpoint identifier, e.g. "models.list" */
  id: string;
  label: string;
  method: string;
  /** url with secrets redacted */
  url: string;
  status: PreflightStatus;
  httpStatus?: number;
  latencyMs?: number;
  /** response fields that the spec requires */
  requiredFields: string[];
  missingFields: string[];
  reason: string;
}

export interface PreflightProvider {
  id: string;
  provider: string;
  category: string;
  /** env vars this provider needs before anything can be probed */
  requiredEnv: string[];
  missingEnv: string[];
  /** agents refuse to start when a critical provider fails */
  critical: boolean;
  status: PreflightStatus;
  reason: string;
  endpoints: EndpointCheck[];
}

export interface PreflightReport {
  generatedAt: string;
  durationMs: number;
  totals: { providers: number; pass: number; fail: number; skipped: number; endpoints: number; endpointsPass: number };
  /** true when no critical provider failed */
  readyForAgents: boolean;
  blockers: string[];
  providers: PreflightProvider[];
}

const TIMEOUT_MS = 8_000;

interface EndpointSpec {
  id: string;
  label: string;
  method?: string;
  /** build the request url from resolved env values */
  url: (env: Record<string, string>) => string;
  headers?: (env: Record<string, string>) => Record<string, string>;
  /** dot-paths that must exist in the JSON response */
  requiredFields: string[];
  /** extra HTTP statuses that still prove the endpoint is reachable/allowed */
  acceptStatuses?: number[];
}

interface ProviderSpec {
  id: string;
  provider: string;
  category: string;
  critical?: boolean;
  requiredEnv: string[];
  /** optional alternates: satisfied if any one of these env vars is present */
  endpoints: EndpointSpec[];
}

const SPECS: ProviderSpec[] = [
  {
    id: "lovable",
    provider: "Lovable AI Gateway",
    category: "AI / API",
    critical: true,
    requiredEnv: ["LOVABLE_API_KEY"],
    endpoints: [
      {
        id: "models.list",
        label: "List models",
        url: () => "https://ai.gateway.lovable.dev/v1/models",
        headers: (e) => ({ "Lovable-API-Key": e.LOVABLE_API_KEY, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }),
        requiredFields: ["data"],
      },
    ],
  },
  {
    id: "openai",
    provider: "OpenAI",
    category: "AI / API",
    requiredEnv: ["OPENAI_API_KEY"],
    endpoints: [
      {
        id: "models.list",
        label: "List models",
        url: () => "https://api.openai.com/v1/models",
        headers: (e) => ({ Authorization: `Bearer ${e.OPENAI_API_KEY}` }),
        requiredFields: ["data"],
      },
    ],
  },
  {
    id: "gemini",
    provider: "Google Gemini",
    category: "AI / API",
    requiredEnv: ["GOOGLE_API_KEY"],
    endpoints: [
      {
        id: "models.list",
        label: "List models",
        url: (e) => `https://generativelanguage.googleapis.com/v1beta/models?key=${e.GOOGLE_API_KEY}`,
        requiredFields: ["models"],
      },
    ],
  },
  {
    id: "groq",
    provider: "Groq",
    category: "AI / API",
    requiredEnv: ["GROQ_API_KEY"],
    endpoints: [
      {
        id: "models.list",
        label: "List models",
        url: () => "https://api.groq.com/openai/v1/models",
        headers: (e) => ({ Authorization: `Bearer ${e.GROQ_API_KEY}` }),
        requiredFields: ["data"],
      },
    ],
  },
  {
    id: "perplexity",
    provider: "Perplexity",
    category: "AI / API",
    requiredEnv: ["PERPLEXITY_API_KEY"],
    endpoints: [
      {
        id: "chat.completions",
        label: "Chat completions (auth probe)",
        method: "POST",
        url: () => "https://api.perplexity.ai/chat/completions",
        headers: (e) => ({ Authorization: `Bearer ${e.PERPLEXITY_API_KEY}`, "Content-Type": "application/json" }),
        requiredFields: [],
      },
    ],
  },
  {
    id: "alpaca",
    provider: "Alpaca",
    category: "TRADING / API",
    critical: true,
    requiredEnv: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"],
    endpoints: [
      {
        id: "account",
        label: "Account",
        url: () => "https://paper-api.alpaca.markets/v2/account",
        headers: (e) => ({ "APCA-API-KEY-ID": e.ALPACA_API_KEY, "APCA-API-SECRET-KEY": e.ALPACA_SECRET_KEY }),
        requiredFields: ["id", "status", "buying_power"],
      },
      {
        id: "clock",
        label: "Market clock",
        url: () => "https://paper-api.alpaca.markets/v2/clock",
        headers: (e) => ({ "APCA-API-KEY-ID": e.ALPACA_API_KEY, "APCA-API-SECRET-KEY": e.ALPACA_SECRET_KEY }),
        requiredFields: ["is_open", "next_open"],
      },
      {
        id: "quotes.latest",
        label: "Latest quotes (SPY)",
        url: () => "https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=SPY",
        headers: (e) => ({ "APCA-API-KEY-ID": e.ALPACA_API_KEY, "APCA-API-SECRET-KEY": e.ALPACA_SECRET_KEY }),
        requiredFields: ["quotes"],
      },
    ],
  },
  {
    id: "finnhub",
    provider: "Finnhub",
    category: "DATA / API",
    requiredEnv: ["FINNHUB_API_KEY"],
    endpoints: [
      {
        id: "quote",
        label: "Quote (AAPL)",
        url: (e) => `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${e.FINNHUB_API_KEY}`,
        requiredFields: ["c", "pc"],
      },
    ],
  },
  {
    id: "alphavantage",
    provider: "Alpha Vantage",
    category: "DATA / API",
    requiredEnv: ["ALPHA_VANTAGE_KEY"],
    endpoints: [
      {
        id: "global.quote",
        label: "Global quote (AAPL)",
        url: (e) => `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${e.ALPHA_VANTAGE_KEY}`,
        requiredFields: ["Global Quote"],
      },
    ],
  },
  {
    id: "twelvedata",
    provider: "TwelveData",
    category: "DATA / API",
    requiredEnv: ["TWELVEDATA_API_KEY"],
    endpoints: [
      {
        id: "price",
        label: "Price (AAPL)",
        url: (e) => `https://api.twelvedata.com/price?symbol=AAPL&apikey=${e.TWELVEDATA_API_KEY}`,
        requiredFields: ["price"],
      },
    ],
  },
  {
    id: "newsapi",
    provider: "NewsAPI",
    category: "DATA / NEWS",
    requiredEnv: ["NEWSAPI_API_KEY"],
    endpoints: [
      {
        id: "top.headlines",
        label: "Top headlines",
        url: (e) => `https://newsapi.org/v2/top-headlines?category=business&pageSize=1&apiKey=${e.NEWSAPI_API_KEY}`,
        requiredFields: ["articles"],
      },
    ],
  },
  {
    id: "telegram",
    provider: "Telegram Bot",
    category: "SYSTEM / SECURITY",
    requiredEnv: ["TELEGRAM_BOT_TOKEN"],
    endpoints: [
      {
        id: "getMe",
        label: "getMe",
        url: (e) => `https://api.telegram.org/bot${e.TELEGRAM_BOT_TOKEN}/getMe`,
        requiredFields: ["ok", "result.username"],
      },
    ],
  },
  {
    id: "supabase",
    provider: "Lovable Cloud",
    category: "DB / SYSTEM",
    critical: true,
    requiredEnv: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY"],
    endpoints: [
      {
        id: "auth.health",
        label: "Auth health",
        url: (e) => `${e.SUPABASE_URL}/auth/v1/health`,
        headers: (e) => ({ apikey: e.SUPABASE_PUBLISHABLE_KEY }),
        requiredFields: [],
      },
      {
        id: "rest.root",
        label: "Data API root",
        url: (e) => `${e.SUPABASE_URL}/rest/v1/`,
        headers: (e) => ({ apikey: e.SUPABASE_PUBLISHABLE_KEY }),
        requiredFields: [],
      },
    ],
  },
];

function redact(url: string, env: Record<string, string>): string {
  let out = url;
  for (const v of Object.values(env)) {
    if (v && v.length > 6) out = out.split(v).join("••••");
  }
  return out;
}

function hasPath(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return false;
    if (!(part in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur !== undefined && cur !== null;
}

async function runEndpoint(spec: EndpointSpec, env: Record<string, string>): Promise<EndpointCheck> {
  const method = spec.method ?? "GET";
  const url = spec.url(env);
  const base: EndpointCheck = {
    id: spec.id,
    label: spec.label,
    method,
    url: redact(url, env),
    status: "fail",
    requiredFields: spec.requiredFields,
    missingFields: [],
    reason: "",
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: spec.headers?.(env),
      body: method === "POST" ? "{}" : undefined,
      signal: controller.signal,
    });
    base.latencyMs = Date.now() - t0;
    base.httpStatus = res.status;

    // A 400 on an auth-probe POST still proves the credential is accepted.
    const authOk = res.ok || (method === "POST" && res.status === 400);
    if (!authOk) {
      base.status = "fail";
      base.reason =
        res.status === 401 || res.status === 403
          ? `Rejected credentials (HTTP ${res.status})`
          : res.status === 429
            ? "Rate limited (HTTP 429)"
            : `HTTP ${res.status}`;
      return base;
    }

    if (spec.requiredFields.length) {
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        base.status = "fail";
        base.reason = "Response was not valid JSON";
        base.missingFields = spec.requiredFields;
        return base;
      }
      base.missingFields = spec.requiredFields.filter((f) => !hasPath(json, f));
      if (base.missingFields.length) {
        base.status = "fail";
        base.reason = `Missing response fields: ${base.missingFields.join(", ")}`;
        return base;
      }
    }
    base.status = "pass";
    base.reason = `OK (${base.httpStatus}) · ${base.latencyMs}ms`;
    return base;
  } catch (e) {
    base.latencyMs = Date.now() - t0;
    base.reason = (e as Error).name === "AbortError" ? `Timeout after ${TIMEOUT_MS}ms` : (e as Error).message;
    return base;
  } finally {
    clearTimeout(timer);
  }
}

async function runProvider(spec: ProviderSpec): Promise<PreflightProvider> {
  const env: Record<string, string> = {};
  const missingEnv: string[] = [];
  for (const name of spec.requiredEnv) {
    const v = process.env[name];
    if (v) env[name] = v;
    else missingEnv.push(name);
  }

  const shell: PreflightProvider = {
    id: spec.id,
    provider: spec.provider,
    category: spec.category,
    requiredEnv: spec.requiredEnv,
    missingEnv,
    critical: Boolean(spec.critical),
    status: "skipped",
    reason: "",
    endpoints: [],
  };

  if (missingEnv.length) {
    shell.status = "skipped";
    shell.reason = `Not configured — missing ${missingEnv.join(", ")}`;
    shell.endpoints = spec.endpoints.map((e) => ({
      id: e.id,
      label: e.label,
      method: e.method ?? "GET",
      url: "—",
      status: "skipped" as const,
      requiredFields: e.requiredFields,
      missingFields: [],
      reason: "Skipped: credentials missing",
    }));
    return shell;
  }

  shell.endpoints = await Promise.all(spec.endpoints.map((e) => runEndpoint(e, env)));
  const failed = shell.endpoints.filter((e) => e.status === "fail");
  shell.status = failed.length ? "fail" : "pass";
  shell.reason = failed.length
    ? `${failed.length}/${shell.endpoints.length} endpoints failing`
    : `${shell.endpoints.length}/${shell.endpoints.length} endpoints healthy`;
  return shell;
}

export async function runPreflight(): Promise<PreflightReport> {
  const t0 = Date.now();
  const providers = await Promise.all(SPECS.map(runProvider));
  providers.sort((a, b) => a.category.localeCompare(b.category) || a.provider.localeCompare(b.provider));

  const endpoints = providers.flatMap((p) => p.endpoints);
  const blockers = providers
    .filter((p) => p.critical && p.status !== "pass")
    .map((p) => `${p.provider}: ${p.reason}`);

  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    totals: {
      providers: providers.length,
      pass: providers.filter((p) => p.status === "pass").length,
      fail: providers.filter((p) => p.status === "fail").length,
      skipped: providers.filter((p) => p.status === "skipped").length,
      endpoints: endpoints.length,
      endpointsPass: endpoints.filter((e) => e.status === "pass").length,
    },
    readyForAgents: blockers.length === 0,
    blockers,
    providers,
  };
}
