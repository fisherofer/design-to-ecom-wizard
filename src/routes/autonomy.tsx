import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bot, BookOpen, Cpu, Download, Globe, Play, RefreshCw, Shield, Square, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addMemory, approveMemory, autopilotConfig, autopilotJournal, autopilotRun, autopilotStart,
  autopilotStatus, autopilotStop, browserInstall, browserStatus, engineDownload, engineEnsureReady,
  engineInstall, engineStatus, forgetMemory, listMemory,
  type AutopilotStatus, type BrowserStatus, type EngineStatus, type JournalEntry, type MemoryItem,
} from "@/lib/autonomy";

export const Route = createFileRoute("/autonomy")({
  head: () => ({
    meta: [
      { title: "Autonomy — Local Engine, Browser, Memory & Autopilot" },
      {
        name: "description",
        content:
          "Run the system on its own: a built-in local AI engine with no external daemon, a local browser for research, owner-approved learning memory and a scheduled autopilot with a continuity journal.",
      },
      { property: "og:title", content: "Autonomy Control" },
      {
        property: "og:description",
        content: "Built-in local AI engine, research browser, learning rules and autopilot jobs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AutonomyPage,
});

const JOB_LABELS: Record<string, string> = {
  news: "איסוף חדשות",
  analysis: "ניתוח במודל המקומי",
  sources: "גילוי מקורות חדשים",
  code: "חיפוש מקורות קוד",
  journal: "יומן המשכיות",
};

const KIND_LABELS: Record<string, string> = { rule: "חוק", lesson: "לקח", fact: "עובדה" };

function ts(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toLocaleString("he-IL") : "—";
}

function AutonomyPage() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [browser, setBrowser] = useState<BrowserStatus | null>(null);
  const [pilot, setPilot] = useState<AutopilotStatus | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [constitution, setConstitution] = useState<string[]>([]);
  const [newRule, setNewRule] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [e, b, p, j, m] = await Promise.all([
      engineStatus(), browserStatus(), autopilotStatus(), autopilotJournal(60), listMemory(),
    ]);
    setEngine(e);
    setBrowser(b);
    setPilot(p);
    setJournal(j.entries);
    setMemory(m.items);
    setConstitution(m.constitution);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, []);

  async function act(key: string, fn: () => Promise<unknown>, okMsg: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const hubDown = engine?.error || pilot?.error;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Bot className="h-6 w-6 text-primary" /> אוטונומיה
        </h1>
        <p className="text-sm text-muted-foreground">
          מנוע AI מקומי עצמאי, דפדפן מחקר, זיכרון לומד בכפוף לאישור שלך, וטייס אוטומטי עם יומן המשכיות.
        </p>
      </header>

      {hubDown && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          המרכז המקומי אינו פועל. הפעל את השרת המקומי על המחשב כדי לשלוט במנוע, בדפדפן ובטייס האוטומטי.
        </div>
      )}

      {/* ------------------------------------------------------ local engine */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <Cpu className="h-4 w-4 text-primary" /> מנוע מקומי מובנה (ללא Ollama)
          </h2>
          <button onClick={() => void load()} className="rounded-md border border-border p-2 hover:bg-muted">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className={engine?.engine_installed ? "text-emerald-500" : "text-muted-foreground"}>
            מנוע llama-cpp: {engine?.engine_installed ? `מותקן ${engine.engine_version}` : "לא מותקן"}
          </span>
          <button
            disabled={busy === "engine"}
            onClick={() => void act("engine", engineInstall, "המנוע הותקן בסביבה המקומית")}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            התקן מנוע
          </button>
          <button
            disabled={busy === "ready"}
            onClick={() =>
              void act("ready", async () => {
                const r = await engineEnsureReady();
                if (!r.ok) throw new Error(r.error ?? `שלב: ${r.step}`);
              }, "המודל המקומי טעון ומוכן")
            }
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            הפעל והכן מודל
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(engine?.models ?? []).map((m) => (
            <div key={m.id} className="rounded-lg border border-border p-3">
              <div className="text-sm font-medium text-foreground">{m.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{m.use}</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {m.size_mb} MB · דורש ~{m.ram_gb}GB RAM
              </div>
              <div className="mt-2 text-xs">
                {m.downloaded ? (
                  <span className="text-emerald-500">הורד</span>
                ) : m.progress?.state === "downloading" ? (
                  <span className="text-primary">מוריד… {m.progress.pct ?? 0}%</span>
                ) : m.progress?.state === "error" ? (
                  <span className="text-destructive">{m.progress.error}</span>
                ) : (
                  <button
                    onClick={() => void act(m.id, () => engineDownload(m.id), "ההורדה החלה")}
                    className="flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-muted"
                  >
                    <Download className="h-3 w-3" /> הורד
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- browser */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-foreground">
          <Globe className="h-4 w-4 text-primary" /> דפדפן מקומי למחקר
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className={browser?.ok ? "text-emerald-500" : "text-muted-foreground"}>
            {browser?.ok ? "מוכן" : `לא מוכן${browser?.missing?.length ? ` — חסר: ${browser.missing.join(", ")}` : ""}`}
          </span>
          <button
            disabled={busy === "browser"}
            onClick={() => void act("browser", browserInstall, "הדפדפן המקומי הותקן")}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            התקן דפדפן
          </button>
          <span className="text-xs text-muted-foreground">
            להתחברויות שדורשות אותך — הפעולה נפתחת בדפדפן שלך ואינה נשמרת בשרת.
          </span>
        </div>
      </section>

      {/* --------------------------------------------------------- autopilot */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <Play className="h-4 w-4 text-primary" /> טייס אוטומטי
          </h2>
          {pilot?.running ? (
            <button
              onClick={() => void act("stop", autopilotStop, "הטייס האוטומטי הופסק")}
              className="flex items-center gap-1 rounded-md border border-destructive/50 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
            >
              <Square className="h-3 w-3" /> עצור
            </button>
          ) : (
            <button
              onClick={() => void act("start", autopilotStart, "הטייס האוטומטי פועל")}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              <Play className="h-3 w-3" /> הפעל
            </button>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(pilot?.config.jobs ?? {}).map(([name, cfg]) => {
            const last = pilot?.last_run?.[name];
            return (
              <div key={name} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{JOB_LABELS[name] ?? name}</span>
                  <input
                    type="checkbox"
                    checked={cfg.enabled}
                    onChange={(e) =>
                      void act(name, () =>
                        autopilotConfig({ jobs: { [name]: { ...cfg, enabled: e.target.checked } } }), "עודכן")
                    }
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">כל {cfg.every_min} דקות</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  אחרון: {ts(last?.at)} {last ? (last.ok ? "✓" : `✗ ${last.error ?? ""}`) : ""}
                </div>
                <button
                  disabled={busy === `run-${name}`}
                  onClick={() =>
                    void act(`run-${name}`, async () => {
                      const r = await autopilotRun(name);
                      if (!r.ok) throw new Error(r.error ?? "המשימה לא החזירה תוצאה");
                    }, "המשימה הסתיימה")
                  }
                  className="mt-2 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  הרץ עכשיו
                </button>
              </div>
            );
          })}
        </div>
        {typeof pilot?.latest?.analysis?.text === "string" && (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="mb-1 text-xs text-muted-foreground">תקציר החדשות האחרון מהמודל המקומי</div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{pilot.latest.analysis.text}</p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------ memory */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-foreground">
          <Shield className="h-4 w-4 text-primary" /> חוקים וזיכרון לומד
        </h2>
        <ul className="mb-4 space-y-1 text-xs text-muted-foreground">
          {constitution.map((c) => (
            <li key={c}>• {c}</li>
          ))}
        </ul>
        <div className="mb-4 flex gap-2">
          <input
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="הוסף חוק שהמערכת חייבת לציית לו"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            disabled={!newRule.trim()}
            onClick={() =>
              void act("rule", async () => {
                await addMemory("rule", newRule.trim());
                setNewRule("");
              }, "החוק נוסף — אשר אותו כדי שייכנס לתוקף")
            }
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            הוסף
          </button>
        </div>
        <div className="space-y-2">
          {memory.length === 0 && <p className="text-sm text-muted-foreground">אין עדיין זיכרון שמור.</p>}
          {memory.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <div className="text-xs text-muted-foreground">
                  {KIND_LABELS[m.kind]} · {m.topic} · {ts(m.updated_at)}
                </div>
                <p className="text-sm text-foreground">{m.content}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {m.kind === "rule" && (
                  <button
                    onClick={() => void act(`ap-${m.id}`, () => approveMemory(m.id, !m.approved), "עודכן")}
                    className={`rounded-md px-2 py-1 text-xs ${
                      m.approved ? "bg-emerald-500/15 text-emerald-500" : "border border-border"
                    }`}
                  >
                    {m.approved ? "מאושר" : "אשר"}
                  </button>
                )}
                <button
                  onClick={() => void act(`rm-${m.id}`, () => forgetMemory(m.id), "הוסר")}
                  className="rounded-md border border-border p-1 hover:bg-muted"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- journal */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-medium text-foreground">
          <BookOpen className="h-4 w-4 text-primary" /> יומן המשכיות
        </h2>
        {journal.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין רשומות ביומן.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {journal.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3 border-b border-border/50 py-1">
                <span className="w-40 shrink-0 text-xs text-muted-foreground">{ts(e.at)}</span>
                <span className="w-24 shrink-0 text-xs text-primary">{JOB_LABELS[e.kind] ?? e.kind}</span>
                <span className="text-foreground">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
