/**
 * ApiConnectModal — guided connection flow for a provider that the health
 * probe reported as missing or failing. Shows where to sign up, whether a free
 * tier exists, and stores the key locally (browser-only) so the operator can
 * see exactly what still needs to be promoted to a server secret.
 */
import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, ShieldCheck, Trash2, X } from "lucide-react";
import { apiCredentials, setupFor } from "@/lib/apiCredentials";

export function ApiConnectModal({
  providerId,
  providerName,
  reason,
  onClose,
  onSaved,
}: {
  providerId: string | null;
  providerName?: string;
  reason?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});

  const info = providerId ? setupFor(providerId) : null;
  const fields = info?.fields ?? (info ? [info.envVar] : []);

  useEffect(() => {
    if (!providerId) return;
    const existing = apiCredentials.get(providerId);
    setValues(existing ? { [existing.envVar]: existing.value } : {});
  }, [providerId]);

  if (!providerId || !info) return null;

  function save() {
    const primary = fields[0];
    const val = values[primary] ?? "";
    if (!val.trim()) return;
    apiCredentials.set(
      providerId!,
      primary,
      val,
      fields
        .slice(1)
        .map((f) => `${f}=${values[f] ?? ""}`)
        .join("; ") || undefined,
    );
    onSaved?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/30 bg-primary/10">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold">Connect {providerName ?? providerId}</h3>
              {reason && <p className="text-[11px] font-mono text-muted-foreground">{reason}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 rounded-md border border-border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={info.signupUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Get a key
            </a>
            {info.docsUrl && (
              <a
                href={info.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Docs
              </a>
            )}
            {info.free && (
              <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                free tier{info.freeQuota ? ` · ${info.freeQuota}` : ""}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2.5">
          {fields.map((f) => (
            <label key={f} className="block">
              <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">{f}</div>
              <input
                type="password"
                autoComplete="off"
                value={values[f] ?? ""}
                onChange={(e) => setValues({ ...values, [f]: e.target.value })}
                placeholder="paste value"
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
            </label>
          ))}
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          Stored in this browser only. Server-side calls still need the same value saved as a backend
          secret named <code className="font-mono">{fields[0]}</code>.
        </p>

        <div className="mt-4 flex justify-between gap-2">
          <button
            onClick={() => {
              apiCredentials.remove(providerId);
              onSaved?.();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-xs">
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
