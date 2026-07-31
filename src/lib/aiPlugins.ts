/**
 * aiPlugins.ts — AI Plugins Manager registry.
 *
 * A plugin is a capability the assistant/agents may invoke. Each declares the
 * interfaces it depends on so the UI can show, honestly, whether it is usable
 * right now (`ready`) or blocked on a missing credential / offline backend.
 */

export type PluginCategory = "market" | "trading" | "research" | "system" | "ai";

export interface AiPlugin {
  id: string;
  name: string;
  category: PluginCategory;
  description: string;
  /** Human-readable requirements — env keys or a reachable backend route. */
  requires: string[];
  /** Backend route (if any) this plugin calls. */
  endpoint?: string;
  /** Risk annotation shown in the UI; write-capable plugins are flagged. */
  writes: boolean;
  defaultEnabled: boolean;
}

export const AI_PLUGINS: AiPlugin[] = [
  {
    id: "quotes",
    name: "Live Quotes",
    category: "market",
    description: "Unified quote lookup with provider fallback (Alpaca → Finnhub → TwelveData → AlphaVantage).",
    requires: ["ALPACA_API_KEY", "or FINNHUB_API_KEY"],
    endpoint: "/api/market-data/quote",
    writes: false,
    defaultEnabled: true,
  },
  {
    id: "alerts",
    name: "Alerts Hub",
    category: "system",
    description: "Persistent alert store with content de-duplication and acknowledge/purge lifecycle.",
    requires: ["Python backend"],
    endpoint: "/api/alerts/list",
    writes: true,
    defaultEnabled: true,
  },
  {
    id: "backtest",
    name: "Backtesting Engine",
    category: "trading",
    description: "Vectorized backtests: Sharpe, max drawdown, profit factor, win rate.",
    requires: ["Python backend"],
    endpoint: "/api/backtest/run",
    writes: false,
    defaultEnabled: true,
  },
  {
    id: "risk",
    name: "Hard Risk Manager",
    category: "trading",
    description: "Deterministic position sizing, ATR stops and circuit breakers — no AI in the loop.",
    requires: ["Python backend"],
    endpoint: "/api/risk/status",
    writes: true,
    defaultEnabled: true,
  },
  {
    id: "oms",
    name: "Order Management",
    category: "trading",
    description: "Paper-only order routing through Alpaca with Stage-1 exchange assertion.",
    requires: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"],
    endpoint: "/api/trading/orders",
    writes: true,
    defaultEnabled: false,
  },
  {
    id: "account",
    name: "Account Summary",
    category: "trading",
    description: "Live paper account equity, buying power and positions with simulated/live labeling.",
    requires: ["ALPACA_API_KEY", "ALPACA_SECRET_KEY"],
    endpoint: "/api/account/summary",
    writes: false,
    defaultEnabled: true,
  },
  {
    id: "news",
    name: "News Intelligence",
    category: "research",
    description: "Headline ingestion and sentiment tagging for the intelligence feed.",
    requires: ["NEWSAPI_KEY"],
    writes: false,
    defaultEnabled: false,
  },
  {
    id: "web-research",
    name: "Web Research",
    category: "research",
    description: "Grounded web lookup for agent research tasks.",
    requires: ["Lovable AI Gateway"],
    writes: false,
    defaultEnabled: true,
  },
  {
    id: "self-coding",
    name: "Self-Coding Proposals",
    category: "ai",
    description: "Generates patch proposals; always routed through the Safe-Change workflow before apply.",
    requires: ["Lovable AI Gateway"],
    writes: true,
    defaultEnabled: false,
  },
  {
    id: "venv",
    name: "Venv Manager",
    category: "system",
    description: "OS-independent virtualenv health, heal and recreate for the Python side.",
    requires: ["Python backend"],
    endpoint: "/api/venv/status",
    writes: true,
    defaultEnabled: true,
  },
  {
    id: "mcp",
    name: "MCP Bridge",
    category: "ai",
    description: "Model Context Protocol tool bridge for external tool servers.",
    requires: ["Python backend"],
    endpoint: "/api/mcp/tools",
    writes: true,
    defaultEnabled: false,
  },
  {
    id: "screen-context",
    name: "Screen Context",
    category: "ai",
    description: "Feeds the current route + visible widgets to the assistant for grounded answers.",
    requires: [],
    writes: false,
    defaultEnabled: true,
  },
];

const KEY = "ai-os.plugins.enabled.v1";
export const PLUGINS_EVENT = "ai-os:plugins-changed";

function read(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

export const aiPlugins = {
  all: () => AI_PLUGINS,

  enabledMap(): Record<string, boolean> {
    const stored = read();
    const out: Record<string, boolean> = {};
    for (const p of AI_PLUGINS) out[p.id] = stored[p.id] ?? p.defaultEnabled;
    return out;
  },

  isEnabled(id: string) {
    return this.enabledMap()[id] ?? false;
  },

  toggle(id: string, on: boolean) {
    if (typeof window === "undefined") return;
    const next = { ...read(), [id]: on };
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PLUGINS_EVENT));
  },

  reset() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(PLUGINS_EVENT));
  },

  /** Plugins that are enabled AND whose declared requirements are satisfied. */
  active(satisfied: (requirement: string) => boolean): AiPlugin[] {
    const map = this.enabledMap();
    return AI_PLUGINS.filter((p) => map[p.id] && p.requires.every(satisfied));
  },
};
