/**
 * agentBuilder.ts — Editable agent fields layered on top of agents.ts.
 * Stores prompt, schedule, and tool toggles so the builder UI can persist edits.
 */
import { loadAgents, saveAgents, type AgentDef, type AgentTool } from "./agents";

export type Schedule =
  | { kind: "manual" }
  | { kind: "interval"; everyMinutes: number }
  | { kind: "cron"; expr: string };

export interface AgentBlueprint extends AgentDef {
  systemPrompt: string;
  userPromptTemplate: string;
  schedule: Schedule;
  temperature: number;
  maxTokens: number;
}

const KEY = "agents.blueprints";

const DEFAULT_PROMPT = (a: AgentDef) =>
  `You are ${a.name}, a ${a.role}.\nGoal: ${a.goal}\nBe terse, cite sources, and return JSON when possible.`;

export function loadBlueprints(): AgentBlueprint[] {
  if (typeof localStorage === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : seed();
  } catch { return seed(); }
}

function seed(): AgentBlueprint[] {
  return loadAgents().map((a) => ({
    ...a,
    systemPrompt: DEFAULT_PROMPT(a),
    userPromptTemplate: "Context:\n{{context}}\n\nTask: {{task}}",
    schedule: { kind: "interval", everyMinutes: 15 },
    temperature: 0.4,
    maxTokens: 1024,
  }));
}

export function saveBlueprints(list: AgentBlueprint[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  // mirror status back to base registry so other screens stay in sync.
  saveAgents(list.map(({ systemPrompt, userPromptTemplate, schedule, temperature, maxTokens, ...rest }) => rest));
}

export function upsertBlueprint(bp: AgentBlueprint) {
  const all = loadBlueprints();
  const idx = all.findIndex((x) => x.id === bp.id);
  if (idx >= 0) all[idx] = bp; else all.push(bp);
  saveBlueprints(all);
  return all;
}

export function deleteBlueprint(id: string) {
  const all = loadBlueprints().filter((x) => x.id !== id);
  saveBlueprints(all);
  return all;
}

export function newBlueprint(): AgentBlueprint {
  const id = `agt_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id, name: "New Agent", role: "Researcher", goal: "Describe the goal.",
    model: "google/gemini-3-flash-preview",
    tools: ["ai_chat"], memory: "session", status: "paused", successRate: 0,
    systemPrompt: "You are a helpful agent.",
    userPromptTemplate: "Task: {{task}}",
    schedule: { kind: "manual" },
    temperature: 0.4, maxTokens: 1024,
  };
}

export const ALL_TOOLS: AgentTool[] = ["web_search", "code_exec", "market_data", "github", "ai_chat", "file_io"];
