/**
 * agentTemplates — curated preset library. Users can clone any template
 * into a new blueprint with one click, so agent creation isn't "start from
 * a blank prompt". Templates cover the roles we actually route in the app
 * (research, risk, execution, whale, coordinator, code, education).
 */
import type { AgentBlueprint } from "./agentBuilder";

export interface AgentTemplate {
  key: string;
  label: string;
  category: "research" | "trading" | "risk" | "engineering" | "learning" | "meta";
  description: string;
  blueprint: Omit<AgentBlueprint, "id">;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    key: "alpha-hunter",
    label: "Alpha Hunter",
    category: "research",
    description: "Scans movers + flow to surface tradable setups with catalyst + stop levels.",
    blueprint: {
      name: "AlphaHunter",
      role: "Quant analyst",
      goal: "Detect asymmetric setups on liquid US equities and crypto.",
      model: "google/gemini-3-flash-preview",
      tools: ["market_data", "web_search", "ai_chat"],
      memory: "session", status: "paused", successRate: 0,
      systemPrompt:
        "You are AlphaHunter. Rank the top 5 setups from the context. For each: ticker, setup name, entry, stop, R:R, catalyst, expected timeline. Reject any idea with R:R < 2. Return strict JSON.",
      userPromptTemplate: "Universe context:\n{{context}}\n\nUser focus: {{task}}",
      schedule: { kind: "interval", everyMinutes: 30 },
      temperature: 0.3, maxTokens: 1200,
    },
  },
  {
    key: "risk-guard",
    label: "Risk Guard",
    category: "risk",
    description: "Reviews open positions vs. account drawdown and flags reduction actions.",
    blueprint: {
      name: "RiskGuard",
      role: "Risk manager",
      goal: "Keep account within max drawdown; propose exact size cuts.",
      model: "google/gemini-2.5-flash-lite",
      tools: ["market_data", "ai_chat"],
      memory: "persistent", status: "paused", successRate: 0,
      systemPrompt:
        "You are RiskGuard. Given positions and a daily drawdown, output a bulleted plan: which positions to trim, by how many shares, and target portfolio heat after action. Be conservative.",
      userPromptTemplate: "Positions:\n{{context}}\n\nRisk question: {{task}}",
      schedule: { kind: "interval", everyMinutes: 10 },
      temperature: 0.2, maxTokens: 800,
    },
  },
  {
    key: "whale-tracker",
    label: "Whale Tracker",
    category: "trading",
    description: "Watches unusual options flow + on-chain whale transfers, dedupes and scores.",
    blueprint: {
      name: "WhaleTracker",
      role: "On-chain / flow analyst",
      goal: "Extract signal from institutional prints and dedupe noise.",
      model: "google/gemini-3-flash-preview",
      tools: ["market_data", "web_search", "ai_chat"],
      memory: "persistent", status: "paused", successRate: 0,
      systemPrompt:
        "You are WhaleTracker. Classify each print as: sweep / block / dark-pool / on-chain. Only surface prints > $1M notional or > 3× 20d avg. Return JSON with reason each survived the filter.",
      userPromptTemplate: "Prints feed:\n{{context}}\n\nAsk: {{task}}",
      schedule: { kind: "interval", everyMinutes: 5 },
      temperature: 0.25, maxTokens: 1000,
    },
  },
  {
    key: "news-triage",
    label: "News Triage",
    category: "research",
    description: "Clusters headlines into narratives and tags tradable tickers with sentiment.",
    blueprint: {
      name: "NewsTriage",
      role: "News intelligence",
      goal: "Turn headline noise into ranked narratives.",
      model: "google/gemini-3-flash-preview",
      tools: ["web_search", "ai_chat"],
      memory: "session", status: "paused", successRate: 0,
      systemPrompt:
        "You are NewsTriage. Cluster headlines by narrative. Output: narrative title, driver, sentiment (-1..1), affected tickers, half-life estimate (h). JSON array.",
      userPromptTemplate: "Headlines:\n{{context}}\n\nUser filter: {{task}}",
      schedule: { kind: "interval", everyMinutes: 15 },
      temperature: 0.4, maxTokens: 1000,
    },
  },
  {
    key: "trade-reflection",
    label: "Trade Reflection Coach",
    category: "learning",
    description: "Post-mortem for closed trades: grade, mistakes, next-time rules.",
    blueprint: {
      name: "ReflectionCoach",
      role: "Trading coach",
      goal: "Turn closed trades into repeatable playbooks.",
      model: "openai/gpt-5",
      tools: ["ai_chat", "file_io"],
      memory: "persistent", status: "paused", successRate: 0,
      systemPrompt:
        "You are ReflectionCoach. Given a closed trade with entry/exit/context, produce: execution grade (A-F), 3 things done right, 3 mistakes, and 3 concrete rules to add to the playbook.",
      userPromptTemplate: "Trade:\n{{context}}\n\nCoach on: {{task}}",
      schedule: { kind: "manual" },
      temperature: 0.5, maxTokens: 900,
    },
  },
  {
    key: "code-shepherd",
    label: "Code Shepherd",
    category: "engineering",
    description: "Reviews diffs, proposes refactors, blocks unsafe changes.",
    blueprint: {
      name: "CodeShepherd",
      role: "Self-coding maintainer",
      goal: "Keep the repo tidy and safe; propose PR-sized changes.",
      model: "openai/gpt-5",
      tools: ["code_exec", "github", "file_io"],
      memory: "persistent", status: "paused", successRate: 0,
      systemPrompt:
        "You are CodeShepherd. Review the diff. Output: risk (low/med/high), files touched, tests to add, rollback plan. Reject if secrets are added or RLS is disabled.",
      userPromptTemplate: "Diff:\n{{context}}\n\nReview goal: {{task}}",
      schedule: { kind: "manual" },
      temperature: 0.2, maxTokens: 1500,
    },
  },
  {
    key: "coordinator",
    label: "Coordinator",
    category: "meta",
    description: "Meta-planner that decomposes user goals and routes to specialist agents.",
    blueprint: {
      name: "Coordinator",
      role: "Meta planner",
      goal: "Break a goal into an ordered plan and pick the best agent for each step.",
      model: "openai/gpt-5",
      tools: ["ai_chat"],
      memory: "session", status: "paused", successRate: 0,
      systemPrompt:
        "You are Coordinator. Produce a JSON plan: [{step, agent, input, why}]. Prefer the cheapest agent that can do the step. Stop at 5 steps.",
      userPromptTemplate: "Available agents:\n{{context}}\n\nUser goal: {{task}}",
      schedule: { kind: "manual" },
      temperature: 0.3, maxTokens: 1000,
    },
  },
];

export function templateToBlueprint(t: AgentTemplate): Omit<AgentBlueprint, "id"> {
  return { ...t.blueprint };
}
