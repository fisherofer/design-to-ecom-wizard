/**
 * DriveKnowledgeBrowser — read the OferTradingBot AI knowledge base
 * (MASTER_HANDOFF.md, GOOSE_TASKS.md, CONTINUITY_LOG.md, etc.) directly
 * from Google Drive, using the token already stored by GoogleDriveTab.
 *
 * Implements the "read canonical continuity docs" flow described in
 * CLAUDE_CONTINUITY_PROTOCOL.md (steps 1–3).
 */
import { useEffect, useState } from "react";
import { BookOpen, FileText, RefreshCw, Loader2, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  CANONICAL_DOCS,
  listKnowledgeFiles,
  readKnowledgeFile,
  type KnowledgeFile,
} from "@/lib/driveKnowledge";
import { getStoredToken } from "@/lib/googleDrive";

export function DriveKnowledgeBrowser() {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<{ file: KnowledgeFile; content: string } | null>(null);
  const [reading, setReading] = useState(false);

  const hasToken = Boolean(getStoredToken());

  async function refresh() {
    if (!hasToken) {
      toast.error("Connect Google Drive above first.");
      return;
    }
    setLoading(true);
    try {
      const list = await listKnowledgeFiles();
      // Sort: canonical docs first (in defined order), then rest by mtime desc.
      const rank = (n: string) => {
        const i = (CANONICAL_DOCS as readonly string[]).indexOf(n);
        return i === -1 ? 999 : i;
      };
      list.sort((a, b) => rank(a.name) - rank(b.name));
      setFiles(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function open(f: KnowledgeFile) {
    setReading(true);
    try {
      const content = await readKnowledgeFile(f);
      setOpened({ file: f, content });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReading(false);
    }
  }

  useEffect(() => {
    if (hasToken) refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-lg border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h3 className="font-display text-base font-semibold">AI Knowledge Base (Drive)</h3>
        </div>
        <button
          onClick={refresh}
          disabled={loading || !hasToken}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-elevated disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Reads <span className="font-mono">AI/CLAUDE-FINAL/OferTradingBot/</span> — handoff, Goose tasks, continuity log.
      </p>

      {!hasToken && (
        <div className="mt-4 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
          Connect Google Drive using the panel above, then click Refresh.
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-4 divide-y divide-border">
          {files.map((f) => {
            const isCanonical = (CANONICAL_DOCS as readonly string[]).includes(f.name);
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className={`font-mono text-xs truncate ${isCanonical ? "text-primary font-semibold" : ""}`}>
                  {f.name}
                </span>
                <span className="ml-auto flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                  {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                  <button
                    onClick={() => open(f)}
                    disabled={reading}
                    className="rounded border border-border bg-card px-2 py-0.5 text-[10px] uppercase hover:bg-surface-elevated disabled:opacity-50"
                  >
                    Read
                  </button>
                  <a
                    href={`https://drive.google.com/file/d/${f.id}/view`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-border bg-card px-1.5 py-0.5 hover:bg-surface-elevated"
                    title="Open in Drive"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {opened && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur"
          onClick={() => setOpened(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-3">
              <h4 className="font-mono text-sm font-semibold">{opened.file.name}</h4>
              <button onClick={() => setOpened(null)} className="rounded p-1 hover:bg-surface-elevated">
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-foreground">
              {opened.content}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}
