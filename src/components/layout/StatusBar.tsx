import { useEffect, useState } from "react";
import { Cpu, Cloud, Database, Wifi } from "lucide-react";

export function StatusBar() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const stats = [
    { icon: Cpu, label: "LOCAL ENGINE", value: "OLLAMA 8B", color: "text-success" },
    { icon: Cloud, label: "CLOUD ENGINE", value: "GEMINI 1.5 PRO", color: "text-primary" },
    { icon: Database, label: "DB", value: "CONNECTED", color: "text-success" },
    { icon: Wifi, label: "LATENCY", value: "12ms", color: "text-warning" },
  ];

  return (
    <footer className="sticky bottom-0 z-30 flex h-7 items-center justify-between gap-4 border-t border-border bg-background/90 px-4 font-mono text-[10px] uppercase tracking-wider backdrop-blur-xl">
      <div className="flex items-center gap-4 overflow-hidden">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="flex items-center gap-1.5 whitespace-nowrap">
              <Icon className={`h-3 w-3 ${s.color}`} />
              <span className="text-muted-foreground/60">{s.label}:</span>
              <span className={s.color}>{s.value}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="hidden sm:inline">UTC</span>
        <span className="text-foreground tabular-nums">
          {time.toISOString().slice(11, 19)}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
      </div>
    </footer>
  );
}
