import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { driveFullBackup } from "@/lib/driveSync.functions";
import { readSettings } from "@/lib/driveSyncSettings";
import { schedule } from "@/lib/productionSchedule";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Programme Calendar — Monthly, Quarterly and Earnings Season" },
      { name: "description", content: "Plan monthly, quarterly and earnings-season programmes and back the plan up to Google Drive." },
      { property: "og:title", content: "Programme Calendar" },
      { property: "og:description", content: "Production calendar with Drive backup of programme plans." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

type Kind = "monthly" | "quarterly" | "earnings" | "semiannual" | "year_end";
interface Entry { date: Date; kind: Kind; label: string }
const KIND_LABEL: Record<Kind, string> = {
  monthly: "סיכום חודשי", quarterly: "סיכום רבעוני", earnings: "עונת דיווחים", semiannual: "חצי שנה", year_end: "סיכום שנה",
};

function lastBusinessDay(y: number, m: number) {
  const d = new Date(y, m + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/** Earnings season opens ~2 weeks after quarter end (mid Jan/Apr/Jul/Oct). */
function buildEntries(year: number): Entry[] {
  const out: Entry[] = [];
  for (let m = 0; m < 12; m++) {
    const d = lastBusinessDay(year, m);
    const q = (m + 1) % 3 === 0;
    const kind: Kind = m === 11 ? "year_end" : m === 5 ? "semiannual" : q ? "quarterly" : "monthly";
    out.push({ date: d, kind, label: `${KIND_LABEL[kind]} — ${d.toLocaleDateString("he-IL", { month: "long" })}` });
    if (m % 3 === 0) {
      const e = new Date(year, m, 12);
      out.push({ date: e, kind: "earnings", label: `תצוגה מקדימה לעונת הדיווחים Q${m === 0 ? 4 : m / 3}` });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function CalendarPage() {
  const backup = useServerFn(driveFullBackup);
  const [year, setYear] = useState(new Date().getFullYear());
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [busy, setBusy] = useState(false);
  const entries = useMemo(() => buildEntries(year), [year]);
  const shown = entries.filter((e) => filter === "all" || e.kind === filter);
  const today = Date.now();

  const saveToDrive = async () => {
    const s = readSettings();
    if (!s.folderId) { toast.error("בחר תיקיית גיבוי במסך Drive Sync"); return; }
    setBusy(true);
    const plan = { year, generatedAt: new Date().toISOString(), entries: entries.map((e) => ({ ...e, date: e.date.toISOString() })), schedule: schedule.state() };
    const r = await backup({ data: { folderId: s.folderId, memory: JSON.stringify(plan), label: `plans-${year}`, maxFiles: 1 } });
    setBusy(false);
    if (r.ok) toast.success("תכנית ההפקה נשמרה בדרייב"); else toast.error(r.error ?? "גיבוי נכשל");
  };

  return (
    <div dir="rtl" className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-semibold">לוח שנה של תוכניות</h1>
        <button onClick={() => setYear(year - 1)} className="rounded-md border border-border px-2 py-1 text-sm">‹</button>
        <span className="font-mono">{year}</span>
        <button onClick={() => setYear(year + 1)} className="rounded-md border border-border px-2 py-1 text-sm">›</button>
        <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as Kind | "all")}>
          <option value="all">הכל</option>
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <button disabled={busy} onClick={saveToDrive} className="mr-auto rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
          {busy ? "שומר..." : "גבה תכנית לדרייב"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">מועדים מחושבים: יום המסחר האחרון בכל חודש; עונת דיווחים נפתחת כשבועיים אחרי סוף רבעון. חגים אינם מחושבים.</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {shown.map((e, i) => (
          <li key={i} className={`flex items-center gap-3 px-4 py-2 text-sm ${e.date.getTime() < today ? "opacity-50" : ""}`}>
            <span className="w-28 font-mono">{e.date.toLocaleDateString("he-IL")}</span>
            <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">{KIND_LABEL[e.kind]}</span>
            <span>{e.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
