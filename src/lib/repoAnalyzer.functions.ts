/**
 * Repo Analyzer — server functions.
 *
 * All Supabase writes go through the service role (loaded lazily inside each
 * handler, per TanStack rules). Repo files are fetched from GitHub / GitLab /
 * Bitbucket public APIs; a token is optional and only forwarded when supplied.
 * AI analysis is done through the Lovable AI Gateway (Gemini flash).
 */
import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { resolveModel, tierFor } from "./aiModels.server";

// -------------------- provider parsing --------------------

export interface ParsedRepo {
  provider: "github" | "gitlab" | "bitbucket" | "unknown";
  owner: string;
  repo: string;
  ref: string;
  webUrl: string;
}

function parseRepoUrl(raw: string): ParsedRepo {
  const url = raw.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const gh = url.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/i);
  if (gh) return { provider: "github", owner: gh[1], repo: gh[2], ref: gh[3] || "HEAD", webUrl: url };
  const gl = url.match(/gitlab\.com\/([^/]+(?:\/[^/]+)*)\/([^/]+?)(?:\/-\/tree\/([^/]+))?$/i);
  if (gl) return { provider: "gitlab", owner: gl[1], repo: gl[2], ref: gl[3] || "HEAD", webUrl: url };
  const bb = url.match(/bitbucket\.org\/([^/]+)\/([^/]+)(?:\/src\/([^/]+))?/i);
  if (bb) return { provider: "bitbucket", owner: bb[1], repo: bb[2], ref: bb[3] || "HEAD", webUrl: url };
  return { provider: "unknown", owner: "", repo: "", ref: "HEAD", webUrl: url };
}

// -------------------- listRepo --------------------

const ListInput = z.object({
  repoUrl: z.string().min(1),
  token: z.string().optional(),
  maxFiles: z.number().int().min(1).max(300).default(120),
});

export interface RepoFile { path: string; size: number; type: "file" | "dir"; }

export const listRepo = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ListInput.parse(raw))
  .handler(async ({ data }): Promise<{ parsed: ParsedRepo; files: RepoFile[]; error?: string }> => {
    const parsed = parseRepoUrl(data.repoUrl);
    try {
      if (parsed.provider === "github") {
        const ref = parsed.ref === "HEAD" ? "" : `?ref=${encodeURIComponent(parsed.ref)}`;
        const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${parsed.ref === "HEAD" ? "HEAD" : parsed.ref}?recursive=1`;
        const r = await fetch(url, { headers: authHeaders("github", data.token) });
        if (!r.ok) return { parsed, files: [], error: `GitHub ${r.status}: ${await r.text()}` };
        const j = await r.json() as { tree?: Array<{ path: string; type: string; size?: number }> };
        const files = (j.tree ?? [])
          .filter((n) => n.type === "blob" && looksCodey(n.path))
          .slice(0, data.maxFiles)
          .map((n) => ({ path: n.path, size: n.size ?? 0, type: "file" as const }));
        // ref suppresses ts unused
        void ref;
        return { parsed, files };
      }
      if (parsed.provider === "gitlab") {
        const projectPath = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
        const url = `https://gitlab.com/api/v4/projects/${projectPath}/repository/tree?recursive=true&per_page=${data.maxFiles}${parsed.ref !== "HEAD" ? `&ref=${encodeURIComponent(parsed.ref)}` : ""}`;
        const r = await fetch(url, { headers: authHeaders("gitlab", data.token) });
        if (!r.ok) return { parsed, files: [], error: `GitLab ${r.status}: ${await r.text()}` };
        const j = await r.json() as Array<{ path: string; type: string }>;
        const files = j
          .filter((n) => n.type === "blob" && looksCodey(n.path))
          .slice(0, data.maxFiles)
          .map((n) => ({ path: n.path, size: 0, type: "file" as const }));
        return { parsed, files };
      }
      return { parsed, files: [], error: `Provider ${parsed.provider} not supported yet — GitHub and GitLab work today.` };
    } catch (e) {
      return { parsed, files: [], error: (e as Error).message };
    }
  });

// -------------------- analyzeFile --------------------

const AnalyzeInput = z.object({
  ownerSession: z.string().min(6),
  repoUrl: z.string().min(1),
  filePath: z.string().min(1),
  token: z.string().optional(),
  goal: z.string().optional(),
  /** "auto" (default) resolves the best supported model at runtime. */
  model: z.string().default("auto"),
});

export interface FindingRow {
  id: string;
  owner_session: string;
  repo_url: string;
  provider: string;
  file_path: string;
  language: string | null;
  verdict: "keep" | "reuse" | "skip" | "review";
  score: number;
  summary: string | null;
  recommendation: string | null;
  snippet: string | null;
  tags: string[];
  model: string | null;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
}

export const analyzeFile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => AnalyzeInput.parse(raw))
  .handler(async ({ data }): Promise<{ finding?: FindingRow; error?: string }> => {
    const parsed = parseRepoUrl(data.repoUrl);
    try {
      // 1. Fetch raw file
      const rawUrl = rawFileUrl(parsed, data.filePath);
      const rawR = await fetch(rawUrl, { headers: authHeaders(parsed.provider, data.token) });
      if (!rawR.ok) return { error: `Fetch failed ${rawR.status}: ${await rawR.text()}` };
      const source = await rawR.text();
      const truncated = source.length > 16000 ? source.slice(0, 16000) + "\n/* …truncated */" : source;

      // 2. Ask AI
      const key = process.env.LOVABLE_API_KEY;
      let verdict: FindingRow["verdict"] = "review";
      let score = 50;
      let summary = "AI unavailable — file saved as review candidate.";
      let recommendation = "";
      let snippet = "";
      let tags: string[] = [];
      const language = guessLang(data.filePath);

      let resolvedModelId = data.model;
      if (key) {
        const gateway = createLovableAiGatewayProvider(key);
        if (data.model === "auto") {
          resolvedModelId = await resolveModel(tierFor({ inputChars: truncated.length, difficulty: "medium" }));
        }
        const model = gateway(resolvedModelId);
        const prompt = `You review third-party OSS code for potential reuse in a trading & AI dashboard app.
Goal (optional): ${data.goal || "General learnings for a TS/React trading dashboard."}
File: ${data.filePath} (${language})
--- source ---
${truncated}
--- /source ---

Return STRICT JSON only:
{
  "verdict": "keep" | "reuse" | "skip" | "review",
  "score": number (0..100, higher = more relevant),
  "summary": string (<=200 chars, what this file does),
  "recommendation": string (<=400 chars, what to learn/port/avoid),
  "snippet": string (<=800 chars, the most valuable extract, verbatim from source, or ""),
  "tags": string[] (max 6, e.g. ["indicator","risk-mgmt","exchange-adapter"])
}`;
        try {
          const { text } = await generateText({ model, prompt });
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            const j = JSON.parse(m[0]) as Record<string, unknown>;
            verdict = (["keep","reuse","skip","review"].includes(String(j.verdict)) ? j.verdict : "review") as FindingRow["verdict"];
            score = Math.max(0, Math.min(100, Number(j.score) || 50));
            summary = String(j.summary ?? "").slice(0, 400);
            recommendation = String(j.recommendation ?? "").slice(0, 800);
            snippet = String(j.snippet ?? "").slice(0, 1200);
            tags = Array.isArray(j.tags) ? j.tags.slice(0, 6).map(String) : [];
          }
        } catch (e) {
          summary = `AI error: ${(e as Error).message}`;
        }
      }

      // 3. Persist
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("code_findings")
        .insert({
          owner_session: data.ownerSession,
          repo_url: parsed.webUrl,
          provider: parsed.provider,
          file_path: data.filePath,
          language,
          verdict, score, summary, recommendation, snippet,
          tags, model: resolvedModelId,
        })
        .select("*")
        .single();
      if (error) return { error: error.message };
      return { finding: row as FindingRow };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

// -------------------- analyzeRepoBulk --------------------

const BulkInput = z.object({
  ownerSession: z.string().min(6),
  repoUrl: z.string().min(1),
  filePaths: z.array(z.string()).min(1).max(60),
  token: z.string().optional(),
  goal: z.string().optional(),
  model: z.string().default("auto"),
});

export const analyzeRepoBulk = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => BulkInput.parse(raw))
  .handler(async ({ data }): Promise<{ findings: FindingRow[]; errors: Array<{ path: string; error: string }> }> => {
    // Sequential to respect gateway rate limits; short-circuits on catastrophic failure.
    const findings: FindingRow[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    for (const filePath of data.filePaths) {
      try {
        const r = await analyzeFile({
          data: { ownerSession: data.ownerSession, repoUrl: data.repoUrl, filePath, token: data.token, goal: data.goal, model: data.model },
        });
        if (r.finding) findings.push(r.finding);
        if (r.error) errors.push({ path: filePath, error: r.error });
      } catch (e) {
        errors.push({ path: filePath, error: (e as Error).message });
      }
    }
    return { findings, errors };
  });

// -------------------- list / update / delete --------------------

export const listFindings = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ ownerSession: z.string().min(6), repoUrl: z.string().optional() }).parse(raw))
  .handler(async ({ data }): Promise<FindingRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("code_findings").select("*").eq("owner_session", data.ownerSession).order("created_at", { ascending: false }).limit(500);
    if (data.repoUrl) q = q.eq("repo_url", data.repoUrl);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as FindingRow[];
  });

export const markReviewed = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ ownerSession: z.string().min(6), id: z.string().uuid(), reviewed: z.boolean() }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("code_findings")
      .update({ reviewed: data.reviewed })
      .eq("id", data.id).eq("owner_session", data.ownerSession);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFinding = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({
    ownerSession: z.string().min(6),
    id: z.string().uuid(),
    requireReviewed: z.boolean().default(true),
  }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.requireReviewed) {
      const { data: row } = await supabaseAdmin.from("code_findings").select("reviewed").eq("id", data.id).eq("owner_session", data.ownerSession).maybeSingle();
      if (!row) return { ok: false, error: "not found" };
      if (!row.reviewed) return { ok: false, error: "finding must be marked reviewed before delete" };
    }
    const { error } = await supabaseAdmin.from("code_findings").delete().eq("id", data.id).eq("owner_session", data.ownerSession);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

// -------------------- helpers --------------------

function authHeaders(provider: string, token?: string): Record<string, string> {
  const h: Record<string, string> = { "User-Agent": "OferTradingBot/repo-analyzer" };
  if (!token) return h;
  if (provider === "github") h["Authorization"] = `Bearer ${token}`;
  else if (provider === "gitlab") h["PRIVATE-TOKEN"] = token;
  else h["Authorization"] = `Bearer ${token}`;
  return h;
}

function rawFileUrl(p: ParsedRepo, filePath: string): string {
  const ref = p.ref === "HEAD" ? "HEAD" : p.ref;
  if (p.provider === "github") return `https://raw.githubusercontent.com/${p.owner}/${p.repo}/${ref}/${filePath}`;
  if (p.provider === "gitlab") return `https://gitlab.com/${p.owner}/${p.repo}/-/raw/${ref}/${filePath}`;
  if (p.provider === "bitbucket") return `https://bitbucket.org/${p.owner}/${p.repo}/raw/${ref}/${filePath}`;
  return "";
}

function looksCodey(path: string): boolean {
  return /\.(ts|tsx|js|jsx|py|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|md|sql|yml|yaml|toml|sh)$/i.test(path)
    && !/(^|\/)(node_modules|dist|build|\.git|vendor|__pycache__)\//.test(path);
}

function guessLang(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  if (!m) return "unknown";
  return ({ ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", go: "go", rs: "rust", rb: "ruby", java: "java", kt: "kotlin",
    swift: "swift", c: "c", cc: "cpp", cpp: "cpp", cs: "csharp",
    md: "markdown", sql: "sql", yml: "yaml", yaml: "yaml", toml: "toml", sh: "shell" } as Record<string,string>)[m[1].toLowerCase()] ?? m[1];
}
