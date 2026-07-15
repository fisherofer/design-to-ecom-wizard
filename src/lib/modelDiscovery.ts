/**
 * Model Discovery — query each provider's public listing endpoint directly
 * from the browser. Falls back to a curated list when CORS blocks the call.
 *
 * Categories are inferred locally so the internal AI router knows where to
 * dispatch each model (chat / code / vision / embedding / reasoning).
 */

export type ProviderId =
  | "ollama"
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "perplexity";

export type ModelCategory =
  | "chat"
  | "code"
  | "vision"
  | "embedding"
  | "reasoning"
  | "image";

export interface DiscoveredModel {
  id: string;
  provider: ProviderId;
  contextWindow?: number;
  category: ModelCategory;
  recommended?: boolean;
  source: "live" | "curated";
}

export interface DiscoveryResult {
  provider: ProviderId;
  ok: boolean;
  models: DiscoveredModel[];
  error?: string;
  endpoint: string;
}

// -------------------- Curated fallback (used when CORS blocks) --------------------
const CURATED: Record<ProviderId, DiscoveredModel[]> = {
  ollama: [
    { id: "gemma2:9b", provider: "ollama", category: "chat", recommended: true, source: "curated" },
    { id: "gemma2:27b", provider: "ollama", category: "reasoning", recommended: true, source: "curated" },
    { id: "llama3.1:8b", provider: "ollama", category: "chat", recommended: true, source: "curated" },
    { id: "llama3.1:70b", provider: "ollama", category: "reasoning", source: "curated" },
    { id: "qwen2.5-coder:7b", provider: "ollama", category: "code", recommended: true, source: "curated" },
    { id: "qwen2.5-coder:32b", provider: "ollama", category: "code", source: "curated" },
    { id: "deepseek-coder-v2:16b", provider: "ollama", category: "code", source: "curated" },
    { id: "phi3:medium", provider: "ollama", category: "chat", source: "curated" },
    { id: "mistral-nemo:12b", provider: "ollama", category: "chat", source: "curated" },
    { id: "nomic-embed-text", provider: "ollama", category: "embedding", source: "curated" },
    { id: "llava:13b", provider: "ollama", category: "vision", source: "curated" },
  ],
  gemini: [
    { id: "gemini-2.0-flash-exp", provider: "gemini", category: "chat", recommended: true, contextWindow: 1_000_000, source: "curated" },
    { id: "gemini-1.5-pro", provider: "gemini", category: "reasoning", recommended: true, contextWindow: 2_000_000, source: "curated" },
    { id: "gemini-1.5-flash", provider: "gemini", category: "chat", contextWindow: 1_000_000, source: "curated" },
    { id: "gemini-1.5-flash-8b", provider: "gemini", category: "chat", source: "curated" },
    { id: "text-embedding-004", provider: "gemini", category: "embedding", source: "curated" },
    { id: "imagen-3.0-generate-002", provider: "gemini", category: "image", source: "curated" },
  ],
  openai: [
    { id: "gpt-4o", provider: "openai", category: "reasoning", recommended: true, contextWindow: 128_000, source: "curated" },
    { id: "gpt-4o-mini", provider: "openai", category: "chat", recommended: true, source: "curated" },
    { id: "o1-preview", provider: "openai", category: "reasoning", source: "curated" },
    { id: "o1-mini", provider: "openai", category: "reasoning", source: "curated" },
    { id: "text-embedding-3-large", provider: "openai", category: "embedding", source: "curated" },
    { id: "dall-e-3", provider: "openai", category: "image", source: "curated" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-20241022", provider: "anthropic", category: "reasoning", recommended: true, contextWindow: 200_000, source: "curated" },
    { id: "claude-3-5-haiku-20241022", provider: "anthropic", category: "chat", recommended: true, source: "curated" },
    { id: "claude-3-opus-20240229", provider: "anthropic", category: "reasoning", source: "curated" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", provider: "groq", category: "chat", recommended: true, source: "curated" },
    { id: "llama-3.1-8b-instant", provider: "groq", category: "chat", source: "curated" },
    { id: "mixtral-8x7b-32768", provider: "groq", category: "chat", source: "curated" },
  ],
  perplexity: [
    { id: "llama-3.1-sonar-large-128k-online", provider: "perplexity", category: "reasoning", recommended: true, source: "curated" },
    { id: "llama-3.1-sonar-small-128k-online", provider: "perplexity", category: "chat", source: "curated" },
  ],
};

// -------------------- Category inference --------------------
function inferCategory(id: string): ModelCategory {
  const s = id.toLowerCase();
  if (/embed|nomic/.test(s)) return "embedding";
  if (/vision|llava|imagen|dall|image/.test(s)) return /imagen|dall|image-gen/.test(s) ? "image" : "vision";
  if (/coder|code/.test(s)) return "code";
  if (/o1|opus|reasoner|70b|27b|pro/.test(s)) return "reasoning";
  return "chat";
}

// -------------------- Live endpoints --------------------
const ENDPOINTS: Record<ProviderId, (apiKey: string) => string> = {
  ollama: () => "http://localhost:11434/api/tags",
  gemini: (k) => `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(k)}`,
  openai: () => "https://api.openai.com/v1/models",
  anthropic: () => "https://api.anthropic.com/v1/models",
  groq: () => "https://api.groq.com/openai/v1/models",
  perplexity: () => "", // no public listing endpoint
};

async function fetchWithTimeout(url: string, init: RequestInit, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function discoverModels(
  provider: ProviderId,
  apiKey: string,
): Promise<DiscoveryResult> {
  const endpoint = ENDPOINTS[provider](apiKey);
  if (!endpoint) {
    return { provider, ok: false, endpoint: "(no listing API)", models: CURATED[provider], error: "Provider has no listing endpoint — using curated list." };
  }

  try {
    let res: Response;
    if (provider === "ollama") {
      res = await fetchWithTimeout(endpoint, {});
    } else if (provider === "gemini") {
      res = await fetchWithTimeout(endpoint, {});
    } else if (provider === "anthropic") {
      res = await fetchWithTimeout(endpoint, {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
    } else {
      // openai / groq style
      res = await fetchWithTimeout(endpoint, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const models = parseProviderResponse(provider, data);
    return { provider, ok: true, endpoint, models };
  } catch (err) {
    return {
      provider,
      ok: false,
      endpoint,
      models: CURATED[provider],
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

function parseProviderResponse(provider: ProviderId, data: unknown): DiscoveredModel[] {
  const recommendedSet = new Set(CURATED[provider].filter((m) => m.recommended).map((m) => m.id));

  if (provider === "ollama") {
    const tags = (data as { models?: Array<{ name: string; size?: number }> }).models ?? [];
    return tags.map((m) => ({
      id: m.name,
      provider,
      category: inferCategory(m.name),
      recommended: recommendedSet.has(m.name),
      source: "live" as const,
    }));
  }
  if (provider === "gemini") {
    const list = (data as { models?: Array<{ name: string; inputTokenLimit?: number }> }).models ?? [];
    return list
      .map((m) => {
        const id = m.name.replace(/^models\//, "");
        return {
          id,
          provider,
          category: inferCategory(id),
          contextWindow: m.inputTokenLimit,
          recommended: recommendedSet.has(id),
          source: "live" as const,
        };
      })
      .filter((m) => !/aqa|tuned/.test(m.id));
  }
  // OpenAI / Groq / Anthropic share { data: [{id}] }
  const list = (data as { data?: Array<{ id: string }>; models?: Array<{ id: string }> }).data
    ?? (data as { models?: Array<{ id: string }> }).models
    ?? [];
  return list.map((m) => ({
    id: m.id,
    provider,
    category: inferCategory(m.id),
    recommended: recommendedSet.has(m.id),
    source: "live" as const,
  }));
}

export function getCurated(provider: ProviderId): DiscoveredModel[] {
  return CURATED[provider];
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  ollama: "Ollama (Local)",
  gemini: "Google AI Studio (Gemini)",
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
  perplexity: "Perplexity",
};

/** Where to obtain a key for each provider. */
export const PROVIDER_SIGNUP_URL: Record<ProviderId, string> = {
  ollama: "https://ollama.com/download",
  gemini: "https://aistudio.google.com/apikey",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  groq: "https://console.groq.com/keys",
  perplexity: "https://www.perplexity.ai/settings/api",
};

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  chat: "Chat",
  code: "Code Generation",
  vision: "Vision",
  embedding: "Embeddings",
  reasoning: "Deep Reasoning",
  image: "Image Generation",
};
