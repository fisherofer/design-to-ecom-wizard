/**
 * chatComplete — server function that runs a chat turn on the Lovable AI
 * Gateway with an auto-resolved model (verified against /v1/models, not
 * hardcoded). Used by the floating chatbot for cloud + hybrid routes.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { resolveModel, tierFor } from "./aiModels.server";

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const Input = z.object({
  messages: z.array(MessageSchema).min(1),
  mode: z.enum(["auto", "cloud", "hybrid"]).default("auto"),
  difficulty: z.enum(["low", "medium", "high"]).optional(),
  system: z.string().optional(),
  /** Optional preferred model id (e.g. an agent blueprint's model). */
  preferModel: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(32000).optional(),
});

export interface ChatCompletionResult {
  reply: string;
  modelId: string;
  mode: "auto" | "cloud" | "hybrid";
  ok: boolean;
  error?: string;
}

export const chatComplete = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }): Promise<ChatCompletionResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { reply: "", modelId: "n/a", mode: data.mode, ok: false, error: "LOVABLE_API_KEY missing" };
    }

    const inputChars = data.messages.reduce((n, m) => n + m.content.length, 0);
    const tier = tierFor({ inputChars, difficulty: data.difficulty ?? "medium" });
    const resolved = await resolveModel(data.mode === "hybrid" ? "heavy" : tier);
    const gateway = createLovableAiGatewayProvider(key);

    // The AI SDK rejects `system` role entries inside `messages` — collapse
    // them into the dedicated system instruction instead.
    const inlineSystem = data.messages.filter((m) => m.role === "system").map((m) => m.content);
    const sys = [
      data.system ??
        "You are the OFERTRADINGBOT assistant — concise, technical, bilingual (Hebrew/English). Respond in the user's language. Use markdown when helpful.",
      ...inlineSystem,
    ]
      .filter(Boolean)
      .join("\n\n");
    const modelMessages: ModelMessage[] = data.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    if (modelMessages.length === 0) {
      modelMessages.push({ role: "user", content: inlineSystem.join("\n\n") || "Continue." });
    }

    // Try the caller's preferred model first, then fall back to the resolved one.
    const candidates = [data.preferModel, resolved].filter(
      (m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i,
    );
    let lastError = "gateway error";
    for (const modelId of candidates) {
      try {
        const { text } = await generateText({
          model: gateway(modelId),
          system: sys,
          messages: modelMessages,
          temperature: data.temperature,
          maxOutputTokens: data.maxTokens,
        });
        return { reply: text, modelId, mode: data.mode, ok: true };
      } catch (e) {
        lastError = (e as Error).message || "gateway error";
      }
    }
    return { reply: "", modelId: "n/a", mode: data.mode, ok: false, error: lastError };
  });

