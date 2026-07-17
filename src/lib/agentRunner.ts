/**
 * agentRunner — executes an AgentBlueprint by calling the Lovable AI Gateway
 * server function with the blueprint's system prompt + compiled user prompt.
 * Persists every run to agentRunLog so the Agent Builder shows real history.
 */
import { chatComplete } from "./chatCompletion.functions";
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
}

export async function runAgent(agent: AgentBlueprint, opts: RunAgentOptions): Promise<AgentRunRecord> {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const userPrompt = compile(agent.userPromptTemplate, opts.taskInput, opts.context);

  let output = "";
  let ok = false;
  let error: string | undefined;
  let modelId = agent.model;

  try {
    const res = await chatComplete({
      data: {
        mode: "auto",
        system: agent.systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
    });
    output = res.reply;
    ok = res.ok;
    error = res.error;
    modelId = res.modelId || agent.model;
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
  return rec;
}
