import { useState } from "react";
import { X, CheckCircle2, Loader2, ShieldCheck, GitBranch, Play, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface Props {
  paramKey: string;
  oldValue: string;
  newValue: string;
  onClose: () => void;
  onApplied: () => void;
}

const STEPS = [
  { id: "snapshot", label: "Snapshot", icon: GitBranch, desc: "Encrypted backup of current state" },
  { id: "dryrun", label: "Dry Run & Diagnose", icon: Play, desc: "Validate against guardrails" },
  { id: "approval", label: "Admin Approval", icon: Lock, desc: "Confirm change in audit log" },
  { id: "apply", label: "Apply & Validate", icon: ShieldCheck, desc: "Hot-reload with rollback safety" },
] as const;

export function SafeChangeModal({ paramKey, oldValue, newValue, onClose, onApplied }: Props) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function advance() {
    if (step < STEPS.length - 1) {
      setBusy(true);
      await new Promise((r) => setTimeout(r, 600));
      setStep(step + 1);
      setBusy(false);
      return;
    }
    // final apply
    setBusy(true);
    await api.applyParamChange(paramKey, newValue, `tok_${Date.now()}`);
    setBusy(false);
    setDone(true);
    setTimeout(() => {
      onApplied();
      onClose();
    }, 900);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border-strong glass-strong p-6 shadow-[0_30px_80px_-20px_var(--primary)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Safe-Change Workflow</h2>
            <p className="text-xs font-mono text-muted-foreground">
              Editing <span className="text-primary">{paramKey}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card/40 p-3">
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground">Current</div>
            <div className="mt-1 font-mono text-sm break-all text-destructive/90">{oldValue}</div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase text-muted-foreground">Proposed</div>
            <div className="mt-1 font-mono text-sm break-all text-success">{newValue}</div>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state = done || i < step ? "done" : i === step ? "active" : "pending";
            return (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 rounded-md border px-3 py-2.5 transition-all",
                  state === "done" && "border-success/30 bg-success/5",
                  state === "active" && "border-primary/40 bg-primary/5 shadow-[0_0_20px_-8px_var(--primary)]",
                  state === "pending" && "border-border bg-card/30 opacity-60",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md",
                    state === "done" && "bg-success/15 text-success",
                    state === "active" && "bg-primary/20 text-primary",
                    state === "pending" && "bg-muted text-muted-foreground",
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : state === "active" && busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">
                    {i + 1}. {s.label}
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <span className="text-[11px] font-mono text-muted-foreground">
            audit-id: chg_{paramKey.slice(0, 6)}_{Date.now().toString(36).slice(-4)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-card/50 px-4 py-2 text-sm hover:border-border-strong transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={advance}
              disabled={busy || done}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {done ? "Applied" : step < STEPS.length - 1 ? `Next: ${STEPS[step + 1].label}` : "Apply Change"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
