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
    try {
      const inputChars = data.messages.reduce((n, m) => n + m.content.length, 0);
      const tier = tierFor({ inputChars, difficulty: data.difficulty ?? "medium" });
      const modelId = await resolveModel(data.mode === "hybrid" ? "heavy" : tier);
      const gateway = createLovableAiGatewayProvider(key);
      const sys =
        data.system ??
        "You are the OFERTRADINGBOT assistant — concise, technical, bilingual (Hebrew/English). Respond in the user's language. Use markdown when helpful.";
      const modelMessages: ModelMessage[] = [
        { role: "system", content: sys },
        ...data.messages.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      ];
      const { text } = await generateText({ model: gateway(modelId), messages: modelMessages });
      return { reply: text, modelId, mode: data.mode, ok: true };
    } catch (e) {
      return {
        reply: "",
        modelId: "n/a",
        mode: data.mode,
        ok: false,
        error: (e as Error).message || "gateway error",
      };
    }
  });
