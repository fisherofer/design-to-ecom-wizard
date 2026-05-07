/**
 * ModelFiltersTab — UI for editing the model filter policy
 * (geo blocks, license allowlist, minimum AI score, etc.).
 */
import { useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import { DEFAULT_POLICY, loadPolicy, savePolicy, type FilterPolicy } from "@/lib/modelFilters";

const ORIGINS = ["CN", "US", "FR", "UK", "DE", "??"];
const LICENSES = ["apache-2.0", "mit", "llama3", "gemma", "openrail", "cc-by-4.0"];

export function ModelFiltersTab() {
  const [p, setP] = useState<FilterPolicy>(loadPolicy());

  const toggle = <K extends keyof FilterPolicy>(key: K, value: string) => {
    const arr = p[key] as unknown as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    setP({ ...p, [key]: next } as FilterPolicy);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Filter Policy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Applied automatically to Hub search results and AI-recommendation routing.
        </p>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <div className="mb-2 text-xs font-mono uppercase text-muted-foreground">Blocked origins</div>
            <div className="flex flex-wrap gap-1.5">
              {ORIGINS.map((o) => (
                <button
                  key={o}
                  onClick={() => toggle("blockedOrigins", o)}
                  className={`rounded border px-2 py-1 text-xs ${p.blockedOrigins.includes(o) ? "border-destructive bg-destructive/10 text-destructive" : "border-border"}`}
                >{o}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-mono uppercase text-muted-foreground">Allowed licenses (empty = any)</div>
            <div className="flex flex-wrap gap-1.5">
              {LICENSES.map((l) => (
                <button
                  key={l}
                  onClick={() => toggle("allowedLicenses", l)}
                  className={`rounded border px-2 py-1 text-xs ${p.allowedLicenses.includes(l) ? "border-success bg-success/10 text-success" : "border-border"}`}
                >{l}</button>
              ))}
            </div>
          </div>

          <NumberRow label="Min downloads" value={p.minDownloads} onChange={(v) => setP({ ...p, minDownloads: v })} />
          <NumberRow label="Min likes" value={p.minLikes} onChange={(v) => setP({ ...p, minLikes: v })} />
          <NumberRow label="Min AI score (0–100)" value={p.minAiScore} onChange={(v) => setP({ ...p, minAiScore: v })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={p.blockGated} onChange={(e) => setP({ ...p, blockGated: e.target.checked })} />
            Block gated models
          </label>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={() => savePolicy(p)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Save className="h-4 w-4" /> Save policy
          </button>
          <button
            onClick={() => setP(DEFAULT_POLICY)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </section>
    </div>
  );
}

function NumberRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-mono uppercase text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-border bg-background px-3 py-2"
      />
    </label>
  );
}
