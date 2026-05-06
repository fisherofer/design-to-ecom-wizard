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
