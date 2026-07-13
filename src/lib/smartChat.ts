/**
 * smartChat — client-side dispatcher that routes a chat turn to the right
 * backend based on user-selected mode and the Compute Router policy.
 *
 * Modes:
 *  - "auto"   → Compute Router decides local/cloud/hybrid at runtime.
 *  - "cloud"  → Lovable AI Gateway (auto-picks a supported model per tier).
 *  - "local"  → Ollama on http://localhost:11434 (respects saved model).
 *  - "hybrid" → local draft + cloud finalize.
 *  - "goose"  → existing FastAPI Goose bridge (unchanged).
 */
import { chatComplete } from "./chatCompletion.functions";
import { decideRoute } from "./computeRouter";
import { api, type ChatMessage } from "./api";

export type ChatMode = "auto" | "cloud" | "local" | "hybrid" | "goose";

export interface SmartChatResult {
  reply: string;
  modelId: string;
  route: "cloud" | "local" | "hybrid" | "goose";
  trace: string[];
}

const OLLAMA_URL = "http://localhost:11434";

function toWire(messages: ChatMessage[]) {
  return messages
    .filter((m) => m.role !== undefined)
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
      content: m.content,
    })) as { role: "system" | "user" | "assistant"; content: string }[];
}

async function callCloud(messages: ChatMessage[]): Promise<SmartChatResult> {
  const res = await chatComplete({ data: { messages: toWire(messages), mode: "cloud" } });
  if (!res.ok) throw new Error(res.error || "cloud failed");
  return { reply: res.reply, modelId: res.modelId, route: "cloud", trace: [`cloud · ${res.modelId}`] };
}

async function ollamaModel(): Promise<string> {
  try {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("ollama.defaultModel");
      if (saved) return saved;
    }
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    if (r.ok) {
      const j = (await r.json()) as { models?: Array<{ name: string }> };
      const first = j.models?.[0]?.name;
      if (first) return first;
    }
  } catch {
    /* ignore */
  }
  return "llama3.1:8b";
}

async function callLocal(messages: ChatMessage[]): Promise<SmartChatResult> {
  const model = await ollamaModel();
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: toWire(messages), stream: false }),
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const j = (await r.json()) as { message?: { content?: string } };
  const reply = j.message?.content ?? "";
  return { reply, modelId: model, route: "local", trace: [`local · ollama · ${model}`] };
}

async function callHybrid(messages: ChatMessage[]): Promise<SmartChatResult> {
  let draft = "";
  try {
    const local = await callLocal(messages);
    draft = local.reply;
  } catch {
    /* skip local */
  }
  const augmented = draft
    ? [
        ...messages,
        {
          id: `sys_${Date.now()}`,
          role: "system" as const,
          content: `Local draft to refine (keep useful parts, correct errors, tighten tone):\n---\n${draft}\n---`,
          ts: Date.now(),
        },
      ]
    : messages;
  const res = await chatComplete({ data: { messages: toWire(augmented), mode: "hybrid", difficulty: "high" } });
  if (!res.ok) throw new Error(res.error || "hybrid cloud step failed");
  return {
    reply: res.reply,
    modelId: res.modelId,
    route: "hybrid",
    trace: [draft ? "local draft ok" : "local draft skipped", `cloud verify · ${res.modelId}`],
  };
}

async function callGoose(messages: ChatMessage[]): Promise<SmartChatResult> {
  const res = await api.chat(messages, "goose");
  return {
    reply: res.reply,
    modelId: (res.engine as string) ?? "goose",
    route: "goose",
    trace: [`goose${res.route ? ` · ${res.route}` : ""}`],
  };
}

export async function runSmartChat(mode: ChatMode, messages: ChatMessage[]): Promise<SmartChatResult> {
  if (mode === "goose") return callGoose(messages);
  if (mode === "cloud") return callCloud(messages);
  if (mode === "local") return callLocal(messages);
  if (mode === "hybrid") return callHybrid(messages);

  // AUTO — let Compute Router pick.
  const last = messages.at(-1)?.content ?? "";
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0);
  const decision = decideRoute({
    task: /```|function |import |class /.test(last) ? "code" : inputChars > 4000 ? "reasoning" : "chat",
    estTokens: Math.min(4000, Math.round(inputChars / 3.5)),
    signals: { localOnline: true, cloudAvailable: true, cloudHeadroom: 1 },
  });
  const trace = [`auto → ${decision.mode.toUpperCase()} (${decision.reason})`, ...decision.trace];
  try {
    if (decision.mode === "local") {
      const r = await callLocal(messages);
      return { ...r, trace: [...trace, ...r.trace] };
    }
    if (decision.mode === "hybrid") {
      const r = await callHybrid(messages);
      return { ...r, trace: [...trace, ...r.trace] };
    }
    const r = await callCloud(messages);
    return { ...r, trace: [...trace, ...r.trace] };
  } catch (err) {
    // fallback path
    trace.push(`primary failed: ${(err as Error).message} · trying ${decision.fallback ?? "cloud"}`);
    const fb = decision.fallback ?? "cloud";
    if (fb === "local") {
      const r = await callLocal(messages);
      return { ...r, trace: [...trace, ...r.trace] };
    }
    const r = await callCloud(messages);
    return { ...r, trace: [...trace, ...r.trace] };
  }
}
