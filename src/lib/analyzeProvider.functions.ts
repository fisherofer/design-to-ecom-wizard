/**
 * analyzeProvider — server function.
 * Given a name + baseUrl (+ optional notes), asks Gemini to classify:
 *   - family (llm | data), category, cost tier (free/freemium/paid),
 *     rate limits (rpm / rpd), recommended default model, notes.
 * Falls back to a heuristic if the model returns unparseable JSON or the
 * gateway is unavailable.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const Input = z.object({
  name: z.string().min(1),
  baseUrl: z.string().default(""),
  notes: z.string().optional(),
});

export interface ProviderAnalysis {
  family: "llm" | "data";
  category: string;             // e.g. "llm.cloud", "data.market", "data.news", or a new custom slug
  costTier: "free" | "freemium" | "paid";
  costPer1kUsd: number;
  freeRpm: number;
  freeRpd: number;
  suggestedModel?: string;
  authType: "none" | "api_key" | "oauth" | "basic";
  summary: string;
  reasoning: string;
}

function heuristic(name: string, baseUrl: string): ProviderAnalysis {
  const s = (name + " " + baseUrl).toLowerCase();
  const isLlm = /openai|anthropic|gemini|mistral|llama|groq|ollama|cohere|perplexity|deepseek|chat|gpt/.test(s);
  const isNews = /news|headline|rss|reuters|bloomberg/.test(s);
  const isMarket = /alpaca|yahoo|finnhub|polygon|iex|tradier|market|stock|quote|ohlc/.test(s);
  const family: "llm" | "data" = isLlm ? "llm" : "data";
  const category = isLlm ? "llm.cloud" : isNews ? "data.news" : isMarket ? "data.market" : "data.custom";
  return {
    family, category,
    costTier: "freemium", costPer1kUsd: family === "llm" ? 0.002 : 0,
    freeRpm: 60, freeRpd: 500,
    authType: "api_key",
    summary: `Heuristic classification of ${name}.`,
    reasoning: "AI unreachable — used keyword heuristics on name + URL.",
  };
}

export const analyzeProvider = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }): Promise<ProviderAnalysis> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return heuristic(data.name, data.baseUrl);

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const model = gateway("google/gemini-2.5-flash");
      const prompt = `You classify third-party APIs for a trading & AI app.
Given the provider below, return STRICT JSON with these fields:
{
  "family": "llm" | "data",
  "category": "llm.local" | "llm.cloud" | "llm.custom" | "data.market" | "data.news" | "data.custom" | "data.<new-slug>",
  "costTier": "free" | "freemium" | "paid",
  "costPer1kUsd": number,
  "freeRpm": number,
  "freeRpd": number,
  "suggestedModel": string,
  "authType": "none" | "api_key" | "oauth" | "basic",
  "summary": string (<= 140 chars),
  "reasoning": string (<= 200 chars)
}
If it does not fit market/news, invent a "data.<slug>" category (e.g. data.crypto, data.macro, data.sentiment).
Provider name: ${data.name}
Base URL: ${data.baseUrl || "(unknown)"}
Notes: ${data.notes ?? "(none)"}
Return only the JSON object.`;

      const { text } = await generateText({ model, prompt });
      const json = extractJson(text);
      if (!json) return heuristic(data.name, data.baseUrl);
      return {
        family: json.family === "llm" ? "llm" : "data",
        category: String(json.category || "data.custom"),
        costTier: (["free", "freemium", "paid"].includes(json.costTier as string) ? json.costTier : "freemium") as ProviderAnalysis["costTier"],
        costPer1kUsd: Number(json.costPer1kUsd) || 0,
        freeRpm: Math.max(0, Number(json.freeRpm) || 60),
        freeRpd: Math.max(0, Number(json.freeRpd) || 500),
        suggestedModel: json.suggestedModel ? String(json.suggestedModel) : undefined,
        authType: (["none","api_key","oauth","basic"].includes(json.authType as string) ? json.authType : "api_key") as ProviderAnalysis["authType"],
        summary: String(json.summary ?? "").slice(0, 200),
        reasoning: String(json.reasoning ?? "").slice(0, 400),
      };
    } catch {
      return heuristic(data.name, data.baseUrl);
    }
  });

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
