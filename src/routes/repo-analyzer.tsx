/**
 * /repo-analyzer — pull code from GitHub/GitLab, analyze with AI, save
 * findings in the Lovable Cloud DB. Deleting a finding requires the user to
 * confirm the row was reviewed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Github, GitBranch, Loader2, Search, Sparkles, Trash2, CheckCircle2,
  FolderOpen, ExternalLink, X, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listRepo, analyzeFile, listFindings, markReviewed, deleteFinding,
  type FindingRow, type RepoFile,
} from "@/lib/repoAnalyzer.functions";

export const Route = createFileRoute("/repo-analyzer")({
  head: () => ({
    meta: [
      { title: "Repo Analyzer — Pull & review OSS code with AI" },
      { name: "description", content: "Pull code from GitHub/GitLab, analyze files with AI, save reusable findings and confirm before deleting." },
    ],
  }),
  component: RepoAnalyzerPage,
});

function useOwnerSession() {
  const [id] = useState(() => {
    if (typeof window === "undefined") return "server";
    const KEY = "ai-os.repo-analyzer.session";
    let v = localStorage.getItem(KEY);
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(KEY, v); }
    return v;
  });
  return id;
}

const DRIVE_AI_GIT_URL = "https://drive.google.com/drive/search?q=AI%20Git";

function RepoAnalyzerPage() {
  const ownerSession = useOwnerSession();
  const list = useServerFn(listRepo);
  const analyze = useServerFn(analyzeFile);
  const load = useServerFn(listFindings);
  const mark = useServerFn(markReviewed);
  const del = useServerFn(deleteFinding);

  const [repoUrl, setRepoUrl] = useState("");
  const [token, setToken] = useState("");
  const [goal, setGoal] = useState("Trading indicators, alerts and risk mgmt patterns");
  const [files, setFiles] = useState<RepoFile[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [analyzing, setAnalyzing] = useState<Record<string, boolean>>({});
  const [confirmDel, setConfirmDel] = useState<FindingRow | null>(null);

  useEffect(() => {
    load({ data: { ownerSession } }).then(setFindings).catch(() => {});
  }, [ownerSession, load]);

  const filtered = useMemo(
    () => (!filter ? files : files.filter((f) => f.path.toLowerCase().includes(filter.toLowerCase()))),
    [files, filter],
  );

  async function onList() {
    setBusy(true); setErr(null); setFiles([]);
    try {
      const r = await list({ data: { repoUrl, token: token || undefined } });
      if (r.error) setErr(r.error);
      setFiles(r.files);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function onAnalyze(path: string) {
    setAnalyzing((s) => ({ ...s, [path]: true }));
    try {
      const r = await analyze({ data: { ownerSession, repoUrl, filePath: path, token: token || undefined, goal } });
      if (r.error) setErr(r.error);
      if (r.finding) setFindings((cur) => [r.finding as FindingRow, ...cur]);
    } catch (e) { setErr((e as Error).message); }
    finally { setAnalyzing((s) => ({ ...s, [path]: false })); }
  }

  async function onMark(row: FindingRow, reviewed: boolean) {
    await mark({ data: { ownerSession, id: row.id, reviewed } });
    setFindings((cur) => cur.map((r) => r.id === row.id ? { ...r, reviewed } : r));
  }

  async function onConfirmDelete() {
    if (!confirmDel) return;
    const r = await del({ data: { ownerSession, id: confirmDel.id, requireReviewed: true } });
    if (!r.ok) { setErr(r.error || "delete failed"); return; }
    setFindings((cur) => cur.filter((x) => x.id !== confirmDel.id));
    setConfirmDel(null);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-16">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Repo Analyzer</h1>
        <p className="text-sm text-muted-foreground">
          Pull code from GitHub/GitLab, review it with AI, save findings.
          Deleting a finding requires you to mark it reviewed first.
        </p>
        <a href={DRIVE_AI_GIT_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <FolderOpen className="h-3 w-3" /> Open your Drive AI · Git folder
        </a>
      </header>

      <section className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-primary" /> Source
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo  or  https://gitlab.com/group/project"
            className="sm:col-span-4 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <input value={token} onChange={(e) => setToken(e.target.value)} type="password"
            placeholder="Token (optional, private repos)"
            className="sm:col-span-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <input value={goal} onChange={(e) => setGoal(e.target.value)}
            placeholder="What are you looking for? (guides the AI)"
            className="sm:col-span-6 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onList} disabled={busy || !repoUrl}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
            List files
          </Button>
          <a href={repoUrl} target="_blank" rel="noreferrer"
            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border ${repoUrl ? "hover:bg-muted" : "opacity-40 pointer-events-none"}`}>
            <ExternalLink className="h-3 w-3" /> Open
          </a>
        </div>
        {err && <div className="text-xs text-red-500">{err}</div>}
      </section>

      {files.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Github className="h-4 w-4" /> Files ({filtered.length}/{files.length})
            </div>
            <input value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder="filter…" className="rounded-md border border-border bg-background px-2 py-1 text-xs w-48" />
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border/40">
            {filtered.map((f) => (
              <div key={f.path} className="flex items-center gap-2 py-1.5 text-xs">
                <span className="font-mono flex-1 truncate">{f.path}</span>
                <Button size="sm" variant="ghost" disabled={analyzing[f.path]}
                  onClick={() => onAnalyze(f.path)}>
                  {analyzing[f.path]
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <><Sparkles className="h-3 w-3 mr-1" /> Analyze</>}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Saved findings ({findings.length})
        </div>
        {findings.length === 0 && <div className="text-xs text-muted-foreground">No findings yet — list a repo and analyze a file.</div>}
        <div className="space-y-3">
          {findings.map((r) => <FindingCard key={r.id} row={r}
            onMark={(v) => onMark(r, v)} onDelete={() => setConfirmDel(r)} />)}
        </div>
      </section>

      {confirmDel && (
        <ConfirmDeleteDialog row={confirmDel} onClose={() => setConfirmDel(null)}
          onMarkReviewed={() => onMark(confirmDel, true).then(() => setConfirmDel({ ...confirmDel, reviewed: true }))}
          onConfirm={onConfirmDelete} />
      )}
    </div>
  );
}

function FindingCard({ row, onMark, onDelete }: { row: FindingRow; onMark: (v: boolean) => void; onDelete: () => void }) {
  const color = row.verdict === "keep" ? "text-emerald-500 border-emerald-500/40"
    : row.verdict === "reuse" ? "text-sky-500 border-sky-500/40"
    : row.verdict === "skip"  ? "text-red-500 border-red-500/40"
    : "text-amber-500 border-amber-500/40";
  return (
    <article className="rounded-lg border border-border/50 bg-background/40 p-3 space-y-2">
      <header className="flex items-center gap-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 font-mono uppercase ${color}`}>{row.verdict}</span>
        <span className="font-medium">{row.score}</span>
        <span className="font-mono flex-1 truncate">{row.file_path}</span>
        <span className="text-muted-foreground">{row.language}</span>
        {row.reviewed && <span className="text-emerald-500">reviewed</span>}
      </header>
      {row.summary && <p className="text-xs">{row.summary}</p>}
      {row.recommendation && <p className="text-xs text-muted-foreground">→ {row.recommendation}</p>}
      {row.snippet && (
        <pre className="rounded-md bg-muted/40 p-2 text-[10px] overflow-x-auto max-h-40">{row.snippet}</pre>
      )}
      {row.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.tags.map((t) => <span key={t} className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px]">{t}</span>)}
        </div>
      )}
      <footer className="flex gap-2 pt-1">
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={row.reviewed} onChange={(e) => onMark(e.target.checked)} />
          reviewed
        </label>
        <Button size="sm" variant="ghost" className="ml-auto text-red-500" onClick={onDelete}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </footer>
    </article>
  );
}

function ConfirmDeleteDialog({ row, onClose, onMarkReviewed, onConfirm }: {
  row: FindingRow; onClose: () => void; onMarkReviewed: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-red-500">
            <ShieldAlert className="h-4 w-4" /> Delete finding
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="text-xs space-y-1">
          <div className="font-mono">{row.file_path}</div>
          <div className="text-muted-foreground">{row.summary}</div>
        </div>
        {!row.reviewed ? (
          <>
            <div className="text-xs text-amber-500">
              This finding hasn't been marked reviewed. Confirm you've read the AI verdict before deleting.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onMarkReviewed}>Mark as reviewed</Button>
              <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">Cancel</Button>
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="ml-auto bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete permanently
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
