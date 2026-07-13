/**
 * listAvailableModels — server function that returns the live list of model
 * ids the Lovable AI Gateway currently supports, plus the resolver's picks
 * per tier. Used by the Compute Router UI so we never surface an id the
 * gateway will reject.
 */
import { createServerFn } from "@tanstack/react-start";
import { resolveModel } from "./aiModels.server";

export interface AvailableModels {
  ids: string[];
  picks: { light: string; default: string; heavy: string };
  ok: boolean;
  error?: string;
}

export const listAvailableModels = createServerFn({ method: "GET" }).handler(
  async (): Promise<AvailableModels> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return {
        ids: [],
        picks: { light: "n/a", default: "n/a", heavy: "n/a" },
        ok: false,
        error: "LOVABLE_API_KEY missing",
      };
    }
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/models", {
        headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      });
      if (!r.ok) throw new Error(`gateway ${r.status}`);
      const j = (await r.json()) as { data?: Array<{ id: string }> };
      const ids = (j.data ?? []).map((m) => m.id).sort();
      const [light, def, heavy] = await Promise.all([
        resolveModel("light"),
        resolveModel("default"),
        resolveModel("heavy"),
      ]);
      return { ids, picks: { light, default: def, heavy }, ok: true };
    } catch (e) {
      return {
        ids: [],
        picks: { light: "n/a", default: "n/a", heavy: "n/a" },
        ok: false,
        error: (e as Error).message,
      };
    }
  },
);
