import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Clapperboard, Eye, Image as ImageIcon, RefreshCw, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import {
  analyzeImage, buildVideoScript, imageThumbnail, listLocalImages, visionStatus,
  type AnalyzeResult, type LocalImage, type VideoScriptResult, type VisionStatus,
} from "@/lib/vision";

export const Route = createFileRoute("/vision")({
  head: () => ({
    meta: [
      { title: "Vision Analyst — Local Image Analysis & Video Scripts" },
      {
        name: "description",
        content:
          "Read images from your own machine, analyse them with the local model only, and turn a script plus your images into a full shot-by-shot video script.",
      },
      { property: "og:title", content: "Vision Analyst" },
      {
        property: "og:description",
        content: "Local image analysis, OCR text extraction and shot-by-shot video scripts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VisionPage,
});

function VisionPage() {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [images, setImages] = useState<LocalImage[]>([]);
  const [dir, setDir] = useState<string>("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manualPath, setManualPath] = useState("");
  const [question, setQuestion] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [video, setVideo] = useState<VideoScriptResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [s, list] = await Promise.all([visionStatus(), listLocalImages(200)]);
    setStatus(s);
    setImages(list.images);
    setDir(list.dir ?? s.vision_dir ?? "");
  }

  useEffect(() => {
    void load();
  }, []);

  function toggle(path: string) {
    setSelected((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  }

  async function runAnalyze(path: string) {
    setBusy("analyze");
    setAnalysis(null);
    setPreview(null);
    try {
      const [res, thumb] = await Promise.all([
        analyzeImage(path, question || undefined),
        imageThumbnail(path).catch(() => ({ ok: false })),
      ]);
      setAnalysis(res);
      setPreview("data_url" in thumb ? (thumb.data_url ?? null) : null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "הניתוח נכשל");
    } finally {
      setBusy(null);
    }
  }

  async function runVideoScript() {
    if (!script.trim()) {
      toast.error("צריך תסריט כדי לבנות תסריט וידאו");
      return;
    }
    setBusy("video");
    setVideo(null);
    try {
      const res = await buildVideoScript({
        script,
        title: title || undefined,
        imagePaths: selected,
      });
      setVideo(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "בניית תסריט הווידאו נכשלה");
    } finally {
      setBusy(null);
    }
  }

  const hubDown = status && !status.ok;
  const missing = status?.missing ?? [];

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Eye className="h-6 w-6 text-primary" />
            סוכן תמונות
          </h1>
          <p className="text-sm text-muted-foreground">
            קורא תמונות מהמחשב שלך, מנתח אותן במודל המקומי בלבד, והופך תסריט לתסריט וידאו מלא.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" /> רענון
        </button>
      </header>

      {hubDown && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground">
          השרת המקומי אינו פועל — {status?.error ?? "לא זמין"}. הפעל את המערכת על המחשב כדי לנתח תמונות.
        </div>
      )}

      {status?.ok && missing.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          חסרות חבילות מקומיות: {missing.join(", ")} — התקן את חבילת ה-AI המקומית כדי לקבל מידות, צבעים וזיהוי טקסט.
        </div>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-medium text-foreground">
          <ImageIcon className="h-5 w-5 text-primary" /> תמונות מקומיות
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">תיקיית התמונות: {dir || "—"}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="נתיב מלא לתמונה על המחשב"
            className="min-w-[240px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={() => manualPath.trim() && void runAnalyze(manualPath.trim())}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            <ScanSearch className="h-4 w-4" /> נתח נתיב
          </button>
        </div>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="שאלה לניתוח (לא חובה)"
          className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין תמונות בתיקייה המקומית.</p>
        ) : (
          <ul className="divide-y divide-border">
            {images.map((img) => (
              <li key={img.path} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.includes(img.path)}
                  onChange={() => toggle(img.path)}
                  className="h-4 w-4"
                />
                <span className="flex-1 truncate text-foreground">{img.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(img.bytes / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => void runAnalyze(img.path)}
                  disabled={busy !== null}
                  className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50"
                >
                  נתח
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {analysis && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-lg font-medium text-foreground">ניתוח</h2>
          <div className="flex flex-wrap gap-4">
            {preview && (
              <img src={preview} alt="תצוגה מקדימה" className="h-40 rounded-md border border-border" />
            )}
            <dl className="min-w-[200px] space-y-1 text-sm text-muted-foreground">
              <div>מידות: {analysis.facts?.width ?? "—"}×{analysis.facts?.height ?? "—"}</div>
              <div>בהירות: {analysis.facts?.brightness ?? "—"}</div>
              <div>טקסט שזוהה: {analysis.facts?.ocr_chars ?? 0} תווים</div>
              <div>מנוע: {analysis.runtime ?? "—"} {analysis.model ? `(${analysis.model})` : ""}</div>
            </dl>
          </div>
          {analysis.analysis?.summary && (
            <p className="mt-3 text-sm text-foreground">{analysis.analysis.summary}</p>
          )}
          {(analysis.analysis?.observations ?? []).length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
              {analysis.analysis?.observations?.map((o, i) => <li key={i}>{o}</li>)}
            </ul>
          )}
          {(analysis.analysis?.uncertain ?? []).length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              לא ניתן לקבוע: {analysis.analysis?.uncertain?.join("; ")}
            </p>
          )}
          {!analysis.analysis && analysis.raw && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              {analysis.raw}
            </pre>
          )}
        </section>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-medium text-foreground">
          <Clapperboard className="h-5 w-5 text-primary" /> תסריט לווידאו
        </h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת הפרק"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={6}
          placeholder="הדבק כאן את התסריט"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{selected.length} תמונות נבחרו לשימוש בסצנות</span>
          <button
            onClick={() => void runVideoScript()}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            <Clapperboard className="h-4 w-4" />
            {busy === "video" ? "בונה…" : "בנה תסריט וידאו"}
          </button>
        </div>

        {video?.video_script && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground">
              {video.video_script.title} — {video.video_script.logline}
            </p>
            <p className="text-xs text-muted-foreground">
              אורך משוער: {video.video_script.total_seconds ?? "—"} שניות
            </p>
            <ol className="space-y-2">
              {(video.video_script.scenes ?? []).map((sc, i) => (
                <li key={i} className="rounded-md border border-border p-3 text-sm">
                  <div className="font-medium text-foreground">
                    סצנה {sc.n ?? i + 1} · {sc.seconds ?? "—"} שניות
                  </div>
                  {sc.narration && <p className="text-muted-foreground">{sc.narration}</p>}
                  {sc.on_screen_text && (
                    <p className="text-xs text-muted-foreground">כתובית: {sc.on_screen_text}</p>
                  )}
                  {sc.visual && <p className="text-xs text-muted-foreground">ויזואל: {sc.visual}</p>}
                  {sc.image && <p className="text-xs text-muted-foreground">תמונה: {sc.image}</p>}
                </li>
              ))}
            </ol>
            {(video.video_script.missing_assets ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground">
                חומרים חסרים: {video.video_script.missing_assets?.join("; ")}
              </p>
            )}
          </div>
        )}
        {video && !video.video_script && video.raw && (
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            {video.raw}
          </pre>
        )}
      </section>
    </div>
  );
}
