/**
 * Source Export / Import
 * ======================
 * Mirrors the Google Apps Script backup format used by the legacy MarketBrain
 * project — `{ meta, config, code: { scriptId, files: [{ name, type, source }] } }`
 * — so backups are interchangeable between the two systems.
 *
 * Uses Vite's `import.meta.glob` with `query: '?raw'` to inline every source
 * file at build time. No backend required.
 */

// Eagerly inline every source file under src/ as a raw string.
const RAW_MODULES = import.meta.glob("/src/**/*.{ts,tsx,js,jsx,css,json,md}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface SourceFile {
  name: string;          // e.g. "components/layout/Sidebar"
  path: string;          // full path "/src/components/layout/Sidebar.tsx"
  type: string;          // TS / TSX / CSS / JSON / MD
  source: string;
  bytes: number;
}

export interface SourceBundle {
  meta: {
    type: "CODE_ONLY";
    timestamp: string;
    version: string;
    app: string;
  };
  config: Record<string, string>;
  code: {
    scriptId: string;
    files: SourceFile[];
  };
}

const TYPE_MAP: Record<string, string> = {
  ts: "TS",
  tsx: "TSX",
  js: "JS",
  jsx: "JSX",
  css: "CSS",
  json: "JSON",
  md: "MD",
};

function fileType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_MAP[ext] ?? ext.toUpperCase();
}

function fileName(path: string): string {
  // strip leading "/src/" and the extension
  const trimmed = path.replace(/^\/src\//, "");
  return trimmed.replace(/\.[^.]+$/, "");
}

export function collectSourceFiles(): SourceFile[] {
  return Object.entries(RAW_MODULES)
    .map(([path, source]) => ({
      name: fileName(path),
      path,
      type: fileType(path),
      source: source ?? "",
      bytes: (source ?? "").length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSourceBundle(extraConfig: Record<string, string> = {}): SourceBundle {
  const files = collectSourceFiles();
  return {
    meta: {
      type: "CODE_ONLY",
      timestamp: new Date().toISOString(),
      version: "aios-source/v1",
      app: "AI Executive OS",
    },
    config: {
      ROUTE_COUNT: String(files.filter((f) => f.path.startsWith("/src/routes/")).length),
      FILE_COUNT: String(files.length),
      TOTAL_BYTES: String(files.reduce((s, f) => s + f.bytes, 0)),
      ...extraConfig,
    },
    code: {
      scriptId: "ai-executive-os-frontend",
      files,
    },
  };
}

export function downloadJson(filename: string, data: unknown): number {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return blob.size;
}

export interface ImportSummary {
  fileCount: number;
  totalBytes: number;
  meta: SourceBundle["meta"] | null;
  configKeys: string[];
  sample: { name: string; type: string; bytes: number }[];
}

export function summariseBundle(raw: unknown): ImportSummary {
  const b = raw as Partial<SourceBundle>;
  const files = b?.code?.files ?? [];
  return {
    fileCount: files.length,
    totalBytes: files.reduce((s, f) => s + (f.source?.length ?? 0), 0),
    meta: (b?.meta as SourceBundle["meta"]) ?? null,
    configKeys: Object.keys(b?.config ?? {}),
    sample: files.slice(0, 8).map((f) => ({
      name: f.name,
      type: f.type,
      bytes: f.source?.length ?? 0,
    })),
  };
}

const STAGING_KEY = "ai-os.sourceImport.staging.v1";

export function stageImportedBundle(bundle: unknown): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAGING_KEY, JSON.stringify(bundle));
}

export function readStagedBundle(): SourceBundle | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STAGING_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SourceBundle;
  } catch {
    return null;
  }
}

export function clearStagedBundle(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STAGING_KEY);
}
