/**
 * AI Recommended Tickers
 * ======================
 * Uses Lovable AI Gateway (Gemini) to rank a candidate universe of tickers
 * and produce short-term recommendations with rationale.
 * Every batch is persisted to `ai_recommendation_log` so users can review
 * the historical calls the AI has made.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

export interface AiPick {
  symbol: string;
  score: number;          // 0..100
  action: "buy" | "watch" | "avoid";
  horizonDays: number;
  rationale: string;
  catalysts?: string[];
  risks?: string[];
}

export interface AiRecommendationBatch {
  id?: string;
  generatedAt: string;
  model: string;
  universe: string[];
  picks: AiPick[];
  rationale?: string;
  horizonDays: number;
}

const PickSchema = z.object({
  symbol: z.string(),
  score: z.number().min(0).max(100),
  action: z.enum(["buy", "watch", "avoid"]),
  horizonDays: z.number().int().min(1).max(60),
  rationale: z.string(),
  catalysts: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});

const RecommendSchema = z.object({
  overallView: z.string(),
  picks: z.array(PickSchema).min(3).max(8),
});

export const generateAiRecommendations = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        universe: z.array(z.string()).min(3).max(40),
        horizonDays: z.number().int().min(1).max(30).default(10),
        context: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");
    const model = "google/gemini-3-flash-preview";
    const gateway = createLovableAiGatewayProvider(key);

    const prompt = `You are an institutional trading analyst. Given today's tradable universe,
select the 5 best short-term opportunities for the next ${data.horizonDays} trading days.
Score 0-100 (higher = better risk-adjusted upside).
Universe: ${data.universe.join(", ")}
Additional context: ${data.context ?? "n/a"}
Return honest, concise rationale citing pattern, momentum, catalyst, sector context.`;

    const { output } = await generateText({
      model: gateway(model),
      output: Output.object({ schema: RecommendSchema }),
      prompt,
    });

    const picks: AiPick[] = output.picks.map((p) => ({
      ...p,
      symbol: p.symbol.toUpperCase(),
    }));
    const generatedAt = new Date().toISOString();

    // Persist for history (best-effort; do not block response on write failure).
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_recommendation_log").insert({
        generated_at: generatedAt,
        universe: data.universe,
        model,
        picks: picks as unknown as object,
        rationale: output.overallView,
        horizon_days: data.horizonDays,
      });
    } catch (err) {
      console.error("[aiRecs] failed to persist:", err);
    }

    return {
      generatedAt,
      model,
      universe: data.universe,
      picks,
      rationale: output.overallView,
      horizonDays: data.horizonDays,
    } satisfies AiRecommendationBatch;
  });

export const listAiRecommendations = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ limit: z.number().int().min(1).max(50).default(10) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("ai_recommendation_log")
      .select("id, generated_at, universe, model, picks, rationale, horizon_days")
      .order("generated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      generatedAt: r.generated_at as string,
      universe: (r.universe as string[]) ?? [],
      model: r.model as string,
      picks: (r.picks as unknown as AiPick[]) ?? [],
      rationale: (r.rationale as string) ?? "",
      horizonDays: (r.horizon_days as number) ?? 10,
    })) as AiRecommendationBatch[];
  });
