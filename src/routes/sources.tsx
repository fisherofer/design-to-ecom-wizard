import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { newsSources, useNewsSources, type SourceKind, type SourceRegion } from "@/lib/newsSources";
import { buildNewsBrief, type NewsBriefResult } from "@/lib/vision";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "News Sources — YouTube, X, Analysts & Trading Sites" },
      { name: "description", content: "Manage the news sources the local agents read and turn them into a video script." },
      { property: "og:title", content: "News Sources" },
      { property: "og:description", content: "YouTube channels, X handles, analysts and trading sites feeding the video producer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SourcesPage,
});

const KINDS: Record<SourceKind, string> = { youtube: "יוטיוב", x: "טוויטר / X", analyst: "אנליסטים", trading_site: "אתרי מסחר" };
const REGIONS: Record<SourceRegion, string> = { global: "עולמי", israel: "ישראל", europe: "אירופה" };

function SourcesPage() {
  const list = useNewsSources();
  const [kind, setKind] = useState<SourceKind | "all">("all");
  const [region, setRegion] = useState<SourceRegion | "all">("all");
  const [form, setForm] = useState({ name: "", url: "", kind: "youtube" as SourceKind, region: "global" as SourceRegion });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NewsBriefResult | null>(null);

  const shown = useMemo(
    () => list.filter((s) => (kind === "all" || s.kind === kind) && (region === "all" || s.region === region)),
    [list, kind, region],
  );

  async function brief() {
    const enabled = shown.filter((s) => s.enabled);
    if (!enabled.length) return toast.error("אין מקורות פעילים בסינון הנוכחי");
    setBusy(true);
    setResult(null);
    try {
      const r = await buildNewsBrief({ sources: enabled.map(({ name, url, kind, region }) => ({ name, url, kind, region })) });
      setResult(r);
      toast.success(`נקראו ${r.read.length} מקורות`);
    } catch (e) {
      toast.error(`השרת המקומי לא זמין או שהקריאה נכשלה: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">מקורות חדשות</h1>
          <p className="text-sm text-muted-foreground">רשימות ברירת המחדל הן הצעות — כדאי לעבור ולתקן. שום דבר לא מומצא: מקור שלא נקרא מסומן כנכשל.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => newsSources.reset()} className="rounded-md border border-border px-3 py-2 text-sm">איפוס</button>
          <button disabled={busy} onClick={brief} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            {busy ? "קורא מקורות…" : "קרא מקורות ובנה תסריט וידאו"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind | "all")} className="rounded-md border border-border bg-card px-2 py-1 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value as SourceRegion | "all")} className="rounded-md border border-border bg-card px-2 py-1 text-sm">
          <option value="all">כל האזורים</option>
          {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="self-center text-xs text-muted-foreground">{shown.length} מקורות · {shown.filter((s) => s.enabled).length} פעילים</span>
      </div>

      <form
        className="flex flex-wrap gap-2 rounded-md border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !/^https?:\/\//.test(form.url)) return toast.error("שם וכתובת http(s) נדרשים");
          newsSources.add(form);
          setForm({ ...form, name: "", url: "" });
        }}
      >
        <input placeholder="שם" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-md border border-border bg-background px-2 py-1 text-sm" />
        <input placeholder="https://…" dir="ltr" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="min-w-64 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" />
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as SourceKind })} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
          {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value as SourceRegion })} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
          {Object.entries(REGIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground">הוסף</button>
      </form>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((s) => (
          <div key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-sm">
            <input type="checkbox" checked={s.enabled} onChange={() => newsSources.toggle(s.id)} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{s.name}</div>
              <div className="truncate text-xs text-muted-foreground" dir="ltr">{s.url}</div>
            </div>
            <span className="text-[10px] text-muted-foreground">{KINDS[s.kind]} · {REGIONS[s.region]}</span>
            <button onClick={() => newsSources.remove(s.id)} className="text-xs text-destructive">מחק</button>
          </div>
        ))}
      </div>

      {result && (
        <section className="space-y-3 rounded-md border border-border bg-card p-4">
          <h2 className="font-semibold">תוצאה</h2>
          <p className="text-xs text-muted-foreground">נקראו {result.read.length} · נכשלו {result.failed.length}</p>
          {result.failed.length > 0 && (
            <ul className="text-xs text-destructive">{result.failed.map((f) => <li key={f.url}>{f.name}: {f.error}</li>)}</ul>
          )}
          {result.script && <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">{result.script}</pre>}
          {result.video?.video_script && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs" dir="ltr">
              {JSON.stringify(result.video.video_script, null, 2)}
            </pre>
          )}
        </section>
      )}
    </div>
  );
}
