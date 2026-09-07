import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Database, Download, Eraser, RefreshCw, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  eraseUserData,
  exportUserData,
  getPrivacy,
  getStats,
  purgeExpired,
  setPrivacy,
  type PrivacySetting,
  type StoreStats,
} from "@/lib/localStore";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy & Local Data — Consent, Retention, Erasure" },
      {
        name: "description",
        content:
          "See exactly what the system stores on this machine, separate personal data from system data, set retention windows, export or erase everything.",
      },
      { property: "og:title", content: "Privacy & Local Data" },
      {
        property: "og:description",
        content: "Consent flags, retention windows, export and erasure for the local database.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

const PURPOSE_LABELS: Record<string, string> = {
  store_conversations: "שמירת שיחות והיסטוריה",
  share_with_cloud_models: "שליחת תוכן למודלים בענן",
  telegram_bridge: "גשר טלגרם למודל המקומי",
  telemetry: "טלמטריה תפעולית של המערכת",
};

function PrivacyPage() {
  const [settings, setSettings] = useState<PrivacySetting[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const p = await getPrivacy();
    setSettings(p.settings);
    setError(p.ok ? null : (p.error ?? "המסד המקומי אינו זמין"));
    const s = await getStats();
    setStats("db" in s ? (s as StoreStats) : null);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggle(purpose: string, granted: boolean) {
    try {
      await setPrivacy(purpose, { granted });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function changeRetention(purpose: string, days: number) {
    try {
      await setPrivacy(purpose, { retention_days: days });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doExport() {
    try {
      const data = await exportUserData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("הנתונים האישיים יוצאו לקובץ.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5 text-primary" /> פרטיות ונתונים מקומיים
        </h1>
        <p className="text-sm text-muted-foreground">
          כל המידע נשמר במסד SQL מקומי בתוך ה-VENV. נתוני משתמש ונתוני מערכת מופרדים, ונתוני מערכת עוברים
          טשטוש של מזהים אישיים לפני הכתיבה.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-border glass p-4 text-sm text-muted-foreground">
          המסד המקומי אינו זמין: {error}. הפעל את השרת המקומי במחשב כדי לנהל פרטיות.
        </div>
      )}

      <section className="rounded-xl border border-border glass p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" /> מה שמור כרגע
          </h2>
          <button onClick={() => void load()} className="rounded-md border border-border p-1.5 hover:bg-accent">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {stats ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold">נתוני משתמש (אישי)</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>שיחות: {stats.user.conversations}</li>
                <li>הודעות: {stats.user.messages}</li>
                <li>העדפות: {stats.user.preferences}</li>
              </ul>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold">נתוני מערכת (מטושטש)</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>הרצות סוכנים: {stats.system.agent_runs}</li>
                <li>אירועים: {stats.system.events}</li>
                <li>הגדרות: {stats.system.settings}</li>
                <li>רשומות תקציב: {stats.system.ledger_entries}</li>
              </ul>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              קובץ: <span className="font-mono">{stats.db}</span> · {(stats.size_bytes / 1024).toFixed(0)} KB
            </p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">אין מידע זמין.</p>
        )}
      </section>

      <section className="rounded-xl border border-border glass p-4">
        <h2 className="text-sm font-semibold">הסכמות ותקופות שמירה</h2>
        <ul className="mt-3 space-y-2">
          {settings.map((s) => (
            <li key={s.purpose} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm">{PURPOSE_LABELS[s.purpose] ?? s.purpose}</p>
                <p className="text-xs text-muted-foreground font-mono">{s.purpose}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs">
                  שמירה (ימים)
                  <input
                    type="number"
                    min={0}
                    value={s.retention_days}
                    onChange={(e) => void changeRetention(s.purpose, Number(e.target.value))}
                    className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  />
                </label>
                <button
                  onClick={() => void toggle(s.purpose, !s.granted)}
                  className={`rounded-md px-3 py-1.5 text-xs ${
                    s.granted ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"
                  }`}
                >
                  {s.granted ? "מאושר" : "לא מאושר"}
                </button>
              </div>
            </li>
          ))}
          {!settings.length && !error && (
            <li className="text-xs text-muted-foreground">אין הגדרות להצגה.</li>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-border glass p-4">
        <h2 className="text-sm font-semibold">הזכויות שלך</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void doExport()}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" /> ייצוא הנתונים שלי
          </button>
          <button
            onClick={async () => {
              const res = await purgeExpired();
              toast.success(`נמחקו רשומות שפג תוקפן: ${JSON.stringify(res.deleted)}`);
              await load();
            }}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Trash2 className="h-4 w-4" /> ניקוי לפי תקופת שמירה
          </button>
          <button
            onClick={async () => {
              if (!confirm("למחוק לצמיתות את כל הנתונים האישיים והשיחות?")) return;
              const res = await eraseUserData();
              toast.success(`נמחק: ${JSON.stringify(res.deleted)}`);
              await load();
            }}
            className="flex items-center gap-1 rounded-md border border-destructive px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          >
            <Eraser className="h-4 w-4" /> מחיקת כל הנתונים האישיים
          </button>
        </div>
      </section>
    </div>
  );
}
