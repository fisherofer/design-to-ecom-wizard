/**
 * Refresh tab — control global + per-component refresh intervals.
 */
import { useRef } from "react";
import { Download, Upload, RotateCcw, Pause } from "lucide-react";
import {
  COMPONENT_META,
  PRESETS,
  refreshConfig,
  useRefreshConfig,
  type ComponentId,
} from "@/lib/refreshIntervals";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatMs(ms: number): string {
  if (ms === 0) return "Paused";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${ms / 1000}s`;
  return `${ms / 60_000}m`;
}

function PresetRow({
  value,
  onChange,
  allowInherit = false,
}: {
  value: number | undefined;
  onChange: (ms: number | undefined) => void;
  allowInherit?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {allowInherit && (
        <button
          onClick={() => onChange(undefined)}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            value === undefined
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Inherit
        </button>
      )}
      {PRESETS.map((p) => (
        <button
          key={p.label}
          onClick={() => onChange(p.ms)}
          className={cn(
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
            value === p.ms
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {p.label === "Paused" ? <Pause className="inline h-3 w-3" /> : p.label}
        </button>
      ))}
    </div>
  );
}

export function RefreshTab() {
  const cfg = useRefreshConfig();
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([refreshConfig.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `refresh-intervals-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported refresh config");
  };

  const handleImport = async (file: File) => {
    try {
      refreshConfig.importJson(await file.text());
      toast.success("Imported refresh config");
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Global Refresh Interval</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Default cadence for any component without its own override.
              Currently <span className="font-mono text-foreground">{formatMs(cfg.globalMs)}</span>.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refreshConfig.reset()}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="mt-4">
          <PresetRow
            value={cfg.globalMs}
            onChange={(ms) => refreshConfig.setGlobal(ms ?? 30_000)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Per-Component Overrides</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tune individual widgets. Choose <em>Inherit</em> to fall back to the global rate, or
          <em> Paused</em> to stop polling entirely.
        </p>
        <div className="mt-4 divide-y divide-border">
          {(Object.keys(COMPONENT_META) as ComponentId[]).map((id) => {
            const meta = COMPONENT_META[id];
            const override = cfg.overrides[id];
            const effective = override ?? cfg.globalMs;
            return (
              <div key={id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-[180px]">
                  <div className="text-sm font-medium">{meta.label}</div>
                  <div className="text-xs text-muted-foreground">{meta.description}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    → {formatMs(effective)}
                  </span>
                  <PresetRow
                    value={override}
                    onChange={(ms) => refreshConfig.setOverride(id, ms)}
                    allowInherit
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
