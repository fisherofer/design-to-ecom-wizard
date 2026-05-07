/**
 * modelConflicts.ts — Detects collisions between local Ollama models and
 * remote hub models (HF / Replicate). Same family installed locally? Prefer
 * local. Same name available remotely with newer revision? Suggest update.
 */
import type { DiscoveredModel } from "./modelDiscovery";
import type { HubModel } from "./modelHub";

export type ConflictKind = "duplicate" | "newer-remote" | "redundant-family" | "ok";

export interface Conflict {
  hub: HubModel;
  local?: DiscoveredModel;
  kind: ConflictKind;
  recommendation: string;
}

/** normalize "meta-llama/Llama-3.1-8B-Instruct" → "llama3.1:8b" family key. */
function familyKey(id: string): string {
  const s = id.toLowerCase().replace(/[\/_]/g, "-");
  const m = s.match(/(llama|qwen|gemma|mistral|phi|deepseek|llava|nomic)[-]?(\d+\.?\d*)?.*?(\d+b)?/);
  if (!m) return s;
  return [m[1], m[2], m[3]].filter(Boolean).join("-");
}

export function detectConflicts(hub: HubModel[], installed: DiscoveredModel[]): Conflict[] {
  const localByFamily = new Map<string, DiscoveredModel>();
  installed.forEach((m) => localByFamily.set(familyKey(m.id), m));

  return hub.map((h) => {
    const fam = familyKey(h.id);
    const local = localByFamily.get(fam);
    if (!local) return { hub: h, kind: "ok", recommendation: "Safe to add — no local equivalent." };
    // duplicate vs newer
    if (h.updatedAt && new Date(h.updatedAt).getTime() > Date.now() - 1000 * 60 * 60 * 24 * 30) {
      return { hub: h, local, kind: "newer-remote", recommendation: `Newer revision than local ${local.id}. Consider re-pulling.` };
    }
    return { hub: h, local, kind: "duplicate", recommendation: `Already covered by local ${local.id}. Skip to save VRAM.` };
  });
}
