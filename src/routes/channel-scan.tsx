import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { scanYoutubeChannels, type FoundChannel } from "@/lib/youtubeScan.functions";
import { newsSources, useNewsSources, type SourceRegion } from "@/lib/newsSources";

export const Route = createFileRoute("/channel-scan")({
  head: () => ({
    meta: [
      { title: "YouTube Channel Scan — Discover Market Channels" },
      { name: "description", content: "Scan YouTube by category, then connect new channels or merge with ones you already track." },
      { property: "og:title", content: "YouTube Channel Scan" },
      { property: "og:description", content: "Find and connect market YouTube channels by region." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ScanPage,
});

const PRESETS: Record<SourceRegion, string> = {
  global: "stock market news",
  israel: "בורסה תל אביב שוק ההון",
  europe: "European stock market DAX FTSE",
};
const LABEL: Record<SourceRegion, string> = { global: "עולמי", israel: "ישראל", europe: "אירופה" };

function ScanPage() {
  const scan = useServerFn(scanYoutubeChannels);
  const sources = useNewsSources();
  const [region, setRegion] = useState<SourceRegion>("global");
  const [query, setQuery] = useState(PRESETS.global);
  const [found, setFound] = useState<FoundChannel[]>([]);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});

  const existing = (c: FoundChannel) =>
    sources.find((s) => s.kind === "youtube" && s.url.toLowerCase().replace(/\/$/, "") === c.url.toLowerCase());

  const run = async () => {
    setBusy(true);
    const r = await scan({ data: { query, limit: 20 } });
    setBusy(false);
    if (!r.ok) toast.error(r.error ?? "סריקה נכשלה");
    setFound(r.channels);
  };

  const connect = (c: FoundChannel) => {
    const ex = existing(c);
    if (ex) {
      if (ex.region !== region || !ex.enabled) {
        newsSources.remove(ex.id);
        newsSources.add({ name: edit[c.handle] ?? ex.name, url: ex.url, kind: "youtube", region });
        toast.success("אוחד עם הערוץ הקיים");
      } else toast.info("הערוץ כבר מחובר");
      return;
    }
    newsSources.add({ name: edit[c.handle] ?? c.name, url: c.url, kind: "youtube", region });
    toast.success("ערוץ חדש חובר");
  };

  const field = "rounded-md border border-border bg-background px-2 py-1 text-sm";
  const yt = sources.filter((s) => s.kind === "youtube" && s.region === region);
  return (
    <div dir="rtl" className="space-y-6 p-6">
      <h1 className="font-display text-2xl font-semibold">סריקת ערוצי יוטיוב</h1>
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(LABEL) as SourceRegion[]).map((r) => (
          <button key={r} onClick={() => { setRegion(r); setQuery(PRESETS[r]); }}
            className={`rounded-md px-3 py-1.5 text-sm ${region === r ? "bg-primary text-primary-foreground" : "border border-border"}`}>{LABEL[r]}</button>
        ))}
        <input className={`${field} min-w-64 flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button disabled={busy} onClick={run} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">{busy ? "סורק..." : "סרוק"}</button>
      </div>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">תוצאות ({found.length})</h2>
        <ul className="divide-y divide-border">
          {found.map((c) => {
            const ex = existing(c);
            return (
              <li key={c.handle} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <input className={`${field} w-56`} value={edit[c.handle] ?? c.name} onChange={(e) => setEdit({ ...edit, [c.handle]: e.target.value })} />
                <a href={c.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary">{c.handle}</a>
                <span className="text-xs text-muted-foreground">{ex ? `קיים (${LABEL[ex.region]})` : "חדש"}</span>
                <button onClick={() => connect(c)} className="mr-auto rounded-md border border-border px-2 py-1 text-xs">{ex ? "אחד עם קיים" : "חבר כחדש"}</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">ערוצים מחוברים — {LABEL[region]} ({yt.length})</h2>
        <ul className="divide-y divide-border text-sm">
          {yt.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={s.enabled} onChange={() => newsSources.toggle(s.id)} />
              <span>{s.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.url.replace("https://www.youtube.com/", "")}</span>
              <button onClick={() => newsSources.remove(s.id)} className="mr-auto text-xs text-destructive">הסר</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
