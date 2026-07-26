/**
 * CodeExportTab — one-click "smart export" of the whole codebase as a JSON
 * bundle. Use to port to another tool (Claude Projects, Cursor, ChatGPT
 * knowledge, another Lovable project) without cloning the git repo.
 */
import { useState } from "react";
import { Download, FileArchive, Loader2, Package, ShieldCheck, ShieldAlert } from "lucide-react";
import {
  buildCodeBundle,
  IntegrityError,
  type CodeExportBundle,
  type IntegrityCheck,
} from "@/lib/codeExportClient";

export function CodeExportTab() {
  const [bundle, setBundle] = useState<CodeExportBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityCheck | null>(null);
  const [forceDownload, setForceDownload] = useState(false);

  const handleBuildError = (e: unknown) => {
    if (e instanceof IntegrityError) {
      setIntegrity(e.report);
      setError(e.message);
    } else {
      setError((e as Error).message);
    }
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    setIntegrity(null);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const b = await buildCodeBundle("ai-executive-os", { throwOnFailure: false });
      if (b.fileCount === 0) throw new Error("No source files matched — check glob patterns.");
      setBundle(b);
      setIntegrity(b.integrity);
    } catch (e) {
      handleBuildError(e);
    } finally {
      setLoading(false);
    }
  };

  const oneClickDownload = async () => {
    setLoading(true);
    setError(null);
    setIntegrity(null);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const b = await buildCodeBundle("ai-executive-os", { throwOnFailure: !forceDownload });
      if (b.fileCount === 0) throw new Error("No source files matched — check glob patterns.");
      setBundle(b);
      setIntegrity(b.integrity);
      const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
      triggerDownload(blob, `codebase-full-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      handleBuildError(e);
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
            onClick={oneClickDownload}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? "Bundling…" : "Download Full Backup (JSON)"}
          </button>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Package className="h-4 w-4" />
            {bundle ? "Rebuild preview" : "Preview manifest"}
          </button>
          {bundle && (
            <>
              <button
                onClick={downloadJson}
                className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20"
              >
                <Download className="h-4 w-4" /> JSON
              </button>
              <button
                onClick={downloadMarkdown}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <Download className="h-4 w-4" /> Markdown
              </button>
            </>
          )}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={forceDownload}
            onChange={(e) => setForceDownload(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Allow download even if integrity check fails (not recommended)
        </label>

        {error && <p className="mt-3 text-sm text-destructive">Error: {error}</p>}

        {integrity && (
          <div
            className={`mt-4 rounded-md border p-3 text-xs ${
              integrity.ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {integrity.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {integrity.ok
                ? `Integrity OK — ${integrity.totalFiles} files, ${(integrity.totalBytes / 1024).toFixed(0)} KB`
                : `Integrity FAILED — ${integrity.missing.length} missing file(s), ${integrity.missingGlobs.length} under-filled folder(s)`}
            </div>
            {!integrity.ok && (
              <div className="mt-2 space-y-1 font-mono">
                {integrity.missing.length > 0 && (
                  <div>
                    <div className="uppercase opacity-70">Missing files:</div>
                    <ul className="ml-3 list-disc">
                      {integrity.missing.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {integrity.missingGlobs.length > 0 && (
                  <div>
                    <div className="uppercase opacity-70">Under-filled folders:</div>
                    <ul className="ml-3 list-disc">
                      {integrity.missingGlobs.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer opacity-70">Folder counts</summary>
              <ul className="mt-1 ml-3 font-mono">
                {Object.entries(integrity.minCounts).map(([label, v]) => (
                  <li key={label}>
                    {label}: {v.found}/{v.required}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}

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
  a.rel = "noopener";
  a.target = "_blank"; // iOS Safari: opens in new tab; user can then Share → Save to Files
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1500);
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
