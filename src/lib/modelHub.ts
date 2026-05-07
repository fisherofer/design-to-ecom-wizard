/**
 * modelHub.ts — Discovery layer for HuggingFace, Replicate, Together, OpenRouter.
 * Pure data + fetchers. Keeps results normalized so filters/conflicts can run uniformly.
 */

export type HubProvider = "huggingface" | "replicate" | "together" | "openrouter";

export interface HubModel {
  id: string;                    // canonical model id (e.g. "meta-llama/Llama-3.1-8B")
  provider: HubProvider;
  task: string;                  // text-generation, image-generation, embeddings, ...
  downloads?: number;
  likes?: number;
  license?: string;
  origin?: string;               // inferred country/org (used by filters)
  updatedAt?: string;
  tags?: string[];
  gated?: boolean;
}

const HF_SEARCH = "https://huggingface.co/api/models";

export async function searchHuggingFace(opts: {
  query?: string;
  task?: string;
  limit?: number;
  sort?: "downloads" | "likes" | "lastModified";
}): Promise<HubModel[]> {
  const params = new URLSearchParams({
    limit: String(opts.limit ?? 30),
    sort: opts.sort ?? "downloads",
    direction: "-1",
    full: "true",
  });
  if (opts.query) params.set("search", opts.query);
  if (opts.task) params.set("filter", opts.task);
  const res = await fetch(`${HF_SEARCH}?${params.toString()}`);
  if (!res.ok) throw new Error(`HF ${res.status}`);
  const list = (await res.json()) as Array<{
    id: string; pipeline_tag?: string; downloads?: number; likes?: number;
    tags?: string[]; gated?: boolean; lastModified?: string; cardData?: { license?: string };
  }>;
  return list.map((m) => ({
    id: m.id,
    provider: "huggingface",
    task: m.pipeline_tag ?? "unknown",
    downloads: m.downloads,
    likes: m.likes,
    tags: m.tags,
    gated: !!m.gated,
    license: m.cardData?.license,
    updatedAt: m.lastModified,
    origin: inferOrigin(m.id, m.tags),
  }));
}

/** Infer geographic origin from org slug + tags (best-effort, used by filter policy). */
export function inferOrigin(id: string, tags?: string[]): string {
  const org = id.split("/")[0]?.toLowerCase() ?? "";
  const t = (tags ?? []).join(" ").toLowerCase();
  const cn = ["qwen", "deepseek", "baichuan", "yi-", "01-ai", "thudm", "internlm", "chatglm", "zhipuai", "moonshot", "minimax"];
  if (cn.some((c) => org.includes(c) || t.includes(c))) return "CN";
  if (/meta|facebook/.test(org)) return "US";
  if (/google|deepmind/.test(org)) return "US";
  if (/openai|anthropic|microsoft|nvidia/.test(org)) return "US";
  if (/mistral/.test(org)) return "FR";
  if (/stability|cohere/.test(org)) return "UK";
  if (/aleph|aleph-alpha/.test(org)) return "DE";
  return "??";
}

export const HUB_LABELS: Record<HubProvider, string> = {
  huggingface: "Hugging Face",
  replicate: "Replicate",
  together: "Together AI",
  openrouter: "OpenRouter",
};
