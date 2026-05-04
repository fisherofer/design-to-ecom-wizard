/** Theme tab: live token editor + JSON import/export. */
import { useEffect, useState } from "react";
import { Download, RotateCcw } from "lucide-react";
import {
  applyTheme,
  exportTheme,
  importTheme,
  loadTheme,
  resetTheme,
  saveTheme,
  type ThemeTokens,
} from "@/theme/tokens";
import { Field } from "./Field";

const GROUPS: Array<{ title: string; keys: Array<keyof ThemeTokens> }> = [
  { title: "Surfaces", keys: ["background", "foreground", "surface", "surfaceElevated", "card"] },
  { title: "Brand", keys: ["primary", "primaryGlow", "accent"] },
  { title: "Semantic", keys: ["success", "warning", "destructive", "info"] },
  { title: "Sidebar & Terminal", keys: ["sidebar", "sidebarAccent", "terminalBg"] },
];

export function ThemeTab() {
  const [tokens, setTokens] = useState<ThemeTokens>(() => loadTheme());
  const [importText, setImportText] = useState("");

  useEffect(() => {
    applyTheme(tokens);
    saveTheme(tokens);
  }, [tokens]);

  function update<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) {
    setTokens((t) => ({ ...t, [key]: value }));
  }

  function handleExport() {
    const blob = new Blob([exportTheme(tokens)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `theme-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }
  function handleImport() {
    try { setTokens(importTheme(importText)); setImportText(""); }
    catch { alert("Invalid JSON"); }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Theme Engine</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              All design tokens live in <span className="font-mono text-xs">src/theme/tokens.ts</span>.
              Changes here apply live and persist to localStorage.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExport} className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-elevated">
              <Download className="h-4 w-4" /> Export
            </button>
            <button onClick={() => setTokens(resetTheme())} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/15">
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">{group.title}</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.keys.map((k) => (
                  <ColorRow key={k} label={k} value={tokens[k] as string} onChange={(v) => update(k, v as ThemeTokens[typeof k])} />
                ))}
              </div>
            </div>
          ))}

          <div>
            <div className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">Geometry</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Border radius (rem)">
                <input
                  type="text"
                  value={tokens.radius}
                  onChange={(e) => update("radius", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Border opacity (0..1)">
                <input
                  type="text"
                  value={tokens.borderOpacity}
                  onChange={(e) => update("borderOpacity", e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Import / Export JSON</h2>
        <p className="mt-1 text-sm text-muted-foreground">Paste a previously exported theme to restore it.</p>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{ "primary": "oklch(0.7 0.2 235)", ... }'
          rows={6}
          className="mt-3 w-full rounded-md border border-border bg-background p-3 font-mono text-xs focus:border-primary focus:outline-none"
        />
        <button
          onClick={handleImport}
          disabled={!importText}
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Import Theme
        </button>
      </section>
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <div className="h-7 w-7 shrink-0 rounded-md border border-border" style={{ background: value }} />
      <div className="min-w-[120px] text-xs text-muted-foreground">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] focus:border-primary focus:outline-none"
      />
    </div>
  );
}
