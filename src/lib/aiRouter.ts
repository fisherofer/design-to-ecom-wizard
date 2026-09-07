/**
 * aiRouter — the single entry point for EVERY AI call in the system.
 *
 * Order of execution is decided by computeRouter's policy plus the privacy
 * rules:
 *   1. sensitivity "private"  → local model only. Never leaves the machine.
 *   2. policy offline / local → local model only.
 *   3. otherwise              → local first, cloud as fallback (or cloud first
 *                               when the policy says so).
 *
 * Every completion is mirrored into the local venv SQLite store: user chats
 * under scope "user", agent/system work under scope "system" (redacted by the
 * backend). If the local hub is down the mirror silently no-ops — it never
 * blocks or fakes an answer.
 */
import { chatComplete } from "@/lib/chatCompletion.functions";
import { localGenerate } from "@/lib/localAiScan";
import { decideRoute, type Sensitivity, type TaskProfile } from "@/lib/computeRouter";
import { addMessage, logEvent, type Scope } from "@/lib/localStore";

export type Engine = "local" | "cloud";

export interface AiRequest {
  /** System instruction / role prompt. */
  system?: string;
  /** The actual user or task prompt. */
  prompt: string;
  task?: TaskProfile;
  sensitivity?: Sensitivity;
  temperature?: number;
  maxTokens?: number;
  /** Force an engine, bypassing the policy (used by explicit UI toggles). */
  force?: Engine;
  /** Cloud model id preference when the cloud path runs. */
  preferModel?: string;
  /** When set, the turn is persisted to the local DB under this conversation. */
  conversationId?: string;
  scope?: Scope;
  channel?: string;
}

export interface AiResponse {
  ok: boolean;
  text: string;
  engine: Engine | "none";
  model: string;
  runtime: string;
  latencyMs: number;
  /** Human-readable path taken, including any fallback and its reason. */
  trace: string[];
  error?: string;
}

function planEngines(req: AiRequest): { order: Engine[]; trace: string[] } {
  if (req.force) return { order: [req.force], trace: [`forced engine: ${req.force}`] };
  const decision = decideRoute({
    task: req.task ?? "chat",
    sensitivity: req.sensitivity ?? "public",
    estTokens: Math.ceil((req.prompt.length + (req.system?.length ?? 0)) / 4),
  });
  const trace = [decision.reason];
  if (req.sensitivity === "private" || decision.mode === "local") {
    trace.push("cloud fallback disabled");
    return { order: ["local"], trace };
  }
  if (decision.mode === "cloud") return { order: ["cloud", "local"], trace };
  return { order: ["local", "cloud"], trace }; // hybrid → local first
}

async function runLocal(req: AiRequest): Promise<AiResponse> {
  const t0 = performance.now();
  const prompt = req.system ? `${req.system}\n\n${req.prompt}` : req.prompt;
  try {
    const res = await localGenerate(prompt, undefined, {
      maxTokens: req.maxTokens ?? 900,
      temperature: req.temperature ?? 0.3,
    });
    const text = (res.text ?? "").trim();
    return {
      ok: Boolean(res.ok && text),
      text,
      engine: "local",
      model: res.model || "local",
      runtime: res.runtime || "local",
      latencyMs: Math.round(performance.now() - t0),
      trace: [],
      error: res.ok && text ? undefined : "local model returned nothing",
    };
  } catch (e) {
    return {
      ok: false, text: "", engine: "local", model: "local", runtime: "local",
      latencyMs: Math.round(performance.now() - t0), trace: [],
      error: (e as Error).message || "local hub unreachable",
    };
  }
}

async function runCloud(req: AiRequest): Promise<AiResponse> {
  const t0 = performance.now();
  try {
    const res = await chatComplete({
      data: {
        mode: "auto",
        system: req.system,
        preferModel: req.preferModel,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        messages: [{ role: "user", content: req.prompt }],
      },
    });
    return {
      ok: Boolean(res.ok && res.reply),
      text: res.reply ?? "",
      engine: "cloud",
      model: res.modelId ?? "cloud",
      runtime: "lovable-gateway",
      latencyMs: Math.round(performance.now() - t0),
      trace: [],
      error: res.error,
    };
  } catch (e) {
    return {
      ok: false, text: "", engine: "cloud", model: "cloud", runtime: "lovable-gateway",
      latencyMs: Math.round(performance.now() - t0), trace: [],
      error: (e as Error).message,
    };
  }
}

/**
 * Run one completion through the policy. Local AI is tried first for anything
 * that is not explicitly cloud-first, so the system keeps working with no
 * external tokens at all.
 */
export async function aiComplete(req: AiRequest): Promise<AiResponse> {
  const { order, trace } = planEngines(req);
  let last: AiResponse | null = null;

  for (const engine of order) {
    const res = engine === "local" ? await runLocal(req) : await runCloud(req);
    trace.push(`${engine}: ${res.ok ? `ok via ${res.model}` : `failed — ${res.error ?? "unknown"}`}`);
    if (res.ok) {
      const out = { ...res, trace };
      await persist(req, out);
      return out;
    }
    last = res;
  }

  const failed: AiResponse = {
    ok: false,
    text: "",
    engine: last?.engine ?? "none",
    model: last?.model ?? "none",
    runtime: last?.runtime ?? "none",
    latencyMs: last?.latencyMs ?? 0,
    trace,
    error:
      order.length === 1 && order[0] === "local"
        ? `Local AI is the only allowed engine here and it is unavailable: ${last?.error ?? "no local runtime"}`
        : (last?.error ?? "no engine available"),
  };
  void logEvent("ai_router", `completion failed: ${failed.error}`, "warn", { trace });
  return failed;
}

async function persist(req: AiRequest, res: AiResponse) {
  if (!req.conversationId) return;
  const scope = req.scope ?? "user";
  await addMessage({
    conversationId: req.conversationId,
    role: "user",
    content: req.prompt,
    scope,
    channel: req.channel ?? "app",
  });
  await addMessage({
    conversationId: req.conversationId,
    role: "assistant",
    content: res.text,
    scope,
    channel: req.channel ?? "app",
    model: res.model,
    runtime: res.runtime,
    latencyMs: res.latencyMs,
  });
}
