import { useEffect, useState } from "react";
import { Cpu, Cloud, Database, Wifi, ShieldCheck, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { api, type HealthReport } from "@/lib/api";

export function StatusBar() {
  const [time, setTime] = useState(() => new Date());
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const h = await api.healthCheck();
        if (!cancelled) setHealth(h);
      } finally {
        if (!cancelled) setLoadingHealth(false);
      }
    }
    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const stats = [
    { icon: Cpu, label: "LOCAL", value: "OLLAMA 8B", color: "text-success" },
    { icon: Cloud, label: "CLOUD", value: "GEMINI 1.5 PRO", color: "text-primary" },
    { icon: Database, label: "DB", value: "CONNECTED", color: "text-success" },
    { icon: Wifi, label: "LATENCY", value: "12ms", color: "text-warning" },
  ];

  return (
    <footer className="sticky bottom-0 z-30 flex h-7 items-center justify-between gap-4 border-t border-border bg-background/90 px-4 font-mono text-[10px] uppercase tracking-wider backdrop-blur-xl">
      <div className="flex items-center gap-4 overflow-hidden">
        <HealthIndicator health={health} loading={loadingHealth} />
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="hidden md:flex items-center gap-1.5 whitespace-nowrap">
              <Icon className={`h-3 w-3 ${s.color}`} />
              <span className="text-muted-foreground/60">{s.label}:</span>
              <span className={s.color}>{s.value}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="hidden sm:inline">UTC</span>
        <span className="text-foreground tabular-nums">{time.toISOString().slice(11, 19)}</span>
        <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
      </div>
    </footer>
  );
}

function HealthIndicator({ health, loading }: { health: HealthReport | null; loading: boolean }) {
  if (loading) {
    return (
      <Link
        to="/system"
        className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>health: scanning…</span>
      </Link>
    );
  }
  if (!health) return null;

  const cfg =
    health.overall === "ok"
      ? { Icon: ShieldCheck, color: "text-success", label: "ALL SYSTEMS OK" }
      : health.overall === "warn"
        ? { Icon: AlertTriangle, color: "text-warning", label: "ATTENTION NEEDED" }
        : { Icon: XCircle, color: "text-destructive", label: "ERRORS DETECTED" };

  const issues = health.components.filter((c) => c.level !== "ok").length;

  return (
    <Link
      to="/system"
      className="flex items-center gap-1.5 whitespace-nowrap hover:opacity-80 transition-opacity"
      title="Open System Health"
    >
      <cfg.Icon className={`h-3 w-3 ${cfg.color}`} />
      <span className={cfg.color}>{cfg.label}</span>
      {issues > 0 && (
        <span className="rounded border border-warning/40 bg-warning/10 px-1 text-warning">
          {issues}
        </span>
      )}
    </Link>
  );
}
