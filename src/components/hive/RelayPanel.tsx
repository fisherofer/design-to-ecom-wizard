import { useEffect, useState } from "react";
import { toast } from "sonner";
import { stationSync, type RelayStatus } from "@/lib/stationSync";
import { readSettings } from "@/lib/driveSyncSettings";

/** Headless hive sync: the station talks to the hosted app's relay on its own, even with no browser open. */
export function RelayPanel() {
  const [st, setSt] = useState<RelayStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await stationSync.relayStatus();
    if (r.ok) { setSt(r.data); setErr(null); } else setErr(r.error);
  };
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15_000); return () => clearInterval(t); }, []);

  const save = async (enabled: boolean) => {
    const folder = readSettings().folderId;
    if (!folder) return toast.error("בחר קודם תיקייה במסך Drive Sync");
    if (enabled && !pass && !st?.passphrase_set) return toast.error("הזן את סיסמת הממסר");
    setBusy(true);
    const r = await stationSync.relaySave({ url: window.location.origin, folder_id: folder, enabled, passphrase: pass || undefined });
    if (r.ok && r.data.ok) {
      setPass("");
      if (enabled) {
        const run = await stationSync.relayRun();
        if (run.ok && run.data.ok) toast.success(`מחובר: נשלחו ${run.data.pushed}, התקבלו ${run.data.applied} מ-${run.data.stations} תחנות`);
        else toast.error(`נשמר, אבל הבדיקה נכשלה: ${run.ok ? run.data.error : run.error}`);
      } else toast.success("הסנכרון ברקע כובה");
    } else toast.error(r.ok ? "שמירה נכשלה" : r.error);
    setBusy(false);
    void load();
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold text-foreground">סנכרון ברקע — גם כשהדפדפן סגור</h2>
      <p className="text-sm text-muted-foreground">
        התחנה שולחת בעצמה כל 2 דקות את השינויים (הגדרות, שיחות, תור המשימות) לאפליקציה המקוונת, שמעבירה אותם לתיקייה בדרייב ומחזירה את השינויים של שאר התחנות. כל תחנה חדשה שמופיעה בתיקייה מתחברת לבד.
      </p>
      {err && <div className="text-sm text-destructive">{err}</div>}
      {st && (
        <div className="grid gap-1 text-sm">
          <div>מצב: <span className={st.enabled ? "text-primary" : "text-muted-foreground"}>{st.enabled ? "פעיל" : "כבוי"}</span></div>
          <div className="text-muted-foreground">ריצה אחרונה: {st.last_run ? new Date(st.last_run * 1000).toLocaleString("he-IL") : "—"}{st.last_ok === false && st.last_error ? <span className="text-destructive"> · {st.last_error}</span> : null}</div>
          {st.last_ok && <div className="text-muted-foreground">נשלחו {st.pushed} · התקבלו {st.applied} · תחנות אחרות {st.stations}</div>}
        </div>
      )}
      <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={st?.passphrase_set ? "סיסמת ממסר שמורה — השאר ריק" : "סיסמת הממסר (זהה בכל התחנות)"} className="w-full rounded-md border border-input bg-background p-2 text-sm" dir="ltr" />
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void save(true)} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">הפעל ובדוק</button>
        <button disabled={busy || !st?.enabled} onClick={() => void save(false)} className="rounded-md bg-secondary px-4 py-2 text-sm text-secondary-foreground disabled:opacity-50">כבה</button>
      </div>
    </section>
  );
}
