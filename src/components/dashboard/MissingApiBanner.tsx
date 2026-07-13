/**
 * Missing-API banner
 * ==================
 * Surfaces external services that autonomous agents (and the operator) need
 * to sign up for. Collapsible; persists dismissal in localStorage per-id.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Key, ChevronDown, ChevronUp } from "lucide-react";
import { getUnmetApis, type MissingApiEntry } from "@/lib/missingApis";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "missing-apis:dismissed:v1";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const PRIORITY_EMOJI: Record<MissingApiEntry["priority"], string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

export function MissingApiBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [open, setOpen] = useState(true);

  const items = useMemo(
    () => getUnmetApis().filter((x) => !dismissed.has(x.id)),
    [dismissed],
  );

  if (items.length === 0) return null;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch {}
  };

  const highCount = items.filter((x) => x.priority === "high").length;

  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="font-mono text-sm font-semibold">
            🔑 {items.length} external service{items.length > 1 ? "s" : ""} need API access
          </span>
          {highCount > 0 && (
            <span className="rounded bg-destructive/20 px-1.5 py-0.5 text-[10px] font-mono uppercase text-destructive">
              {highCount} high-priority
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((x) => (
            <div
              key={x.id}
              className={cn(
                "rounded-md border bg-card/40 p-2.5 text-xs",
                x.priority === "high" ? "border-destructive/40" : "border-border",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono font-semibold">
                  {PRIORITY_EMOJI[x.priority]} {x.name}
                </span>
                <div className="flex items-center gap-1">
                  {x.free && (
                    <span className="rounded bg-success/15 px-1 text-[9px] font-mono uppercase text-success">Free</span>
                  )}
                  <button
                    onClick={() => dismiss(x.id)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                    title="Hide"
                  >✕</button>
                </div>
              </div>
              <p className="mt-1 text-muted-foreground leading-snug">{x.neededFor}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                <a
                  href={x.signupUrl}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Sign up
                </a>
                {x.docsUrl && (
                  <a
                    href={x.docsUrl}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    Docs
                  </a>
                )}
                {x.envVar && (
                  <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-muted-foreground">
                    <Key className="h-3 w-3" /> {x.envVar}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
