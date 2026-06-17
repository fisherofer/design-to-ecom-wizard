import { useMemo, useState } from "react";
import { Bot, Check, Copy, Download, FileJson, FileText, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AI_TARGETS,
  buildBundle,
  bundleToMarkdown,
  downloadText,
  type AiTarget,
} from "@/lib/aiHandoff";

const LABELS: Record<AiTarget, string> = {
  goose: "Goose",
  ollama: "Ollama",
  huggingface: "HuggingFace",
  lmstudio: "LM Studio",
  openwebui: "Open WebUI",
  generic: "כללי",
};

export function AiHandoffExport() {
  const [target, setTarget] = useState<AiTarget>("goose");
  const [copied, setCopied] = useState<"json" | "md" | "prompt" | null>(null);

  const bundle = useMemo(() => buildBundle(target), [target]);
  const md = useMemo(() => bundleToMarkdown(bundle), [bundle]);
  const json = useMemo(() => JSON.stringify(bundle, null, 2), [bundle]);

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `ai-handoff-${target}-${stamp}`;

  async function copy(kind: "json" | "md" | "prompt") {
    const text = kind === "json" ? json : kind === "md" ? md : bundle.prompt;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <section className="rounded-xl border border-border glass p-5" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">ייצוא חבילת מידע למערכות AI</h2>
          <p className="font-mono text-[10px] text-muted-foreground">
            מסלולים · endpoints · localStorage · service discovery · spec מלא · prompt ייעודי
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {AI_TARGETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTarget(t)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              target === t
                ? "border-primary bg-primary/15 text-primary"
                : "border-border bg-card/40 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bot className="me-1 inline h-3 w-3" />
            {LABELS[t]}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border bg-[var(--terminal-bg,theme(colors.muted.DEFAULT))]/40 p-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Prompt לזריקה ישירה</p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground/90" dir="auto">
{bundle.prompt}
        </pre>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Button variant="outline" onClick={() => downloadText(`${base}.json`, json, "application/json")}>
          <FileJson /> הורד JSON
        </Button>
        <Button variant="outline" onClick={() => downloadText(`${base}.md`, md, "text/markdown")}>
          <FileText /> הורד Markdown
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            downloadText(`${base}.json`, json, "application/json");
            downloadText(`${base}.md`, md, "text/markdown");
            downloadText(`${base}.prompt.txt`, bundle.prompt, "text/plain");
          }}
        >
          <Download /> הורד הכל
        </Button>
        <Button variant="ghost" onClick={() => copy("prompt")}>
          {copied === "prompt" ? <Check /> : <Copy />} העתק Prompt
        </Button>
        <Button variant="ghost" onClick={() => copy("json")}>
          {copied === "json" ? <Check /> : <Copy />} העתק JSON
        </Button>
        <Button variant="ghost" onClick={() => copy("md")}>
          {copied === "md" ? <Check /> : <Copy />} העתק Markdown
        </Button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        החבילה מאגדת את כל מה ש-Goose / Ollama / HuggingFace / LM Studio / Open WebUI צריכים כדי להבין
        מה האתר עושה, אילו endpoints קיימים, איפה הנתונים נשמרים, ומה אסור לגעת בו — בלי לשלוח את כל
        המאגר. כל קובץ כולל גם prompt ייעודי למערכת היעד.
      </p>
    </section>
  );
}
