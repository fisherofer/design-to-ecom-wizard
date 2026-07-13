/**
 * SystemHealthBanner — connection status to Local Ollama, Cloud APIs, and
 * the FastAPI backend. Polls /health every 6 s. Fully non-blocking: renders
 * a red "offline" strip when the backend cannot be reached.
 */
import { useEffect, useState } from "react";
import { Activity, Cloud, Cpu, Server } from "lucide-react";
import { HealthService, type SystemHealth } from "@/services/api";
import { cn } from "@/lib/utils";

export function SystemHealthBanner() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [online, setOnline] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    async function tick() {
      try {
        const h = await HealthService.checkStatus();
        if (mounted) {
          setHealth(h);
          setOnline(true);
        }
      } catch {
        if (mounted) {
          setOnline(false);
          setHealth(null);
        }
      }
    }
    void tick();
    const t = window.setInterval(tick, 6000);
    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, []);

  const cloudUp = health?.cloud
    ? Object.values(health.cloud).some(Boolean)
    : false;
  const ollamaUp = !!health?.ollama.online;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur",
        online
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/40 bg-red-500/10",
      )}
    >
      <Dot label="FastAPI" up={online} icon={Server} detail={online ? health?.backend_version ?? "ok" : "offline"} />
      <Dot label="Ollama" up={ollamaUp} icon={Cpu} detail={health?.ollama.models.length ? `${health.ollama.models.length} models` : "—"} />
      <Dot label="Cloud APIs" up={cloudUp} icon={Cloud} detail={
        health?.cloud
          ? Object.entries(health.cloud).filter(([, v]) => v).map(([k]) => k).join(", ") || "none"
          : "—"
      } />
      <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        {online ? `status: ${health?.status ?? "ok"}` : "backend unreachable — start QuantEngine on :8000"}
      </div>
    </div>
  );
}

function Dot({
  label, up, detail, icon: Icon,
}: { label: string; up: boolean; detail?: string; icon: typeof Server }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md",
        up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="leading-tight">
        <div className="text-xs font-medium">{label}</div>
        <div className="font-mono text-[10px] text-muted-foreground">{detail ?? (up ? "online" : "offline")}</div>
      </div>
    </div>
  );
}
