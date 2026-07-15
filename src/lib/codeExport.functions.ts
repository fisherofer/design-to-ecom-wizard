/**
 * codeExport — server function that walks the project tree and returns a
 * JSON bundle of all source files. Intended as a "smart export" so the
 * codebase can be quickly imported into other tools (Claude, Cursor, ChatGPT,
 * another Lovable project). Filtered to source & config only (no node_modules,
 * no build artifacts, no lockfiles).
 */
import { createServerFn } from "@tanstack/react-start";

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

const INCLUDE_DIRS = ["src", "supabase", "public"];
const INCLUDE_ROOT_FILES = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "components.json",
  "eslint.config.js",
  "wrangler.jsonc",
  "bunfig.toml",
  ".prettierrc",
  ".prettierignore",
  "README.md",
  "GOOSE_INTEGRATION_SPEC.md",
  "OCTOBOT_LEARNINGS.md",
];
const SKIP_NAMES = new Set(["node_modules", ".git", ".next", "dist", "build", ".cache", ".turbo", ".wrangler"]);
const SKIP_EXT = new Set([".lockb", ".lock", ".log", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".otf"]);
const MAX_FILE_BYTES = 512 * 1024; // 512KB per file
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10MB

async function walk(fs: typeof import("fs/promises"), path: typeof import("path"), root: string, rel: string, out: ExportedFile[], acc: { total: number }) {
  const abs = path.join(root, rel);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    const entries = await fs.readdir(abs);
    for (const name of entries) {
      if (SKIP_NAMES.has(name)) continue;
      await walk(fs, path, root, path.join(rel, name), out, acc);
    }
    return;
  }
  const ext = path.extname(rel).toLowerCase();
  if (SKIP_EXT.has(ext)) return;
  if (stat.size > MAX_FILE_BYTES) return;
  if (acc.total + stat.size > MAX_TOTAL_BYTES) return;
  try {
    const buf = await fs.readFile(abs, "utf8");
    out.push({ path: rel.replace(/\\/g, "/"), bytes: stat.size, content: buf });
    acc.total += stat.size;
  } catch {
    // binary or unreadable
  }
}

export const exportCodebase = createServerFn({ method: "GET" }).handler(async (): Promise<CodeExportBundle> => {
  const fs = await import("fs/promises");
  const path = await import("path");
  const root = process.cwd();
  const files: ExportedFile[] = [];
  const acc = { total: 0 };

  for (const dir of INCLUDE_DIRS) {
    await walk(fs, path, root, dir, files, acc);
  }
  for (const f of INCLUDE_ROOT_FILES) {
    await walk(fs, path, root, f, files, acc);
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    generatedAt: new Date().toISOString(),
    project: path.basename(root),
    fileCount: files.length,
    totalBytes: acc.total,
    files,
    manifest: files.map((f) => ({ path: f.path, bytes: f.bytes })),
  };
});
