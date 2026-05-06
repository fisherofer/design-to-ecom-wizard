import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Code2, ShieldAlert, ShieldCheck, RotateCcw, PlayCircle } from "lucide-react";
import {
  analyzeSafety,
  applyProposal,
  diffSummary,
  loadHistory,
  makeProposal,
  type ApplyResult,
  type ChangeProposal,
  type SafetyLevel,
} from "@/lib/selfCoding";

export const Route = createFileRoute("/code-studio")({
  head: () => ({
    meta: [
      { title: "Code Studio — AI Executive OS" },
      { name: "description", content: "AI-driven self-modification with guardrails." },
    ],
  }),
  component: CodeStudio,
});

const SAMPLE: ChangeProposal = makeProposal({
  title: "Add cache layer to marketData",
  rationale:
    "Reduce duplicate adapter calls across Trading Hub widgets. 60s TTL with stale-while-revalidate.",
  author: "ai",
  changes: [
    {
      path: "src/lib/marketData.ts",
      kind: "modify",
      before: "export function getQuotes(klass) {\n  return [...];\n}",
      after:
        "const CACHE = new Map();\nexport function getQuotes(klass) {\n  const k = klass||'all';\n  const hit = CACHE.get(k);\n  if (hit && Date.now()-hit.t<60000) return hit.v;\n  const v = [...];\n  CACHE.set(k,{t:Date.now(),v});\n  return v;\n}",
    },
  ],
});

const DANGEROUS: ChangeProposal = makeProposal({
  title: "Refactor router bootstrap",
  rationale: "Switch to lazy route loading.",
  author: "ai",
  changes: [
    { path: "src/router.tsx", kind: "modify", before: "x", after: "y" },
    { path: "src/routes/__root.tsx", kind: "modify", before: "x", after: "y" },
  ],
});

function CodeStudio() {
  const [proposal, setProposal] = useState<ChangeProposal>(SAMPLE);
  const [autoApprove, setAutoApprove] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [history, setHistory] = useState<ApplyResult[]>(() => loadHistory());

  const safety = analyzeSafety(proposal);

  const run = async () => {
    setRunning(true);
    const r = await applyProposal(proposal, { autoApprove });
    setResult(r);
    setHistory(loadHistory());
    setRunning(false);
  };

  return (
    <div className="px-6 py-6">
      <header className="mb-6 flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
          <Code2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Code Studio</h1>
          <p className="text-sm text-muted-foreground font-mono">
            Self-modification · diff preview · auto-rollback
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-xl border border-border glass">
          <div className="border-b border-border px-5 py-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
              Proposal
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setProposal(SAMPLE)}
                className="text-[11px] font-mono uppercase text-muted-foreground hover:text-foreground"
              >
                Sample · safe
              </button>
              <button
                onClick={() => setProposal(DANGEROUS)}
                className="text-[11px] font-mono uppercase text-destructive hover:text-destructive/80"
              >
                Sample · danger
              </button>
            </div>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <div className="text-sm font-semibold">{proposal.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{proposal.rationale}</p>
            </div>
            <SafetyBadge safety={safety} />
            <div className="space-y-2">
              {proposal.changes.map((c, i) => {
                const d = diffSummary(c);
                return (
                  <div
                    key={i}
                    className="rounded border border-border/60 bg-card/30 px-3 py-2 font-mono text-xs"
                  >
                    <div className="flex justify-between">
                      <span>
                        <span
                          className={
                            c.kind === "delete"
                              ? "text-destructive"
                              : c.kind === "create"
                              ? "text-success"
                              : "text-warning"
                          }
                        >
                          {c.kind.toUpperCase()}
                        </span>{" "}
                        {c.path}
                      </span>
                      <span className="text-muted-foreground">
                        +{d.added} −{d.removed}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <label className="flex items-center gap-2 text-xs font-mono">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
              />
              Auto-approve (bypass blockers — use carefully)
            </label>
            <button
              disabled={running}
              onClick={run}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-mono font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              {running ? "Running…" : "Apply with guardrails"}
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-border glass">
            <div className="border-b border-border px-5 py-3">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                Last Run
              </h3>
            </div>
            <div className="px-5 py-4 font-mono text-xs space-y-1.5">
              {!result && <span className="text-muted-foreground">Awaiting run…</span>}
              {result && (
                <>
                  <div
                    className={`flex items-center gap-2 ${
                      result.ok ? "text-success" : "text-destructive"
                    }`}
                  >
                    {result.ok ? "✓ Applied" : result.rolledBack ? "↩ Rolled back" : "✗ Blocked"}
                  </div>
                  {result.log.map((l, i) => (
                    <div key={i} className="text-muted-foreground">
                      {l}
                    </div>
                  ))}
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-border glass">
            <div className="border-b border-border px-5 py-3 flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                History
              </h3>
            </div>
            <div className="divide-y divide-border max-h-[300px] overflow-auto">
              {history.length === 0 && (
                <div className="px-5 py-3 text-xs text-muted-foreground">No history yet</div>
              )}
              {history.map((h, i) => (
                <div key={i} className="px-5 py-2.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span
                      className={
                        h.ok ? "text-success" : h.rolledBack ? "text-warning" : "text-destructive"
                      }
                    >
                      {h.ok ? "OK" : h.rolledBack ? "ROLLBACK" : "BLOCKED"}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(h.appliedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SafetyBadge({ safety }: { safety: ReturnType<typeof analyzeSafety> }) {
  const map: Record<SafetyLevel, { color: string; Icon: typeof ShieldCheck; label: string }> = {
    safe: { color: "text-success border-success/30 bg-success/10", Icon: ShieldCheck, label: "Safe" },
    review: {
      color: "text-warning border-warning/30 bg-warning/10",
      Icon: ShieldAlert,
      label: "Needs review",
    },
    danger: {
      color: "text-destructive border-destructive/30 bg-destructive/10",
      Icon: ShieldAlert,
      label: "Danger",
    },
  };
  const { color, Icon, label } = map[safety.level];
  return (
    <div className={`rounded border px-3 py-2 ${color}`}>
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {(safety.reasons.length > 0 || safety.blockers.length > 0) && (
        <ul className="mt-1.5 list-disc pl-5 text-[11px] space-y-0.5">
          {safety.blockers.map((b, i) => (
            <li key={`b${i}`} className="text-destructive">
              {b}
            </li>
          ))}
          {safety.reasons.map((r, i) => (
            <li key={`r${i}`} className="text-muted-foreground">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
