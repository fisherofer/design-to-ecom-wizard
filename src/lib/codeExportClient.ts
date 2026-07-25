/**
 * codeExportClient — client-side source bundler using Vite's import.meta.glob.
 * Files are inlined at build time as raw strings, so the bundle works
 * identically in dev and in the Cloudflare Worker production build (no
 * runtime filesystem access needed).
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

// Note: routeTree.gen.ts is a generated file whose ?raw variant Rollup fails
// to resolve during prod build. Exclude it at the glob level via a negative
// pattern (Vite supports array patterns with `!` prefix).
const SOURCE_MODULES = {
  ...(import.meta.glob(
    [
      "/src/**/*.{ts,tsx,js,jsx,css,scss,md,json,sql,html,svg,py,txt,yml,yaml,toml,cfg,ini,env}",
      "/src/**/*.ts.txt",
      "!/src/routeTree.gen.ts",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>),
  ...(import.meta.glob("/supabase/**/*.{sql,toml,ts,json,md}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob("/public/**/*.{json,txt,md,svg,html,xml,webmanifest}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>),
  ...(import.meta.glob(
    [
      "/*.{ts,js,mjs,cjs,json,md,html,yml,yaml,toml,css}",
      "/.{gitignore,env.example}",
    ],
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>),
} as Record<string, string>;

export function buildCodeBundle(projectName = "ai-executive-os"): CodeExportBundle {
  const files: ExportedFile[] = [];
  let total = 0;

  for (const [absPath, raw] of Object.entries(SOURCE_MODULES)) {
    if (typeof raw !== "string") continue;
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
