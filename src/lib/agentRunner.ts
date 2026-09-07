/**
 * agentRunner — executes an AgentBlueprint through the unified aiRouter, so
 * every agent runs on the LOCAL model first and only falls back to the cloud
 * when the compute policy allows it. Runs are persisted twice: to agentRunLog
 * (UI history) and to the local venv SQLite store under scope "system".
 */
import { aiComplete, type Engine } from "./aiRouter";
import { logAgentRun } from "./localStore";
import type { TaskProfile } from "./computeRouter";
import { agentRunLog, type AgentRunRecord } from "./agentRunLog";
import type { AgentBlueprint } from "./agentBuilder";

function compile(template: string, taskInput: string, context = ""): string {
  return template
    .replaceAll("{{task}}", taskInput || "(empty)")
    .replaceAll("{{context}}", context || "(no context)");
}

function newId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface RunAgentOptions {
  taskInput: string;
  context?: string;
  source?: AgentRunRecord["source"];
  /** Force local or cloud execution; omit to follow the compute policy. */
  engine?: Engine;
  /** Routing profile — "code" for code-upgrade agents, "chat" for the rest. */
  task?: TaskProfile;
  /** Personal data in the prompt keeps the run on the local model only. */
  private?: boolean;
}

export async function runAgent(agent: AgentBlueprint, opts: RunAgentOptions): Promise<AgentRunRecord> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const userPrompt = compile(agent.userPromptTemplate, opts.taskInput, opts.context);

  let output = "";
  let ok = false;
  let error: string | undefined;
  let modelId = agent.model;
  let runtime = "unknown";

  try {
    const res = await aiComplete({
      system: agent.systemPrompt,
      prompt: userPrompt,
      task: opts.task ?? "chat",
      sensitivity: opts.private ? "private" : "public",
      force: opts.engine,
      preferModel: agent.model,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
    });
    output = res.text;
    ok = res.ok;
    error = res.error;
    modelId = res.model || agent.model;
    runtime = res.runtime;
  } catch (e) {
    error = (e as Error).message ?? "runner error";
  }

  const finishedAt = new Date().toISOString();
  const rec: AgentRunRecord = {
    id: newId(),
    agentId: agent.id,
    agentName: agent.name,
    startedAt,
    finishedAt,
    durationMs: Math.round(performance.now() - t0),
    modelId,
    systemPrompt: agent.systemPrompt,
    userPrompt,
    taskInput: opts.taskInput,
    output,
    ok,
    error,
    tokensIn: Math.ceil((agent.systemPrompt.length + userPrompt.length) / 4),
    tokensOut: Math.ceil(output.length / 4),
    source: opts.source ?? "manual",
  };
  agentRunLog.append(rec);
  void logAgentRun({
    id: rec.id,
    agent: rec.agentName,
    task: rec.taskInput,
    output: rec.output,
    model: rec.modelId,
    runtime,
    ok: rec.ok,
    error: rec.error,
    durationMs: rec.durationMs,
  });
  return rec;
}
