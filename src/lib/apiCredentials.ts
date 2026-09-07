/**
 * apiCredentials — local (browser-only) credential store for external API
 * providers surfaced by the health probe. Values never leave the device; the
 * store exists so the operator can wire missing services from a modal and the
 * UI can show exactly what is still required for server-side use.
 */
import { secureVault, VAULT_EVENT } from "./secureVault";

export interface CredentialEntry {
  envVar: string;
  value: string;
  savedAt: string;
  note?: string;
}

export interface ProviderSetupInfo {
  id: string;
  envVar: string;
  signupUrl: string;
  docsUrl?: string;
  free?: boolean;
  /** typical free quota, human readable */
  freeQuota?: string;
  fields?: string[];
}

const KEY = "ai-os.apiCredentials.v1";
export const CREDENTIALS_STORE = KEY;
export const CREDENTIALS_EVENT = "ai-os:api-credentials-changed";

function read(): Record<string, CredentialEntry> {
  if (typeof localStorage === "undefined") return {};
  const status = secureVault.status();
  if (status !== "off") {
    return status === "unlocked" ? (secureVault.getSection<Record<string, CredentialEntry>>(KEY) ?? {}) : {};
  }
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, CredentialEntry>;
  } catch {
    return {};
  }
}

function write(v: Record<string, CredentialEntry>) {
  if (typeof localStorage === "undefined") return;
  if (secureVault.status() !== "off") secureVault.setSection(KEY, v);
  else localStorage.setItem(KEY, JSON.stringify(v));
  window.dispatchEvent(new CustomEvent(CREDENTIALS_EVENT));
}

if (typeof window !== "undefined") {
  window.addEventListener(VAULT_EVENT, () => window.dispatchEvent(new CustomEvent(CREDENTIALS_EVENT)));
}

export const apiCredentials = {
  EVENT: CREDENTIALS_EVENT,
  all: read,
  get(id: string): CredentialEntry | undefined {
    return read()[id];
  },
  has(id: string): boolean {
    return Boolean(read()[id]?.value);
  },
  set(id: string, envVar: string, value: string, note?: string) {
    const all = read();
    all[id] = { envVar, value: value.trim(), savedAt: new Date().toISOString(), note };
    write(all);
  },
  remove(id: string) {
    const all = read();
    delete all[id];
    write(all);
  },
};

/** Signup / docs metadata per health-probe provider id. */
export const PROVIDER_SETUP: Record<string, ProviderSetupInfo> = {
  openai: { id: "openai", envVar: "OPENAI_API_KEY", signupUrl: "https://platform.openai.com/api-keys", docsUrl: "https://platform.openai.com/docs" },
  gemini: { id: "gemini", envVar: "GEMINI_API_KEY", signupUrl: "https://aistudio.google.com/app/apikey", docsUrl: "https://ai.google.dev/gemini-api/docs", free: true, freeQuota: "Free tier in AI Studio" },
  groq: { id: "groq", envVar: "GROQ_API_KEY", signupUrl: "https://console.groq.com/keys", free: true, freeQuota: "Generous free RPM" },
  perplexity: { id: "perplexity", envVar: "PERPLEXITY_API_KEY", signupUrl: "https://www.perplexity.ai/settings/api" },
  alpaca: { id: "alpaca", envVar: "ALPACA_API_KEY", signupUrl: "https://app.alpaca.markets/signup", docsUrl: "https://docs.alpaca.markets/", free: true, freeQuota: "Paper trading free", fields: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"] },
  finnhub: { id: "finnhub", envVar: "FINNHUB_API_KEY", signupUrl: "https://finnhub.io/register", free: true, freeQuota: "60 calls/min" },
  alphavantage: { id: "alphavantage", envVar: "ALPHA_VANTAGE_KEY", signupUrl: "https://www.alphavantage.co/support/#api-key", free: true, freeQuota: "25 req/day" },
  twelvedata: { id: "twelvedata", envVar: "TWELVEDATA_API_KEY", signupUrl: "https://twelvedata.com/pricing", free: true, freeQuota: "800 req/day" },
  taapi: { id: "taapi", envVar: "TAAPI_API_KEY", signupUrl: "https://taapi.io/pricing/", free: true, freeQuota: "1 indicator/15s" },
  eodhd: { id: "eodhd", envVar: "EODHD_API_KEY", signupUrl: "https://eodhd.com/register", free: true, freeQuota: "20 req/day" },
  newsapi: { id: "newsapi", envVar: "NEWSAPI_API_KEY", signupUrl: "https://newsapi.org/register", free: true, freeQuota: "100 req/day (dev)" },
  youtube: { id: "youtube", envVar: "YOUTUBE_API_KEY", signupUrl: "https://console.cloud.google.com/apis/credentials", free: true, freeQuota: "10k units/day" },
  gvision: { id: "gvision", envVar: "GOOGLE_VISION_API_KEY", signupUrl: "https://console.cloud.google.com/apis/credentials", free: true, freeQuota: "1k units/mo" },
  telegram: { id: "telegram", envVar: "TELEGRAM_BOT_TOKEN", signupUrl: "https://t.me/BotFather", docsUrl: "https://core.telegram.org/bots/api", free: true },
  gdrive: { id: "gdrive", envVar: "GOOGLE_DRIVE_API_KEY", signupUrl: "https://console.cloud.google.com/apis/library/drive.googleapis.com", free: true },
  lovable: { id: "lovable", envVar: "LOVABLE_API_KEY", signupUrl: "https://lovable.dev", docsUrl: "https://docs.lovable.dev" },
  supabase: { id: "supabase", envVar: "SUPABASE_URL", signupUrl: "https://lovable.dev" },
};

export function setupFor(id: string, fallbackEnv?: string): ProviderSetupInfo {
  return (
    PROVIDER_SETUP[id] ?? {
      id,
      envVar: fallbackEnv ?? `${id.toUpperCase()}_API_KEY`,
      signupUrl: `https://www.google.com/search?q=${encodeURIComponent(`${id} api key signup`)}`,
    }
  );
}
