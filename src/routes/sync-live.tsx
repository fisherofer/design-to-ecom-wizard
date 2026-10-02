import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { stationSync, type SyncLog } from "@/lib/stationSync";

export const Route = createFileRoute("/sync-live")({
  head: () => ({
    meta: [
      { title: "Live Sync Log — Hive Stations" },
      { name: "description", content: "Every change sent and received between stations, with time, origin station and result." },
      { property: "og:title", content: "Live Sync Log" },
      { property: "og:description", content: "See exactly where station sync stopped." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncLive,
});

const fmt = (t: number | null) => (t ? new Date(t * 1000).toLocaleString("he-IL") : "—");
const outcomeLabel = (o: string) =>
  o === "applied" ? "הוחל" : o === "sent" ? "נשלח" : o === "deleted" ? "נמחק" : o === "skipped:older" ? "דולג — ישן יותר" : o.startsWith("error:") ? `שגיאה: ${o.slice(6)}` : o;
const scopeLabel: Record<string, string> = { chat: "שיחה", fleet: "משימה", system: "מערכת", hive: "כוורת", user: "משתמש", media: "מדיה" };

function SyncLive() {
  const [log, setLog] = useState<SyncLog | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dir, setDir] = useState<"all" | "in" | "out">("all");
  const [paused, setPaused] = useState(false);

  const load = useCallback(async () => {
    const r = await stationSync.log(300, dir === "all" ? undefined : dir);
    if (r.ok) { setLog(r.data); setErr(null); } else setErr(r.error);
  }, [dir]);

  useEffect(() => {
    void load();
    if (paused) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [load, paused]);

  const lastError = log?.entries.find((e) => e.outcome.startsWith("error:"));

  return (
    <div dir="rtl" className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-foreground">יומן סנכרון חי</h1>
        <Link to="/stations" className="text-sm text-primary underline">תחנות הכוורת</Link>
      </div>
      <p className="text-muted-foreground">כל שינוי שנשלח מהתחנה הזאת או התקבל מתחנה אחרת. מתרענן כל 3 שניות.</p>
      {err && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">{err}</div>}
      {log && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">התקבל לאחרונה</div><div className="text-foreground">{fmt(log.last_in)}</div></div>
          <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">נשלח לאחרונה</div><div className="text-foreground">{fmt(log.last_out)}</div></div>
          <div className="rounded-lg border border-border bg-card p-3"><div className="text-xs text-muted-foreground">שגיאות</div><div className={log.errors ? "text-destructive" : "text-foreground"}>{log.errors}</div></div>
        </div>
      )}
      {lastError && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          הסנכרון נעצר לאחרונה ב-{fmt(lastError.ts)} — {outcomeLabel(lastError.outcome)} ({lastError.peer ?? "?"}, {lastError.key})
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(["all", "in", "out"] as const).map((d) => (
          <button key={d} onClick={() => setDir(d)} className={`rounded-md px-3 py-1 text-sm ${dir === d ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {d === "all" ? "הכל" : d === "in" ? "התקבלו" : "נשלחו"}
          </button>
        ))}
        <button onClick={() => setPaused((p) => !p)} className="rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground">{paused ? "המשך רענון" : "השהה"}</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        {!log?.entries.length ? <p className="p-4 text-sm text-muted-foreground">{err ? "השרת המקומי לא זמין." : "עדיין אין שינויים ביומן."}</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-right text-muted-foreground">
              <th className="p-2">זמן</th><th className="p-2">כיוון</th><th className="p-2">תחנה</th><th className="p-2">ערוץ</th><th className="p-2">סוג</th><th className="p-2">מפתח</th><th className="p-2">חותמת שינוי</th><th className="p-2">תוצאה</th>
            </tr></thead>
            <tbody>
              {log.entries.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap text-muted-foreground">{fmt(e.ts)}</td>
                  <td className="p-2">{e.direction === "in" ? "⬇ התקבל" : "⬆ נשלח"}</td>
                  <td className="p-2 font-mono text-xs" dir="ltr">{e.peer ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{e.via === "drive" ? "דרייב" : e.via === "http" ? "ישיר" : e.via ?? "—"}</td>
                  <td className="p-2">{scopeLabel[e.scope] ?? e.scope}</td>
                  <td className="p-2 max-w-[220px] truncate font-mono text-xs" dir="ltr" title={e.key}>{e.key}</td>
                  <td className="p-2 whitespace-nowrap font-mono text-xs text-muted-foreground">{new Date(e.hlc).toLocaleString("he-IL")}</td>
                  <td className={`p-2 ${e.outcome.startsWith("error:") ? "text-destructive" : e.outcome.startsWith("skipped") ? "text-muted-foreground" : "text-primary"}`}>{outcomeLabel(e.outcome)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
