/**
 * PhaseBanner — persistent safety strip.
 * Codifies rule #4 from CLAUDE_CONTINUITY_PROTOCOL: the project is in
 * PHASE 1 — Recommendations Only. No live trading without explicit consent.
 */
import { useState, useEffect } from "react";
import { ShieldAlert, X } from "lucide-react";

const DISMISS_KEY = "ai-os.phaseBanner.dismissedAt";
const RESHOW_MS = 1000 * 60 * 60 * 8; // reshow every 8h

export function PhaseBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      setVisible(Date.now() - t > RESHOW_MS);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 border-b border-warning/40 bg-warning/10 px-4 py-1.5 text-[11px] font-mono uppercase tracking-wider text-warning">
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">
        PHASE 1 · Recommendations Only — no automated live trading is executed by this system.
      </span>
      <button
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
          setVisible(false);
        }}
        className="ml-auto rounded p-0.5 hover:bg-warning/20"
        aria-label="Dismiss safety banner"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
