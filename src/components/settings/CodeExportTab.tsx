/**
 * CodeExportTab — one-click "smart export" of the whole codebase as a JSON
 * bundle. Use to port to another tool (Claude Projects, Cursor, ChatGPT
 * knowledge, another Lovable project) without cloning the git repo.
 */
import { useState } from "react";
import { Download, FileArchive, Loader2, Package } from "lucide-react";
import { exportCodebase, type CodeExportBundle } from "@/lib/codeExport.functions";

export function CodeExportTab() {
  const [bundle, setBundle] = useState<CodeExportBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await exportCodebase();
      setBundle(b);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadJson = () => {
    if (!bundle) return;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    triggerDownload(blob, `codebase-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const downloadMarkdown = () => {
    if (!bundle) return;
    const parts: string[] = [
      `# ${bundle.project} — Codebase Snapshot`,
      `Generated: ${bundle.generatedAt}`,
      `Files: ${bundle.fileCount} · Total size: ${(bundle.totalBytes / 1024).toFixed(0)} KB`,
      "",
      "## Manifest",
      "",
      ...bundle.manifest.map((m) => `- \`${m.path}\` (${m.bytes} B)`),
      "",
      "## Files",
      "",
    ];
    for (const f of bundle.files) {
      parts.push(`### ${f.path}`, "", "```" + guessLang(f.path), f.content, "```", "");
    }
    const blob = new Blob([parts.join("\n")], { type: "text/markdown" });
    triggerDownload(blob, `codebase-${new Date().toISOString().slice(0, 10)}.md`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <FileArchive className="h-6 w-6 text-primary" />
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold">Smart Code Export</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Bundle the entire source tree (src, supabase, public, root configs) into a single JSON or Markdown file so
              you can paste it into Claude Projects, Cursor, ChatGPT knowledge, or a fresh Lovable project. Skips
              node_modules, build output, binary assets, and lockfiles.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            {loading ? "Bundling…" : bundle ? "Rebuild bundle" : "Generate bundle"}
          </button>
          {bundle && (
            <>
              <button
                onClick={downloadJson}
                className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
              >
                <Download className="h-4 w-4" /> Download JSON
              </button>
              <button
                onClick={downloadMarkdown}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Download className="h-4 w-4" /> Download Markdown
              </button>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-destructive">Error: {error}</p>}

        {bundle && (
          <div className="mt-5 rounded-md border border-border bg-surface p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Files" value={bundle.fileCount.toString()} />
              <Stat label="Size" value={`${(bundle.totalBytes / 1024).toFixed(0)} KB`} />
              <Stat label="Generated" value={new Date(bundle.generatedAt).toLocaleTimeString()} />
              <Stat label="Project" value={bundle.project} />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-mono uppercase text-muted-foreground hover:text-foreground">
                Manifest preview ({bundle.manifest.length} entries)
              </summary>
              <ul className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background p-2 font-mono text-[11px]">
                {bundle.manifest.map((m) => (
                  <li key={m.path} className="flex justify-between">
                    <span className="truncate">{m.path}</span>
                    <span className="text-muted-foreground">{m.bytes} B</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold">{value}</div>
    </div>
  );
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function guessLang(path: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) return "ts";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "js";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".sql")) return "sql";
  if (path.endsWith(".md")) return "md";
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".html")) return "html";
  return "";
}
