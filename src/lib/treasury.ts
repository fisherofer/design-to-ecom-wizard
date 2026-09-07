/**
 * treasury — client for hub/treasury_routes.py (/api/treasury) plus the local
 * ad-slot configuration.
 *
 * Purpose: fund the system's growth (server rent, paid data feeds) from real,
 * recorded income only — advertising payouts and optional coin mining.
 * No miner ships with the app: the user points at their own binary. No income
 * is ever estimated; the ledger only holds amounts that actually landed.
 */
import { getApiBase } from "@/lib/apiConfig";
import { kvGet, kvSet, type LedgerEntry } from "@/lib/localStore";

const TIMEOUT_MS = 15_000;

export interface MinerConfig {
  binary_path: string;
  args: string;
  api_url: string;
  pool_payout_url: string;
  enabled: boolean;
}

export const EMPTY_MINER: MinerConfig = {
  binary_path: "", args: "", api_url: "", pool_payout_url: "", enabled: false,
};

export interface MinerStatus {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  running: boolean;
  started_at: number | null;
  stats: Record<string, unknown> | null;
  stats_error: string | null;
  unavailable?: string;
}

export interface AdConfig {
  /** Ad network name, e.g. "adsense", "ethicalads". */
  network: string;
  /** Publisher / property id supplied by the network. */
  publisherId: string;
  /** Slot ids per placement. Empty = placement disabled. */
  slots: { sidebar: string; footer: string };
  enabled: boolean;
}

export const EMPTY_ADS: AdConfig = {
  network: "", publisherId: "", slots: { sidebar: "", footer: "" }, enabled: false,
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/treasury${path}`, {
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

export async function getMinerConfig(): Promise<{ configured: boolean; config: MinerConfig; error?: string }> {
  try {
    const res = await call<{ configured: boolean; config: Partial<MinerConfig> }>("/config");
    return { configured: res.configured, config: { ...EMPTY_MINER, ...res.config } };
  } catch (e) {
    return { configured: false, config: EMPTY_MINER, error: (e as Error).message };
  }
}

export async function saveMinerConfig(config: MinerConfig) {
  try {
    await call("/config", { method: "POST", body: JSON.stringify(config) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function minerStatus(): Promise<MinerStatus> {
  try {
    return await call<MinerStatus>("/miner/status");
  } catch (e) {
    return {
      ok: false, configured: false, enabled: false, running: false,
      started_at: null, stats: null, stats_error: null, unavailable: (e as Error).message,
    };
  }
}

export async function startMiner() {
  try {
    await call("/miner/start", { method: "POST" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function stopMiner() {
  try {
    await call("/miner/stop", { method: "POST" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function recordPayout(entry: {
  source: string;
  amount: number;
  currency?: string;
  note?: string;
  evidenceUrl?: string;
}) {
  try {
    await call("/ledger", {
      method: "POST",
      body: JSON.stringify({
        source: entry.source,
        amount: entry.amount,
        currency: entry.currency ?? "USD",
        note: entry.note ?? null,
        evidence_url: entry.evidenceUrl ?? null,
      }),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type { LedgerEntry };

// --------------------------------------------------------------- ad slots
export async function getAdConfig(): Promise<AdConfig> {
  const stored = await kvGet<Partial<AdConfig>>("system", "ad_config");
  return { ...EMPTY_ADS, ...(stored ?? {}) };
}

export async function saveAdConfig(config: AdConfig) {
  try {
    await kvSet("system", "ad_config", config);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** An ad placement only renders when the network, publisher and slot are real. */
export function adPlacementReady(config: AdConfig, slot: keyof AdConfig["slots"]): boolean {
  return Boolean(config.enabled && config.network && config.publisherId && config.slots[slot]);
}
