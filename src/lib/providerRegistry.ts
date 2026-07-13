/**
 * Provider Registry
 * =================
 * Manages the connector list in localStorage and exposes:
 *  - CRUD + reactive hook
 *  - `pickBest(category, {task, sensitivity})` that combines the Compute
 *    Router's decision (local vs cloud) with the connector's own priority,
 *    live health cache, and budget headroom.
 *  - `execute(category, input)` — one-shot: pick + invoke + record spend.
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_CONNECTORS,
  invoke as invokeConnector,
  healthCheck as connectorHealth,
  type ConnectorCategory,
  type ConnectorConfig,
  type ConnectorFamily,
  type InvokeInput,
  type InvokeResult,
} from "./providerConnectors";
import { apiBudget } from "./apiBudget";
import { decideRoute, type TaskProfile, type Sensitivity } from "./computeRouter";

const STORAGE_KEY = "ai-os.provider-registry.v1";
const EVENT = "ai-os:provider-registry-changed";

interface RegistryState {
  connectors: ConnectorConfig[];
  health: Record<string, { online: boolean; latencyMs: number; checkedAt: number; detail?: string }>;
}

function read(): RegistryState {
  if (typeof window === "undefined") return { connectors: DEFAULT_CONNECTORS, health: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { connectors: DEFAULT_CONNECTORS, health: {} };
    const parsed = JSON.parse(raw);
    // merge new defaults so upgrades don't lose new connectors
    const byId = new Map<string, ConnectorConfig>();
    for (const c of DEFAULT_CONNECTORS) byId.set(c.id, c);
    for (const c of parsed.connectors ?? []) byId.set(c.id, { ...byId.get(c.id), ...c });
    return { connectors: Array.from(byId.values()), health: parsed.health ?? {} };
  } catch {
    return { connectors: DEFAULT_CONNECTORS, health: {} };
  }
}

function write(next: RegistryState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const providerRegistry = {
  get: read,
  list(family?: ConnectorFamily) {
    const s = read();
    return family ? s.connectors.filter((c) => c.family === family) : s.connectors;
  },
  byCategory(category: ConnectorCategory) {
    return read().connectors.filter((c) => c.category === category);
  },
  upsert(patch: Partial<ConnectorConfig> & { id: string }) {
    const s = read();
    const idx = s.connectors.findIndex((c) => c.id === patch.id);
    if (idx >= 0) s.connectors[idx] = { ...s.connectors[idx], ...patch };
    else s.connectors.push({
      name: patch.name ?? patch.id,
      family: patch.family ?? "llm",
      category: patch.category ?? "llm.custom",
      baseUrl: patch.baseUrl ?? "",
      enabled: patch.enabled ?? true,
      priority: patch.priority ?? 5,
      ...patch,
    } as ConnectorConfig);
    write(s);
  },
  remove(id: string) {
    const s = read();
    s.connectors = s.connectors.filter((c) => c.id !== id);
    delete s.health[id];
    write(s);
  },
  async probe(id: string) {
    const s = read();
    const c = s.connectors.find((x) => x.id === id);
    if (!c) return;
    const h = await connectorHealth(c);
    s.health[id] = { ...h, checkedAt: Date.now() };
    write(s);
    return h;
  },
  async probeAll() {
    const s = read();
    for (const c of s.connectors.filter((x) => x.enabled)) {
      // fire-and-forget, but keep them somewhat sequential
      // to avoid saturating the browser
      // eslint-disable-next-line no-await-in-loop
      const h = await connectorHealth(c);
      s.health[c.id] = { ...h, checkedAt: Date.now() };
    }
    write(s);
  },
  reset() { write({ connectors: DEFAULT_CONNECTORS, health: {} }); },
};

// -------------------- picker --------------------

export interface PickOptions {
  task?: TaskProfile;
  sensitivity?: Sensitivity;
  estTokens?: number;
  /** Force local/cloud family within LLM categories. */
  preferLocal?: boolean;
}

export interface PickResult {
  chosen: ConnectorConfig | null;
  reason: string;
  trace: string[];
}

/** Combine ComputeRouter's local/cloud verdict with connector priorities + health. */
export function pickConnector(category: ConnectorCategory, opts: PickOptions = {}): PickResult {
  const state = read();
  const eligible = state.connectors.filter((c) => c.category === category && c.enabled);
  const trace: string[] = [`category=${category} eligible=${eligible.length}`];
  if (!eligible.length) return { chosen: null, reason: "no enabled connectors in this category", trace };

  // For LLM categories, defer to the compute router's local/cloud verdict
  if (category.startsWith("llm.") && opts.task) {
    const route = decideRoute({
      task: opts.task,
      sensitivity: opts.sensitivity,
      estTokens: opts.estTokens,
    });
    trace.push(`router → ${route.mode} (${route.reason})`);
    const wantLocal = opts.preferLocal ?? route.mode === "local";
    const wantCloud = route.mode === "cloud" || route.mode === "hybrid";
    const filtered = eligible.filter((c) => {
      if (wantLocal && c.category === "llm.local") return true;
      if (wantCloud && (c.category === "llm.cloud" || c.category === "llm.custom")) return true;
      return category === c.category;
    });
    if (filtered.length) return score(filtered, state, trace);
  }

  return score(eligible, state, trace);
}

function score(list: ConnectorConfig[], state: RegistryState, trace: string[]): PickResult {
  const scored = list.map((c) => {
    const h = state.health[c.id];
    const online = h?.online ?? true; // assume online if never probed
    const latency = h?.latencyMs ?? 500;
    // budget headroom
    const bud = apiBudget.get();
    const mk = new Date().toISOString().slice(0, 7);
    const spent = bud.usage.months[mk]?.providers[c.id] ?? 0;
    const cap = bud.caps.perProviderUsd[c.id] ?? bud.caps.globalUsd ?? 0;
    const headroom = cap > 0 ? Math.max(0, 1 - spent / cap) : 1;

    let s = 100 - (c.priority * 10);
    s += online ? 20 : -60;
    s -= Math.min(30, latency / 50);
    s += headroom * 15;
    if ((c.costPer1kUsd ?? 0) === 0) s += 10;
    return { c, s, online, headroom, latency };
  }).sort((a, b) => b.s - a.s);

  for (const r of scored) {
    trace.push(`${r.c.id} score=${r.s.toFixed(1)} online=${r.online} headroom=${(r.headroom * 100).toFixed(0)}% latency=${r.latency}ms`);
  }
  const top = scored[0];
  return top
    ? { chosen: top.c, reason: `picked ${top.c.name} (score ${top.s.toFixed(1)})`, trace }
    : { chosen: null, reason: "no candidate", trace };
}

/** Pick + invoke + record spend in one call. */
export async function execute(
  category: ConnectorCategory,
  input: InvokeInput,
  opts: PickOptions = {},
): Promise<InvokeResult & { pick: PickResult }> {
  const pick = pickConnector(category, opts);
  if (!pick.chosen) {
    return { ok: false, provider: "-", latencyMs: 0, costUsd: 0, error: pick.reason, pick };
  }
  const result = await invokeConnector(pick.chosen, input);
  if (result.ok && result.costUsd > 0) {
    apiBudget.record({ provider: pick.chosen.id, usd: result.costUsd });
  }
  return { ...result, pick };
}

// -------------------- hook --------------------

export function useProviderRegistry(): RegistryState {
  const [s, setS] = useState<RegistryState>(read);
  useEffect(() => {
    const sync = () => setS(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return s;
}
