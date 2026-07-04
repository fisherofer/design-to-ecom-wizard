import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Wand2,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  PackageX,
  Container,
  Loader2,
} from "lucide-react";
import { api, type HealthReport, type HealthLevel } from "@/lib/api";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "System Health — AI Executive OS" },
      {
        name: "description",
        content: "Verify Python, Docker, Ollama, npm and dependencies. AI-driven self-repair.",
      },
    ],
  }),
  component: SystemHealth,
});

function SystemHealth() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState<string | null>(null);
  const [repairLog, setRepairLog] = useState<string[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      setReport(await api.healthCheck());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function repair(name?: string) {
    setRepairing(name ?? "ALL");
    try {
      const res = await api.systemRepair(name);
      setRepairLog((l) => [...res.log, ...l].slice(0, 100));
      await refresh();
    } finally {
      setRepairing(null);
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">System Health</h1>
            <p className="text-sm text-muted-foreground font-mono">
              Boot-time + continuous checks · Python · Docker · Ollama · npm · deps
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Re-scan
          </button>
          <button
            onClick={() => repair()}
            disabled={!!repairing}
            className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-accent to-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--accent)] hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {repairing === "ALL" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            Auto-Repair via AI
          </button>
        </div>
      </div>

      {/* Overall banner */}
      {report && <OverallBanner report={report} />}

      {/* Components */}
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {report?.components.map((c) => (
          <ComponentCard
            key={c.name}
            comp={c}
            repairing={repairing === c.name}
            onRepair={() => repair(c.name)}
          />
        ))}
      </div>

      {/* Docker / npm quick controls removed — endpoints not implemented on backend.
          Use /api/health/doctor (Repair) above to auto-fix dependency issues. */}

      {/* Repair log */}
      {repairLog.length > 0 && (
        <div className="mt-6 rounded-xl border border-border glass overflow-hidden">
          <div className="border-b border-border bg-card/30 px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Auto-Repair Log
          </div>
          <pre className="bg-[var(--terminal-bg)] p-4 font-mono text-[11px] text-success max-h-64 overflow-auto">
            {repairLog.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

function OverallBanner({ report }: { report: HealthReport }) {
  const cfg =
    report.overall === "ok"
      ? { Icon: CheckCircle2, color: "text-success", border: "border-success/40", bg: "bg-success/5", label: "All Systems Operational" }
      : report.overall === "warn"
        ? { Icon: AlertTriangle, color: "text-warning", border: "border-warning/40", bg: "bg-warning/5", label: "Attention Needed" }
        : { Icon: XCircle, color: "text-destructive", border: "border-destructive/40", bg: "bg-destructive/5", label: "Critical Errors Detected" };

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex items-center gap-3`}>
      <cfg.Icon className={`h-6 w-6 ${cfg.color}`} />
      <div className="flex-1">
        <div className={`font-display text-base font-semibold ${cfg.color}`}>{cfg.label}</div>
        <div className="text-[11px] font-mono text-muted-foreground">
          Last scan {new Date(report.ts).toLocaleString()} · {report.components.length} components checked
        </div>
      </div>
    </div>
  );
}

function ComponentCard({
  comp,
  repairing,
  onRepair,
}: {
  comp: HealthReport["components"][number];
  repairing: boolean;
  onRepair: () => void;
}) {
  const cfg = LEVEL_CFG[comp.level];
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <cfg.Icon className={`h-5 w-5 ${cfg.color} shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">{comp.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
              {comp.version && <span>v{comp.version}</span>}
              {comp.required && <span className="text-muted-foreground/60">required {comp.required}</span>}
            </div>
            {comp.message && <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{comp.message}</p>}
          </div>
        </div>
        {comp.level !== "ok" && comp.fixable && (
          <button
            onClick={onRepair}
            disabled={repairing}
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors disabled:opacity-60"
          >
            {repairing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            AI Fix
          </button>
        )}
      </div>
    </div>
  );
}

const LEVEL_CFG: Record<HealthLevel, { Icon: typeof CheckCircle2; color: string; border: string; bg: string }> = {
  ok: { Icon: CheckCircle2, color: "text-success", border: "border-success/30", bg: "bg-success/5" },
  warn: { Icon: AlertTriangle, color: "text-warning", border: "border-warning/30", bg: "bg-warning/5" },
  error: { Icon: XCircle, color: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/5" },
  missing: { Icon: PackageX, color: "text-destructive", border: "border-destructive/30", bg: "bg-destructive/5" },
};
