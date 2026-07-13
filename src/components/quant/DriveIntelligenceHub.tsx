/**
 * DriveIntelligenceHub — visualises the Google Drive "AI" knowledge base
 * (architecture maps + GIT open-source repos analysed by the local agent).
 *
 * Backend endpoints (served by the local FastAPI process, which owns Drive
 * filesystem access):
 *   GET  /api/drive/docs?folder=AI      → DriveDocument[]
 *   GET  /api/drive/doc?path=…          → { content, kind }
 *   GET  /api/drive/git-repos           → GitRepoEntry[]
 *   POST /api/drive/rescan              → { started }
 */
import { useEffect, useMemo, useState } from "react";
import { Cloud, FileText, GitBranch, RefreshCw, Search, Sparkles } from "lucide-react";
import { DriveService, type DriveDocument, type GitRepoEntry } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DriveIntelligenceHub() {
  const [docs, setDocs] = useState<DriveDocument[]>([]);
  const [repos, setRepos] = useState<GitRepoEntry[]>([]);
  const [selected, setSelected] = useState<DriveDocument | null>(null);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [d, r] = await Promise.all([
        DriveService.listDocs("AI").catch(() => [] as DriveDocument[]),
        DriveService.listGitRepos().catch(() => [] as GitRepoEntry[]),
      ]);
      setDocs(d);
      setRepos(r);
      if (!selected && d.length) setSelected(d[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) {
      setContent("");
      return;
    }
    let cancelled = false;
    DriveService.readDoc(selected.path)
      .then((doc) => {
        if (!cancelled) setContent(doc.content);
      })
      .catch((e) => {
        if (!cancelled) setContent(`⚠️ Could not read file: ${(e as Error).message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function rescan() {
    setScanning(true);
    try {
      await DriveService.triggerRescan();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) => d.name.toLowerCase().includes(q) || d.path.toLowerCase().includes(q));
  }, [docs, query]);

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-primary" />
          <h2 className="font-display text-sm font-semibold tracking-tight">
            Drive Intelligence Hub
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            G:\My Drive\AI
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter docs…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={() => void rescan()} disabled={scanning}>
            <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
            Rescan
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
          Backend unreachable — {error}. Start the local FastAPI process on port{" "}
          <code className="font-mono">8000</code> to enable Drive access.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="max-h-[520px] overflow-y-auto rounded-xl border border-border bg-card/40">
          <ul className="divide-y divide-border">
            {loading && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">Loading…</li>
            )}
            {!loading && filteredDocs.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                No documents found.
              </li>
            )}
            {filteredDocs.map((d) => (
              <li key={d.path}>
                <button
                  onClick={() => setSelected(d)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                    selected?.path === d.path
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{d.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <article className="min-h-[420px] rounded-xl border border-border bg-black/40">
          <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="truncate font-mono text-xs text-muted-foreground">
              {selected?.path ?? "no document selected"}
            </span>
            {selected && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {selected.kind}
              </span>
            )}
          </header>
          <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground/90">
            {content || (selected ? "Loading…" : "Select a document to preview.")}
          </pre>
        </article>
      </div>

      <div className="rounded-xl border border-border bg-card/60 backdrop-blur">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <GitBranch className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold tracking-tight">
            GIT Folder — Open-Source Learnings
          </h3>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {repos.length} repos indexed
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Repo</th>
                <th className="px-4 py-2 text-left">Language</th>
                <th className="px-4 py-2 text-left">Patterns Extracted</th>
                <th className="px-4 py-2 text-left">Summary</th>
                <th className="px-4 py-2 text-right">Scanned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {repos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No repos analysed yet. Trigger a rescan to have the local agent walk
                    <code className="mx-1 font-mono">G:\My Drive\AI\GIT</code>.
                  </td>
                </tr>
              ) : (
                repos.map((r) => (
                  <tr key={r.path} className="hover:bg-muted/20">
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{r.path}</div>
                    </td>
                    <td className="px-4 py-2 align-top text-xs">{r.language ?? "—"}</td>
                    <td className="px-4 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {r.extracted_patterns.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {r.extracted_patterns.map((p) => (
                          <span
                            key={p}
                            className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-top text-xs text-muted-foreground">
                      {r.summary ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right align-top font-mono text-[10px] text-muted-foreground">
                      {r.last_scanned ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
