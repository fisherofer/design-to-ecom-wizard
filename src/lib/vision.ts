/**
 * vision — typed client for the local vision analyst agent (/api/vision).
 *
 * Images are read from the owner's own machine by the local hub; analysis runs
 * on the local model only. When the hub or the local model is not ready the
 * caller receives an explicit error — never an invented description.
 */
import { getApiBase } from "@/lib/apiConfig";

const TIMEOUT_MS = 120_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/vision${path}`, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...init,
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body as { detail?: { error?: string } })?.detail?.error;
      throw new Error(detail ?? `HTTP ${res.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface VisionStatus {
  ok: boolean;
  vision_dir?: string;
  packages?: Record<string, string | null>;
  missing?: string[];
  local_ai?: { ok?: boolean; missing?: string[] } & Record<string, unknown>;
  error?: string;
}

export interface LocalImage {
  name: string;
  path: string;
  bytes: number;
  modified: number;
}

export interface ImageFacts {
  ok: boolean;
  path?: string;
  name?: string;
  bytes?: number;
  width?: number;
  height?: number;
  mode?: string;
  format?: string;
  brightness?: number;
  average_rgb?: number[];
  dominant_colors?: { rgb: number[]; share: number }[];
  ocr_text?: string | null;
  ocr_chars?: number;
  ocr_note?: string;
  pillow?: string;
  error?: string;
}

export interface VisionAnalysis {
  summary?: string;
  observations?: string[];
  text_found?: string;
  uncertain?: string[];
  suggested_use?: string;
}

export interface AnalyzeResult {
  ok: boolean;
  path?: string;
  facts?: ImageFacts;
  analysis?: VisionAnalysis | null;
  raw?: string;
  runtime?: string;
  model?: string;
  elapsed_ms?: number;
  error?: string;
}

export interface VideoScene {
  n?: number;
  seconds?: number;
  narration?: string;
  on_screen_text?: string;
  visual?: string;
  image?: string | null;
  transition?: string;
}

export interface VideoScript {
  title?: string;
  logline?: string;
  total_seconds?: number;
  scenes?: VideoScene[];
  missing_assets?: string[];
}

export interface VideoScriptResult {
  ok: boolean;
  video_script?: VideoScript | null;
  raw?: string;
  visuals?: { path?: string; name?: string; ok?: boolean; error?: string }[];
  runtime?: string;
  model?: string;
  elapsed_ms?: number;
  error?: string;
}

export function visionStatus(): Promise<VisionStatus> {
  return call<VisionStatus>("/status").catch((err: unknown) => ({
    ok: false,
    error: err instanceof Error ? err.message : "local hub unavailable",
  }));
}

export function listLocalImages(limit = 100): Promise<{ ok: boolean; dir?: string; images: LocalImage[] }> {
  return call<{ ok: boolean; dir?: string; images: LocalImage[] }>(`/images?limit=${limit}`).catch(
    () => ({ ok: false, images: [] }),
  );
}

export function inspectImage(path: string): Promise<ImageFacts> {
  return call<ImageFacts>("/inspect", { method: "POST", body: JSON.stringify({ path }) });
}

export function analyzeImage(path: string, question?: string): Promise<AnalyzeResult> {
  return call<AnalyzeResult>("/analyze", {
    method: "POST",
    body: JSON.stringify({ path, question: question ?? null }),
  });
}

export function imageThumbnail(path: string): Promise<{ ok: boolean; data_url?: string; error?: string }> {
  return call<{ ok: boolean; data_url?: string; error?: string }>("/thumbnail", {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function buildVideoScript(input: {
  script: string;
  title?: string;
  imagePaths?: string[];
  scenes?: number;
}): Promise<VideoScriptResult> {
  return call<VideoScriptResult>("/video-script", {
    method: "POST",
    body: JSON.stringify({
      script: input.script,
      title: input.title ?? null,
      image_paths: input.imagePaths ?? [],
      scenes: input.scenes ?? 6,
    }),
  });
}

export interface NewsBriefResult {
  ok: boolean;
  script?: string;
  read: Array<{ name: string; kind: string; region: string; url: string; title: string | null; headlines: string[] }>;
  failed: Array<{ name: string; url: string; error: string }>;
  video?: VideoScriptResult;
  error?: string;
}

/** Read enabled news sources with the local browser agent and build a video script from them. */
export function buildNewsBrief(input: {
  sources: Array<{ name: string; url: string; kind: string; region: string }>;
  title?: string;
  imagePaths?: string[];
  scenes?: number;
  limit?: number;
}): Promise<NewsBriefResult> {
  return call<NewsBriefResult>("/news-brief", {
    method: "POST",
    body: JSON.stringify({
      sources: input.sources,
      title: input.title ?? null,
      image_paths: input.imagePaths ?? [],
      scenes: input.scenes ?? 6,
      limit: input.limit ?? 12,
    }),
  });
}
