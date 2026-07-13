/**
 * agents.ts — Agent registry, definitions, and orchestration types.
 * Inspired by AutoGPT / CrewAI patterns: each agent has tools, memory, and a role.
 */

export type AgentTool =
  | "web_search"
  | "code_exec"
  | "market_data"
  | "github"
  | "ai_chat"
  | "file_io";

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  goal: string;
  model: string;
  tools: AgentTool[];
  memory: "ephemeral" | "session" | "persistent";
  status: "idle" | "running" | "error" | "paused";
  lastRun?: string;
  successRate: number;
}

const DEFAULTS: AgentDef[] = [
  {
    id: "agt_alpha",
    name: "AlphaHunter",
    role: "Quant analyst",
    goal: "Detect alpha opportunities across crypto + equities using sentiment + flow.",
    model: "google/gemini-3-flash-preview",
    tools: ["market_data", "web_search", "ai_chat"],
    memory: "session",
    status: "running",
    lastRun: new Date(Date.now() - 90_000).toISOString(),
    successRate: 0.78,
  },
  {
    id: "agt_whale",
    name: "WhaleTracker",
    role: "On-chain analyst",
    goal: "Track large transfers and infer institutional positioning.",
    model: "google/gemini-2.5-flash-lite",
    tools: ["market_data", "ai_chat"],
    memory: "persistent",
    status: "idle",
    lastRun: new Date(Date.now() - 600_000).toISOString(),
    successRate: 0.84,
  },
  {
    id: "agt_news",
    name: "NarrativeScout",
    role: "News intelligence",
    goal: "Cluster headlines into narratives and score sentiment + tickers.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "ai_chat"],
    memory: "session",
    status: "running",
    lastRun: new Date(Date.now() - 30_000).toISOString(),
    successRate: 0.71,
  },
  {
    id: "agt_dev",
    name: "CodeShepherd",
    role: "Self-coding maintainer",
    goal: "Propose safe refactors, run tests, commit via GitHub.",
    model: "openai/gpt-5",
    tools: ["code_exec", "github", "file_io"],
    memory: "persistent",
    status: "paused",
    successRate: 0.65,
  },
  {
    id: "agt_opensource",
    name: "OpenSourceScout",
    role: "OSS discovery",
    goal: "Scan GitHub / GitLab / open-source registries for code that matches project needs and propose adaptations.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "github", "ai_chat"],
    memory: "persistent",
    status: "paused",
    successRate: 0.7,
  },
  {
    id: "agt_trading_projects",
    name: "TradingProjectsScout",
    role: "Trading OSS scout",
    goal: "Track open-source trading bots (Freqtrade, Jesse, Nautilus, Hummingbot) for features + patterns worth adopting.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "github", "ai_chat"],
    memory: "persistent",
    status: "paused",
    successRate: 0.68,
  },
  {
    id: "agt_master_reviewer",
    name: "MasterCodeReviewer",
    role: "Chief architect",
    goal: "Consolidate scout recommendations, diff against this repo, and produce ranked upgrade tickets.",
    model: "openai/gpt-5",
    tools: ["code_exec", "github", "ai_chat", "file_io"],
    memory: "persistent",
    status: "paused",
    successRate: 0.74,
  },
  {
    id: "agt_news_x",
    name: "NewsAgent · X",
    role: "Social intelligence",
    goal: "Track Top-20 analysts + user-favorite handles on X for market-moving posts. Score, dedupe, summarize.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "ai_chat"],
    memory: "session",
    status: "paused",
    successRate: 0.66,
  },
  {
    id: "agt_news_yt",
    name: "NewsAgent · YouTube",
    role: "Video intelligence",
    goal: "Watch favorite channels (e.g. Meet Kevin, Micha Stocks) — transcribe, extract tickers, build learning notes.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "ai_chat", "file_io"],
    memory: "persistent",
    status: "paused",
    successRate: 0.62,
  },
  {
    id: "agt_learning_plan",
    name: "LearningPlanBuilder",
    role: "Curriculum designer",
    goal: "Turn analyst content into a study plan: when to act, trading rules, historical setups per ticker.",
    model: "openai/gpt-5",
    tools: ["ai_chat", "file_io"],
    memory: "persistent",
    status: "paused",
    successRate: 0.7,
  },
  {
    id: "agt_hybrid_router",
    name: "HybridRouter",
    role: "Compute broker",
    goal: "Decide per-task whether to hit local Ollama or burst to external API — by latency, cost, quality budget.",
    model: "google/gemini-2.5-flash-lite",
    tools: ["ai_chat", "market_data"],
    memory: "session",
    status: "paused",
    successRate: 0.81,
  },
  {
    id: "agt_chrome_vision",
    name: "ChromeVisionAgent",
    role: "Screen observer",
    goal: "Use Chrome's new on-device vision to read charts / dashboards the user sees and answer questions in context.",
    model: "google/gemini-3-flash-preview",
    tools: ["ai_chat", "code_exec"],
    memory: "session",
    status: "paused",
    successRate: 0.6,
  },
  {
    id: "agt_tech_scout",
    name: "TechScout",
    role: "Tech radar",
    goal: "Discover new AI tooling (Ollama agent packs, OpenClaw, NemoClew, MCP servers) and propose integrations.",
    model: "google/gemini-3-flash-preview",
    tools: ["web_search", "ai_chat"],
    memory: "persistent",
    status: "paused",
    successRate: 0.64,
  },
];


const KEY = "agents.registry";

export function loadAgents(): AgentDef[] {
  if (typeof localStorage === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveAgents(agents: AgentDef[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(agents));
}

export function toggleAgent(id: string): AgentDef[] {
  const all = loadAgents().map((a) =>
    a.id === id
      ? { ...a, status: a.status === "running" ? ("paused" as const) : ("running" as const) }
      : a,
  );
  saveAgents(all);
  return all;
}

export function exportAgents(): string {
  return JSON.stringify(loadAgents(), null, 2);
}

export function importAgents(json: string): AgentDef[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("Invalid agents bundle");
  saveAgents(parsed);
  return parsed;
}
