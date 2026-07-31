/** AI Plugins Manager — enable/disable agent capabilities with honest requirement labels. */
import { useEffect, useState } from "react";
import { Puzzle, RotateCcw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { AI_PLUGINS, PLUGINS_EVENT, aiPlugins, type PluginCategory } from "@/lib/aiPlugins";

const CATEGORY_LABEL: Record<PluginCategory, string> = {
  market: "Market Data",
  trading: "Trading",
  research: "Research",
  system: "System",
  ai: "AI Core",
};

export function AiPluginsManager() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const sync = () => setEnabled(aiPlugins.enabledMap());
    sync();
    window.addEventListener(PLUGINS_EVENT, sync);
    return () => window.removeEventListener(PLUGINS_EVENT, sync);
  }, []);

  const groups = (Object.keys(CATEGORY_LABEL) as PluginCategory[]).map((c) => ({
    category: c,
    items: AI_PLUGINS.filter((p) => p.category === c),
  }));
  const activeCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-border glass">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            AI Plugins Manager
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {activeCount}/{AI_PLUGINS.length} enabled
          </span>
          <button
            onClick={() => aiPlugins.reset()}
            className="flex items-center gap-1.5 rounded border border-border px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Defaults
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {groups.map((g) => (
          <div key={g.category}>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[g.category]}
            </p>
            <div className="space-y-1.5">
              {g.items.map((p) => {
                const on = enabled[p.id] ?? p.defaultEnabled;
                return (
                  <button
                    key={p.id}
                    onClick={() => aiPlugins.toggle(p.id, !on)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      on
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/60 bg-card/20 hover:border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        on ? "bg-success pulse-dot" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{p.name}</span>
                        {p.writes && (
                          <span className="flex items-center gap-1 rounded border border-warning/40 px-1 py-0.5 font-mono text-[9px] uppercase text-warning">
                            <ShieldAlert className="h-2.5 w-2.5" /> writes
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {p.description}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {p.endpoint && (
                          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {p.endpoint}
                          </span>
                        )}
                        {p.requires.map((r) => (
                          <span
                            key={r}
                            className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          >
                            {r}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
