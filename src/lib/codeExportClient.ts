/**
 * codeExportClient — client-side source bundler using Vite's import.meta.glob.
 * Files are inlined at build time as raw strings, so the bundle works
 * identically in dev and in the Cloudflare Worker production build (no
 * runtime filesystem access needed). Replaces the old fs.walk serverFn which
 * returned 0 files in prod because src/ is not on the Worker's virtual FS.
 */

export interface ExportedFile {
  path: string;
  bytes: number;
  content: string;
}

export interface CodeExportBundle {
  generatedAt: string;
  project: string;
  fileCount: number;
  totalBytes: number;
  files: ExportedFile[];
  manifest: Array<{ path: string; bytes: number }>;
}

// Eager raw imports — Vite inlines every matched file into the bundle at
// build time. Globs are literals (Vite requirement — no variables).
const SOURCE_MODULES = {
  ...import.meta.glob("/src/**/*.{ts,tsx,js,jsx,css,md,json,sql,html,svg}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("/supabase/**/*.{sql,toml,ts,json,md}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob("/public/**/*.{json,txt,md,svg,html}", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
  ...import.meta.glob(
    [
      "/package.json",
      "/tsconfig.json",
      "/vite.config.ts",
      "/components.json",
      "/eslint.config.js",
      "/wrangler.jsonc",
      "/bunfig.toml",
      "/.prettierrc",
      "/.prettierignore",
      "/README.md",
      "/GOOSE_INTEGRATION_SPEC.md",
      "/OCTOBOT_LEARNINGS.md",
    ],
    { query: "?raw", import: "default", eager: true },
  ),
} as Record<string, string>;

// Skip auto-generated / very large derived files we do not want in exports.
const SKIP_SUFFIX = ["/routeTree.gen.ts", "/integrations/supabase/types.ts"];

export function buildCodeBundle(projectName = "ai-executive-os"): CodeExportBundle {
  const files: ExportedFile[] = [];
  let total = 0;

  for (const [absPath, raw] of Object.entries(SOURCE_MODULES)) {
    if (typeof raw !== "string") continue;
    if (SKIP_SUFFIX.some((s) => absPath.endsWith(s))) continue;
    const path = absPath.replace(/^\//, "");
    const bytes = new Blob([raw]).size;
    files.push({ path, bytes, content: raw });
    total += bytes;
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    generatedAt: new Date().toISOString(),
    project: projectName,
    fileCount: files.length,
    totalBytes: total,
    files,
    manifest: files.map((f) => ({ path: f.path, bytes: f.bytes })),
  };
}
