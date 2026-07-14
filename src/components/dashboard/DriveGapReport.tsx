/**
 * Drive Gap Report widget — freshness verdict per backup target.
 * Data: getDriveGapReport server fn (reads drive_backup_targets globally).
 */
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CloudCheck, CloudOff, CloudAlert, Clock3, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDriveGapReport, type GapReport, type Freshness } from "@/lib/driveGap.functions";

const STYLE: Record<Freshness, { icon: typeof CloudCheck; cls: string; label: string; emoji: string }> = {
  fresh:    { icon: CloudCheck, cls: "text-emerald-500 border-emerald-500/40 bg-emerald-500/5",  label: "Fresh",    emoji: "🟢" },
  stale:    { icon: Clock3,     cls: "text-amber-500 border-amber-500/40 bg-amber-500/5",         label: "Stale",    emoji: "🟡" },
  broken:   { icon: CloudAlert, cls: "text-red-500 border-red-500/40 bg-red-500/5",               label: "Broken",   emoji: "🔴" },
  disabled: { icon: CloudOff,   cls: "text-muted-foreground border-border/60 bg-muted/20",        label: "Disabled", emoji: "⚫" },
  never:    { icon: Clock3,     cls: "text-sky-500 border-sky-500/40 bg-sky-500/5",               label: "Never",    emoji: "⚪" },
};

function humanAge(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${h.toFixed(1)}h ago`;
  return `${(h / 24).toFixed(1)}d ago`;
}

export function DriveGapReport() {
  const load = useServerFn(getDriveGapReport);
  const [rep, setRep] = useState<GapReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try { setRep(await load()); } finally { setBusy(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
      <header className="flex items-center gap-2">
        <CloudCheck className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Drive Gap Report</h3>
        <span className="text-[10px] text-muted-foreground">
          Live code ↔ Drive snapshot freshness
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={refresh} disabled={busy}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        </Button>
      </header>

      {!rep && <div className="text-xs text-muted-foreground">Loading…</div>}

      {rep && rep.total === 0 && (
        <div className="text-xs text-muted-foreground">
          No backup targets configured. Add one under <span className="font-mono">/repo-analyzer</span>.
        </div>
      )}

      {rep && rep.total > 0 && (
        <>
          <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
            {(["fresh", "stale", "broken", "disabled", "never"] as Freshness[]).map((k) => {
              const s = STYLE[k];
              return (
                <div key={k} className={`rounded-md border px-2 py-1.5 ${s.cls}`}>
                  <div className="font-mono text-lg leading-none">{rep[k]}</div>
                  <div className="opacity-70">{s.emoji} {s.label}</div>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-border/40 max-h-64 overflow-y-auto">
            {rep.targets.map((t) => {
              const s = STYLE[t.freshness];
              const Icon = s.icon;
              return (
                <div key={t.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${s.cls.split(" ")[0]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate">{t.repo_url.replace(/^https:\/\//, "")}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      → {t.root_folder} · {humanAge(t.hours_since)} · {t.last_uploaded} file(s)
                      {t.last_error && <span className="text-red-500"> · {t.last_error}</span>}
                    </div>
                  </div>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase font-mono ${s.cls}`}>
                    {s.emoji} {s.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="text-[10px] text-muted-foreground">
            Generated {new Date(rep.generated_at).toLocaleTimeString()} · fresh = synced within 30h
          </div>
        </>
      )}
    </section>
  );
}
