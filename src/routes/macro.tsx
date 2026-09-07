import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2, Upload } from "lucide-react";
import { MarketClock } from "@/components/dashboard/MarketClock";

export const Route = createFileRoute("/macro")({
  head: () => ({
    meta: [
      { title: "Macro Calendar — CPI, FOMC & Earnings Events" },
      {
        name: "description",
        content:
          "Track macro events that move the tape: CPI, FOMC, jobs and earnings, with importance, expected impact and countdown.",
      },
      { property: "og:title", content: "Macro Calendar — CPI, FOMC & Earnings Events" },
      {
        property: "og:description",
        content: "Macro event tracker with importance scoring and live countdown to the next release.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MacroPage,
});

type Importance = "low" | "medium" | "high";

interface MacroEvent {
  id: string;
  title: string;
  at: string; // ISO
  importance: Importance;
  note?: string;
}

const KEY = "ai-os.macroCalendar.v1";

function load(): MacroEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as MacroEvent[];
  } catch {
    return [];
  }
}

function save(list: MacroEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

const BADGE: Record<Importance, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
};

function countdown(at: string) {
  const ms = new Date(at).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";
  if (ms < 0) return "עבר";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d > 0) return `בעוד ${d} ימים`;
  if (h > 0) return `בעוד ${h} שעות`;
  return `בעוד ${Math.max(1, Math.floor(ms / 60_000))} דק׳`;
}

function MacroPage() {
  const [events, setEvents] = useState<MacroEvent[]>([]);
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [importance, setImportance] = useState<Importance>("high");

  useEffect(() => setEvents(load()), []);

  const sorted = useMemo(
    () => [...events].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    [events],
  );

  const commit = (next: MacroEvent[]) => {
    setEvents(next);
    save(next);
  };

  const add = () => {
    if (!title.trim() || !at) return;
    commit([
      ...events,
      { id: `mac_${Date.now()}`, title: title.trim(), at: new Date(at).toISOString(), importance },
    ]);
    setTitle("");
    setAt("");
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as MacroEvent[];
      if (!Array.isArray(parsed)) throw new Error("bad format");
      commit([...events, ...parsed.filter((e) => e.title && e.at)]);
    } catch {
      /* ignore malformed file */
    }
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-5 w-5 text-primary" />
            לוח מאקרו
          </h1>
          <p className="text-sm text-muted-foreground">
            אירועים שמזיזים את השוק — CPI, ריבית, תעסוקה ודוחות. הנתונים נשמרים אצלך בדפדפן, אין כאן המצאת תאריכים.
          </p>
        </div>
        <MarketClock />
      </header>

      <section className="rounded-xl border border-border glass p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">אירוע</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="CPI · ארה״ב"
              className="w-56 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">מועד</span>
            <input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">חשיבות</span>
            <select
              value={importance}
              onChange={(e) => setImportance(e.target.value as Importance)}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="high">גבוהה</option>
              <option value="medium">בינונית</option>
              <option value="low">נמוכה</option>
            </select>
          </label>
          <button
            onClick={add}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            הוסף
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="h-4 w-4" />
            ייבוא JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
              }}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-border glass p-4">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין אירועים. הוסף אירוע או ייבא קובץ JSON.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="p-2 text-start">אירוע</th>
                <th className="p-2 text-start">מועד</th>
                <th className="p-2 text-start">ספירה לאחור</th>
                <th className="p-2 text-start">חשיבות</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="p-2">{e.title}</td>
                  <td className="p-2 font-mono text-xs">{new Date(e.at).toLocaleString("he-IL")}</td>
                  <td className="p-2 text-xs">{countdown(e.at)}</td>
                  <td className="p-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${BADGE[e.importance]}`}>
                      {e.importance === "high" ? "גבוהה" : e.importance === "medium" ? "בינונית" : "נמוכה"}
                    </span>
                  </td>
                  <td className="p-2 text-end">
                    <button
                      onClick={() => commit(events.filter((x) => x.id !== e.id))}
                      className="rounded-md border border-border p-1 hover:bg-muted"
                      aria-label="מחק אירוע"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
