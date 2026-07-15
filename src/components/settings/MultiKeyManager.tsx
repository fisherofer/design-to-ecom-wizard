/**
 * MultiKeyManager — modal for storing multiple API keys per provider with
 * bulk paste (one per line / comma-separated) and file import. Round-robin
 * rotation is handled by `keyVault.next(provider)`.
 */
import { useEffect, useRef, useState } from "react";
import { X, Upload, Plus, Trash2, KeyRound, CheckCircle2, AlertTriangle } from "lucide-react";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/modelDiscovery";
import { keyVault, type StoredKey } from "@/lib/apiKeyVault";
import { cn } from "@/lib/utils";

interface Props {
  provider: ProviderId;
  onClose: () => void;
}

export function MultiKeyManager({ provider, onClose }: Props) {
  const [keys, setKeys] = useState<StoredKey[]>(() => keyVault.list(provider));
  const [paste, setPaste] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setKeys(keyVault.list(provider));
    window.addEventListener(keyVault.EVENT, sync);
    return () => window.removeEventListener(keyVault.EVENT, sync);
  }, [provider]);

  const commit = () => {
    if (!paste.trim()) return;
    const { added, skipped } = keyVault.addMany(provider, paste);
    setPaste("");
    setFlash(`Added ${added}${skipped ? ` · ${skipped} skipped (duplicates/too short)` : ""}`);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const { added, skipped } = keyVault.addMany(provider, text);
    setFlash(`Imported ${added} from ${file.name}${skipped ? ` · ${skipped} skipped` : ""}`);
    window.setTimeout(() => setFlash(null), 2500);
  };

  const mask = (v: string) => (v.length <= 10 ? "•".repeat(v.length) : `${v.slice(0, 4)}…${v.slice(-4)}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold">{PROVIDER_LABELS[provider]} — Key Vault</h3>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
              {keys.length} key{keys.length === 1 ? "" : "s"}
            </span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[70vh] space-y-4 overflow-auto p-4">
          <section>
            <label className="mb-1 block text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Bulk paste (one per line, comma, or space separated)
            </label>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder="sk-xxxxx&#10;sk-yyyyy&#10;sk-zzzzz"
              className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs focus:border-primary focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={commit}
                disabled={!paste.trim()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" /> Add all
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-muted"
              >
                <Upload className="h-3.5 w-3.5" /> Import file
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.csv,.env,.keys"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {flash && (
                <span className="text-xs text-success">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                  {flash}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Keys are stored only in this browser. The router rotates them round-robin and skips keys marked exhausted.
            </p>
          </section>

          <section>
            <h4 className="mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">Stored keys</h4>
            {keys.length === 0 ? (
              <p className="text-sm text-muted-foreground">No keys yet — paste above or import a file.</p>
            ) : (
              <ul className="space-y-1.5">
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs">{mask(k.value)}</span>
                        <StatusBadge status={k.status} />
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                        <span>added {new Date(k.addedAt).toLocaleDateString()}</span>
                        {k.lastUsedAt && <span>· used {new Date(k.lastUsedAt).toLocaleTimeString()}</span>}
                        {k.lastError && <span className="text-warning">· {k.lastError}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => keyVault.remove(provider, k.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StoredKey["status"] }) {
  const cls = status === "active" ? "bg-success/15 text-success" : status === "exhausted" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase", cls)}>
      {status !== "active" && <AlertTriangle className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}
