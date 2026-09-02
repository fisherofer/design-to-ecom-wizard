/**
 * localAiScan — load GGUF weights from the local models dir and run a LOCAL
 * risk scan that is compared against the engine's real ATR VaR.
 *
 * Backend: hub/local_ai_routes.py (mounted at /api/local-ai).
 * Prices/ATR come from hub/quotes_router.py through liveQuotes.ts — nothing is
 * fabricated here: when the feed or the local runtime is unavailable the scan
 * reports the failure instead of inventing a number.
 */
import { getApiBase } from "@/lib/apiConfig";
import { atrVarUsd, getSmartConfig } from "@/lib/engineConfig";
import { estimateAtr, fetchQuotes, pushPrice } from "@/lib/liveQuotes";

const TIMEOUT_MS = 180_000;

export interface LocalModelFile {
  name: string;
  path: string;
  size_bytes: number;
  format: string;
}

export interface LocalAiStatus {
  ok: boolean;
  models_dir: string;
  disk_free_bytes: number;
  ready: boolean;
  local_files: { ok: boolean; dir: string; exists: boolean; models: LocalModelFile[] };
  ollama: { running: boolean; url: string; models: { name: string }[] };
  lmstudio: { running: boolean; url: string; models: { name: string }[] };
  venv_ai: { ok: boolean; venv_dir: string; missing: string[] };
  error?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/local-ai${path}`, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...init,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((body as { detail?: { error?: string } })?.detail?.error ?? `HTTP ${res.status}`);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLocalAiStatus(): Promise<LocalAiStatus> {
  try {
    return await call<LocalAiStatus>("/status");
  } catch (e) {
    return {
      ok: false,
      models_dir: "—",
      disk_free_bytes: 0,
      ready: false,
      local_files: { ok: false, dir: "—", exists: false, models: [] },
      ollama: { running: false, url: "", models: [] },
      lmstudio: { running: false, url: "", models: [] },
      venv_ai: { ok: false, venv_dir: "—", missing: [] },
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function loadGgufModel(modelPath: string, nCtx = 4096, nGpuLayers = 0) {
  return call<{ ok: boolean; name: string; path: string; already_loaded: boolean }>("/load", {
    method: "POST",
    body: JSON.stringify({ model_path: modelPath, n_ctx: nCtx, n_gpu_layers: nGpuLayers }),
  });
}

export async function unloadGgufModel(modelPath: string) {
  return call<{ ok: boolean }>("/unload", {
    method: "POST",
    body: JSON.stringify({ model_path: modelPath }),
  });
}

export async function loadedModels() {
  return call<{ ok: boolean; models: { name: string; path: string; n_ctx: number }[] }>("/loaded");
}

export async function localGenerate(prompt: string, model?: string) {
  return call<{ ok: boolean; runtime: string; model: string; text: string }>("/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, model, max_tokens: 256, temperature: 0.1 }),
  });
}

/* ------------------------------------------------------------------ *
 * The scan itself
 * ------------------------------------------------------------------ */

export interface ScanRow {
  symbol: string;
  price: number;
  atr14: number;
  /** Engine truth — HardRiskManager.create_execution_ticket mirror. */
  engineVarUsd: number;
  engineShares: number;
  /** Local model estimate of the same VaR. */
  modelVarUsd: number | null;
  modelVolMultiple: number | null;
  deltaPct: number | null;
  verdict: "ALIGNED" | "MODEL_HOTTER" | "MODEL_COLDER" | "NO_MODEL";
  note: string;
}

export interface ScanResult {
  ok: boolean;
  runtime: string | null;
  model: string | null;
  ranAt: string;
  rows: ScanRow[];
  avgAbsDeltaPct: number;
  error?: string;
}

const NUM = /-?\d+(\.\d+)?/;

function parseMultiple(text: string): number | null {
  try {
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
      vol_multiple?: number;
    };
    if (typeof json.vol_multiple === "number") return json.vol_multiple;
  } catch {
    /* fall through to loose parsing */
  }
  const m = text.match(NUM);
  const v = m ? Number(m[0]) : NaN;
  return Number.isFinite(v) ? v : null;
}

/**
 * Runs a local-model scan over `symbols` and compares its risk estimate with
 * the real ATR VaR computed from live quotes.
 */
export async function runLocalVarScan(symbols: string[], model?: string): Promise<ScanResult> {
  const ranAt = new Date().toISOString();
  const smart = getSmartConfig();

  const feed = await fetchQuotes(symbols);
  if (!feed.ok) {
    return {
      ok: false,
      runtime: null,
      model: null,
      ranAt,
      rows: [],
      avgAbsDeltaPct: 0,
      error: feed.error ?? "quotes_router unavailable — refusing to scan on fabricated prices",
    };
  }

  Object.values(feed.quotes).forEach((q) => q?.price > 0 && pushPrice(q.symbol, q.price));

  const rows: ScanRow[] = [];
  let runtime: string | null = null;
  let usedModel: string | null = null;
  let fatal: string | undefined;

  for (const symbol of symbols) {
    const q = feed.quotes[symbol];
    if (!q || !(q.price > 0)) continue;
    const high = q.high ?? q.price;
    const low = q.low ?? q.price;
    const atr14 = estimateAtr(symbol) ?? Math.max(high - low, q.price * 0.005);
    const engine = atrVarUsd(smart, atr14);

    let modelVolMultiple: number | null = null;
    let note = "";
    if (!fatal) {
      const prompt = [
        "You are a quantitative risk model running locally. Reply with JSON only.",
        `Symbol: ${symbol}`,
        `Last price: ${q.price}`,
        `Session high/low: ${high}/${low}`,
        `Change %: ${q.change_pct ?? 0}`,
        `Measured ATR(14): ${atr14.toFixed(4)}`,
        `Account risk per trade: ${smart.riskPerTradePct}% of ${smart.initialEquityUsd} USD`,
        `Baseline stop multiple: ${smart.atrStopMultiple}x ATR`,
        'Estimate the stop multiple you would use. Answer exactly: {"vol_multiple": <number>}',
      ].join("\n");
      try {
        const out = await localGenerate(prompt, model);
        runtime = runtime ?? out.runtime;
        usedModel = usedModel ?? out.model;
        modelVolMultiple = parseMultiple(out.text);
        note = modelVolMultiple === null ? `unparsable local answer: ${out.text.slice(0, 60)}` : "";
      } catch (e) {
        fatal = e instanceof Error ? e.message : String(e);
        note = fatal;
      }
    } else {
      note = fatal;
    }

    const modelVarUsd =
      modelVolMultiple && modelVolMultiple > 0
        ? atrVarUsd({ ...smart, atrStopMultiple: modelVolMultiple }, atr14).varUsd
        : null;
    const deltaPct =
      modelVarUsd !== null && engine.varUsd > 0
        ? ((modelVarUsd - engine.varUsd) / engine.varUsd) * 100
        : null;

    rows.push({
      symbol,
      price: q.price,
      atr14: Number(atr14.toFixed(4)),
      engineVarUsd: Number(engine.varUsd.toFixed(2)),
      engineShares: engine.shares,
      modelVarUsd: modelVarUsd === null ? null : Number(modelVarUsd.toFixed(2)),
      modelVolMultiple,
      deltaPct: deltaPct === null ? null : Number(deltaPct.toFixed(2)),
      verdict:
        deltaPct === null
          ? "NO_MODEL"
          : Math.abs(deltaPct) <= 10
            ? "ALIGNED"
            : deltaPct > 0
              ? "MODEL_HOTTER"
              : "MODEL_COLDER",
      note,
    });
  }

  const deltas = rows.map((r) => r.deltaPct).filter((d): d is number => d !== null);
  return {
    ok: deltas.length > 0,
    runtime,
    model: usedModel,
    ranAt,
    rows,
    avgAbsDeltaPct: deltas.length
      ? Number((deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length).toFixed(2))
      : 0,
    error: fatal,
  };
}
