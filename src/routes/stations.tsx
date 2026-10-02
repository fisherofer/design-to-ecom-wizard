import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { stationSync, type SyncStatus } from "@/lib/stationSync";
import { readSettings } from "@/lib/driveSyncSettings";

export const Route = createFileRoute("/stations")({
  head: () => ({
    meta: [
      { title: "Hive Stations — Multi-Station Sync" },
      { name: "description", content: "See every station in the hive, when it last synced, and sync changes directly or through Google Drive." },
      { property: "og:title", content: "Hive Stations" },
      { property: "og:description", content: "Each station keeps its own full local copy and exchanges only changes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Stations,
});

function Stations() {
  const [st, setSt] = useState<SyncStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await stationSync.status();
    if (r.ok) { setSt(r.data); setErr(null); } else setErr(r.error);
  }, []);

  useEffect(() => {
    void load();
    const auto = setInterval(async () => {
      const f = readSettings().folderId;
      if (f) await stationSync.viaDrive(f);
      void load();
    }, 120_000);
    return () => clearInterval(auto);
  }, [load]);

  const viaDrive = async () => {
    const f = readSettings().folderId;
    if (!f) return toast.error("בחר קודם תיקייה במסך Drive Sync");
    setBusy(true);
    const r = await stationSync.viaDrive(f);
    setBusy(false);
    if (r.ok) toast.success(`נשלחו ${r.data.pushed} שינויים, התקבלו ${r.data.applied} מ-${r.data.stations} תחנות`);
    else toast.error(r.error);
    void load();
  };

  const pull = async () => {
    if (!/^https?:\/\//.test(url) || !token) return toast.error("הזן כתובת http(s) וקוד סנכרון של התחנה השנייה");
    setBusy(true);
    const r = await stationSync.pull(url, token);
    setBusy(false);
    if (r.ok) toast.success(`התקבלו ${r.data.applied} שינויים`); else toast.error(r.error);
    void load();
  };

  return (
    <div dir="rtl" className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold text-foreground">תחנות הכוורת</h1>
      <p className="text-muted-foreground">כל תחנה שומרת עותק מלא משלה ומעבירה לאחרות רק מה שהשתנה. סודות ונתונים זמניים לא עוברים.</p>
      {err && <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive">{err}</div>}
      {st && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">התחנה הזאת</div>
          <div className="font-mono text-foreground">{st.self}</div>
          <div className="text-sm text-muted-foreground">שינויים שנרשמו עד כה: {st.head}</div>
          <div className="text-sm text-muted-foreground">תיקיית דרייב: <span className="font-mono" dir="ltr">{st.folder?.id ?? readSettings().folderId ?? "לא נבחרה"}</span></div>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-foreground">סנכרון דרך גוגל דרייב</h2>
        <p className="text-sm text-muted-foreground">לתחנות שלא יכולות להתחבר זו לזו ישירות. רץ אוטומטית כל 2 דקות כשנבחרה תיקייה.</p>
        <button disabled={busy} onClick={viaDrive} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">סנכרן עכשיו דרך דרייב</button>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold text-foreground">חיבור ישיר לתחנה אחרת</h2>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://192.168.1.20:8000" className="w-full rounded-md border border-input bg-background p-2 text-foreground" dir="ltr" />
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="קוד הסנכרון של התחנה השנייה (מסך Goose)" type="password" className="w-full rounded-md border border-input bg-background p-2 text-foreground" dir="ltr" />
        <button disabled={busy} onClick={pull} className="rounded-md bg-secondary px-4 py-2 text-secondary-foreground disabled:opacity-50">משוך שינויים</button>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold text-foreground">תחנות מוכרות</h2>
        {!st?.peers.length ? <p className="text-sm text-muted-foreground">עדיין לא הסתנכרנה אף תחנה אחרת.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-right">
                <th className="p-2">תחנה</th><th className="p-2">מחוברת</th><th className="p-2">סנכרון אחרון</th><th className="p-2">ערוץ</th><th className="p-2">תיקיית דרייב / כתובת</th>
              </tr></thead>
              <tbody>
                {st.peers.map((p) => {
                  const online = Date.now() / 1000 - p.last_seen < 600;
                  return (
                    <tr key={p.station_id} className="border-t border-border">
                      <td className="p-2 font-mono text-foreground">{p.name && p.name !== "drive" ? `${p.name} · ` : ""}{p.station_id}</td>
                      <td className="p-2"><span className={online ? "text-primary" : "text-muted-foreground"}>{online ? "● פעילה" : "○ לא פעילה"}</span></td>
                      <td className="p-2 text-muted-foreground">{new Date(p.last_seen * 1000).toLocaleString("he-IL")}</td>
                      <td className="p-2 text-muted-foreground">{p.via === "drive" ? "דרייב" : p.via === "http" ? "ישיר" : p.via ?? "—"}</td>
                      <td className="p-2 font-mono text-xs text-muted-foreground" dir="ltr">{p.folder ?? p.url ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">"פעילה" = הסתנכרנה ב-10 הדקות האחרונות.</p>
          </div>
        )}
      </div>
    </div>
  );
}
