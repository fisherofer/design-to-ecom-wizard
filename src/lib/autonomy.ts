/**
 * autonomy — typed client for the local autonomous layer:
 *   /api/browser   local Playwright browser + manual (own browser) fallback
 *   /api/engine    self-contained local AI engine (llama-cpp + GGUF weights)
 *   /api/memory    learning memory and owner-approved rules
 *   /api/autopilot scheduler, jobs and the continuity journal
 *   /api/wallets   watch-only payout wallets
 *
 * Every call reports the real backend state. When the local hub is not running
 * the caller receives an explicit unavailable result — never invented data.
 */
import { getApiBase } from "@/lib/apiConfig";

const TIMEOUT_MS = 60_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...init,
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body as { detail?: { error?: string } })?.detail?.error;
      throw new Error(detail ?? `HTTP ${res.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

// ------------------------------------------------------------------ browser
export interface BrowserStatus {
  ok: boolean;
  packages: Record<string, string | null>;
  missing: string[];
  chromium_installed: boolean;
  detail?: string | null;
  shots_dir?: string;
  error?: string;
}

export interface PageResult {
  ok: boolean;
  url?: string;
  title?: string | null;
  text?: string;
  links?: { href: string; text: string }[];
  screenshot?: string | null;
  elapsed_ms?: number;
  error?: string;
}

export const browserStatus = () =>
  safe(call<BrowserStatus>("/api/browser/status"), {
    ok: false, packages: {}, missing: [], chromium_installed: false,
    error: "המרכז המקומי אינו פועל",
  });

export const browserInstall = () => call<{ ok: boolean }>("/api/browser/install", { method: "POST" });

export const browserFetch = (url: string, screenshot = false) =>
  safe(
    call<PageResult>("/api/browser/fetch", { method: "POST", body: JSON.stringify({ url, screenshot }) }),
    { ok: false, error: "המרכז המקומי אינו פועל" },
  );

export const browserManual = (url: string) =>
  call<{ ok: boolean; open_in_user_browser: string; note: string }>("/api/browser/manual", {
    method: "POST",
    body: JSON.stringify({ url }),
  });

// ------------------------------------------------------------- local engine
export interface EngineModel {
  id: string;
  name: string;
  size_mb: number;
  ram_gb: number;
  use: string;
  downloaded: boolean;
  path: string;
  bytes: number;
  progress?: { state: string; pct?: number | null; error?: string } | null;
}

export interface EngineStatus {
  ok: boolean;
  engine: string;
  engine_installed: boolean;
  engine_version?: string | null;
  models_dir?: string;
  disk_free_bytes?: number;
  models: EngineModel[];
  loaded: { name: string; path: string }[];
  standalone?: boolean;
  requires_ollama?: boolean;
  error?: string;
}

export const engineStatus = () =>
  safe(call<EngineStatus>("/api/engine/status"), {
    ok: false, engine: "llama-cpp", engine_installed: false, models: [], loaded: [],
    error: "המרכז המקומי אינו פועל",
  });

export const engineInstall = () => call<{ ok: boolean }>("/api/engine/install", { method: "POST" });

export const engineDownload = (modelId: string) =>
  call<{ ok: boolean; started?: boolean; already?: boolean }>("/api/engine/download", {
    method: "POST",
    body: JSON.stringify({ model_id: modelId }),
  });

export const engineEnsureReady = (modelId?: string) =>
  call<{ ok: boolean; step?: string; model_id?: string; error?: string; pending?: boolean }>(
    "/api/engine/ensure-ready",
    { method: "POST", body: JSON.stringify({ model_id: modelId ?? null }) },
  );

// -------------------------------------------------------------------- memory
export interface MemoryItem {
  id: number;
  kind: "lesson" | "rule" | "fact";
  topic: string;
  content: string;
  source: string | null;
  weight: number;
  approved: number;
  created_at: number;
  updated_at: number;
}

export const listMemory = (kind?: string) =>
  safe(
    call<{ ok: boolean; constitution: string[]; items: MemoryItem[] }>(
      `/api/memory${kind ? `?kind=${kind}` : ""}`,
    ),
    { ok: false, constitution: [], items: [] },
  );

export const addMemory = (kind: string, content: string, topic = "general") =>
  call<{ ok: boolean; id: number }>("/api/memory", {
    method: "POST",
    body: JSON.stringify({ kind, content, topic, source: "owner" }),
  });

export const approveMemory = (id: number, approved: boolean) =>
  call<{ ok: boolean }>("/api/memory/approve", { method: "POST", body: JSON.stringify({ id, approved }) });

export const forgetMemory = (id: number) => call<{ ok: boolean }>(`/api/memory/${id}`, { method: "DELETE" });

// ----------------------------------------------------------------- autopilot
export interface JobConfig { enabled: boolean; every_min: number }

export interface AutopilotStatus {
  ok: boolean;
  running: boolean;
  config: {
    enabled: boolean;
    jobs: Record<string, JobConfig>;
    topics: string[];
    news_sources: string[];
    max_pages_per_run: number;
  };
  last_run: Record<string, { at: number; ok: boolean; ms: number; error?: string }>;
  latest: Record<string, { at?: number; text?: string; items?: unknown[] } | null>;
  browser?: BrowserStatus;
  error?: string;
}

const EMPTY_AUTOPILOT: AutopilotStatus = {
  ok: false,
  running: false,
  config: { enabled: false, jobs: {}, topics: [], news_sources: [], max_pages_per_run: 4 },
  last_run: {},
  latest: {},
  error: "המרכז המקומי אינו פועל",
};

export const autopilotStatus = () => safe(call<AutopilotStatus>("/api/autopilot/status"), EMPTY_AUTOPILOT);
export const autopilotStart = () => call<{ ok: boolean }>("/api/autopilot/start", { method: "POST" });
export const autopilotStop = () => call<{ ok: boolean }>("/api/autopilot/stop", { method: "POST" });
export const autopilotRun = (job: string) =>
  call<{ ok: boolean; error?: string }>(`/api/autopilot/run/${job}`, { method: "POST" });
export const autopilotConfig = (patch: Record<string, unknown>) =>
  call<{ ok: boolean }>("/api/autopilot/config", { method: "POST", body: JSON.stringify(patch) });

export interface JournalEntry { at: number; kind: string; message: string; details: Record<string, unknown> }

export const autopilotJournal = (limit = 100) =>
  safe(call<{ ok: boolean; entries: JournalEntry[] }>(`/api/autopilot/journal?limit=${limit}`), {
    ok: false,
    entries: [],
  });

// ------------------------------------------------------------------- wallets
export interface WalletBalance { ok: boolean; amount?: number; symbol?: string; error?: string }

export interface Wallet {
  chain: string;
  address: string;
  label: string;
  default: boolean;
  added_at: number;
  balance: WalletBalance | null;
}

export interface ChainSpec { label: string; symbol: string; hint: string }

export const listWallets = () =>
  safe(
    call<{ ok: boolean; chains: Record<string, ChainSpec>; wallets: Wallet[]; note: string }>("/api/wallets"),
    { ok: false, chains: {}, wallets: [], note: "" },
  );

export const addWallet = (chain: string, address: string, label = "", makeDefault = false) =>
  call<{ ok: boolean }>("/api/wallets", {
    method: "POST",
    body: JSON.stringify({ chain, address, label, make_default: makeDefault }),
  });

export const removeWallet = (chain: string, address: string) =>
  call<{ ok: boolean }>(`/api/wallets/${chain}/${encodeURIComponent(address)}`, { method: "DELETE" });

export const setDefaultWallet = (chain: string, address: string) =>
  call<{ ok: boolean }>("/api/wallets/default", { method: "POST", body: JSON.stringify({ chain, address }) });

export const recordWalletReceipt = (chain: string, address: string, amount: number, note = "") =>
  call<{ ok: boolean }>("/api/wallets/receipt", {
    method: "POST",
    body: JSON.stringify({ chain, address, amount, note }),
  });
