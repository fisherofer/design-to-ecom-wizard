import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users,
  Youtube,
  Twitter,
  BookOpen,
  MessageCircle,
  Sparkles,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Brain,
  GitBranch,
  ShieldCheck,
  X,
  Check,
  FlaskConical,
  Loader2,
} from "lucide-react";
import { api, type Persona, type PersonaThesis, type EvolutionProposal } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/personas")({
  head: () => ({
    meta: [
      { title: "Persona Trackers — AI Executive OS" },
      {
        name: "description",
        content:
          "Track human alpha creators with trust scores, plus the Meta-Agent evolution hub.",
      },
    ],
  }),
  component: PersonasPage,
});

const PLATFORM_ICON = {
  YouTube: Youtube,
  X: Twitter,
  Substack: BookOpen,
  Reddit: MessageCircle,
} as const;

function PersonasPage() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPersona, setOpenPersona] = useState<Persona | null>(null);
  const [tab, setTab] = useState<"personas" | "evolution">("personas");

  async function refresh() {
    setLoading(true);
    const [p, e] = await Promise.all([api.listPersonas(), api.listProposals()]);
    setPersonas(p);
    setProposals(e);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="px-6 py-6">
      <div className="mb-5 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-2xl font-bold tracking-tight">Persona Trackers · Meta-Agent</h1>
              <NotWiredBadge detail="Persona system + Meta-Agent evolution proposals are on the roadmap — showing mock data until /personas and /evolution/proposals ship on the backend." />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {personas.length} alpha creators tracked · {proposals.filter((p) => p.status === "pending").length} evolution proposals pending
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Re-sync
        </button>
      </div>

      {/* Tab switcher */}
      <div className="mb-5 inline-flex rounded-lg border border-border bg-card/40 p-1">
        <TabButton active={tab === "personas"} onClick={() => setTab("personas")} icon={Users}>
          Persona Leaderboard
        </TabButton>
        <TabButton active={tab === "evolution"} onClick={() => setTab("evolution")} icon={GitBranch}>
          Evolution Hub
          {proposals.filter((p) => p.status === "pending").length > 0 && (
            <span className="ml-1 rounded bg-primary/20 text-primary px-1.5 text-[10px] font-mono">
              {proposals.filter((p) => p.status === "pending").length}
            </span>
          )}
        </TabButton>
      </div>

      {tab === "personas" && (
        <PersonaLeaderboard personas={personas} loading={loading} onOpen={setOpenPersona} />
      )}
      {tab === "evolution" && (
        <EvolutionHub
          proposals={proposals}
          onDecide={(id, decision) =>
            api.decideProposal(id, decision).then((updated) =>
              setProposals((prev) => prev.map((p) => (p.id === id ? updated : p))),
            )
          }
        />
      )}

      {openPersona && <PersonaDrawer persona={openPersona} onClose={() => setOpenPersona(null)} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition-all",
        active
          ? "bg-primary/15 text-primary shadow-[0_0_18px_-6px_var(--primary)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function PersonaLeaderboard({
  personas,
  loading,
  onOpen,
}: {
  personas: Persona[];
  loading: boolean;
  onOpen: (p: Persona) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border glass p-10 text-center">
        <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border glass overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-card/50 text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <th className="px-5 py-3">Creator</th>
            <th className="px-3 py-3">Platform</th>
            <th className="px-3 py-3 w-52">Trust Score</th>
            <th className="px-3 py-3">Active Theses</th>
            <th className="px-3 py-3">Mode</th>
            <th className="px-3 py-3">Last Scan</th>
            <th className="px-5 py-3 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {personas.map((p) => {
            const Icon = PLATFORM_ICON[p.platform];
            const score = Math.round(p.trustScore * 100);
            const trustColor = score > 70 ? "bg-success" : score > 50 ? "bg-warning" : "bg-destructive";
            return (
              <tr
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer hover:bg-card/40 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{p.handle}</div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {p.platform}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${trustColor}`} style={{ width: `${score}%` }} />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-foreground w-16 text-right">
                      {score}% ({p.successful}/{p.totalTracked})
                    </span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="font-mono text-sm tabular-nums text-primary">{p.activeTheses.length}</span>
                </td>
                <td className="px-3 py-3.5">
                  <span
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                      p.learningMode === "strict"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-warning/30 bg-warning/10 text-warning",
                    )}
                  >
                    {p.learningMode}
                  </span>
                </td>
                <td className="px-3 py-3.5 font-mono text-[11px] text-muted-foreground">{p.lastScan}</td>
                <td className="px-5 py-3.5 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 font-mono text-xs",
                      p.active ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        p.active ? "bg-success pulse-dot shadow-[0_0_8px_currentColor]" : "bg-muted",
                      )}
                    />
                    {p.active ? "tracking" : "paused"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PersonaDrawer({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const Icon = PLATFORM_ICON[persona.platform];
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg h-full glass-strong border-l border-primary/30 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-primary/20 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold">{persona.name}</h2>
              <p className="font-mono text-xs text-muted-foreground">{persona.handle} · {persona.platform}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Trust Score" value={`${Math.round(persona.trustScore * 100)}%`} accent="primary" />
            <Stat label="Tracked" value={String(persona.totalTracked)} />
            <Stat label="Profitable" value={`${persona.successful} (${Math.round((persona.successful / Math.max(1, persona.totalTracked)) * 100)}%)`} accent="success" />
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider">
              <Sparkles className="h-4 w-4 text-primary" />
              Distilled Theses (noise removed)
            </h3>
            <div className="space-y-2">
              {persona.activeTheses.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-center text-xs font-mono text-muted-foreground">
                  No active theses extracted.
                </div>
              )}
              {persona.activeTheses.map((t, i) => (
                <ThesisCard key={i} t={t} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThesisCard({ t }: { t: PersonaThesis }) {
  const isLong = t.direction === "LONG";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">{t.ticker}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
              isLong
                ? "border-success/40 bg-success/10 text-success"
                : "border-destructive/40 bg-destructive/10 text-destructive",
            )}
          >
            {isLong ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {t.direction}
          </span>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
            t.confidence === "HIGH"
              ? "border-primary/40 bg-primary/10 text-primary"
              : t.confidence === "MEDIUM"
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-muted/30 text-muted-foreground",
          )}
        >
          {t.confidence}
        </span>
      </div>
      <p className="mt-2 text-xs text-foreground leading-snug">{t.entryLogic}</p>
      <div className="mt-1.5 text-[11px] font-mono text-muted-foreground">
        <span className="text-muted-foreground/60">catalyst:</span> {t.catalyst}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "primary" | "success";
}) {
  const color = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-lg font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

// -------- Evolution Hub --------
function EvolutionHub({
  proposals,
  onDecide,
}: {
  proposals: EvolutionProposal[];
  onDecide: (id: string, d: "approve" | "reject" | "sandbox") => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-4 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/20 text-accent shrink-0">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold">Meta-Agent active · Scanning GitHub + ArXiv</h3>
          <p className="text-xs text-muted-foreground mt-1">
            The Meta-Agent reads open-source quant repos, drafts new strategies, runs them in a sandbox, and submits
            backtested proposals here. Approve to deploy, sandbox to A/B test, reject to dismiss.
          </p>
        </div>
      </div>

      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} onDecide={(d) => onDecide(p.id, d)} />
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
  onDecide,
}: {
  proposal: EvolutionProposal;
  onDecide: (d: "approve" | "reject" | "sandbox") => void;
}) {
  const statusCfg = {
    pending: { color: "border-border", chip: "bg-muted text-muted-foreground" },
    approved: { color: "border-success/40", chip: "bg-success/15 text-success" },
    rejected: { color: "border-destructive/40", chip: "bg-destructive/15 text-destructive" },
    sandboxed: { color: "border-warning/40", chip: "bg-warning/15 text-warning" },
  }[proposal.status];

  return (
    <div className={cn("rounded-xl border glass p-5", statusCfg.color)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-base font-semibold">{proposal.proposedAgent}</h3>
            <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", statusCfg.chip)}>
              {proposal.status}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            <span className="truncate">{proposal.source}</span>
            <span>·</span>
            <span>{proposal.createdAt}</span>
          </div>
          <p className="mt-2.5 text-sm text-foreground leading-relaxed">{proposal.description}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl font-bold text-success tabular-nums">+{proposal.estimatedAlpha}%</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">est. alpha</div>
        </div>
      </div>

      {/* Audits */}
      <div className="mt-4 rounded-lg border border-border bg-card/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Safety & Security Audit · {proposal.safetyScore}/100
          </span>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {proposal.audits.map((a, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center rounded-full",
                  a.pass ? "bg-success/20 text-success" : "bg-warning/20 text-warning",
                )}
              >
                {a.pass ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
              </span>
              <span className={a.pass ? "text-muted-foreground" : "text-warning"}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {proposal.status === "pending" && (
        <div className="mt-4 flex items-center gap-2 justify-end">
          <button
            onClick={() => onDecide("reject")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs font-mono hover:border-destructive/40 hover:text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Reject
          </button>
          <button
            onClick={() => onDecide("sandbox")}
            className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-mono text-warning hover:bg-warning/20 transition-colors"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Sandbox A/B
          </button>
          <button
            onClick={() => onDecide("approve")}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-success to-primary px-3 py-1.5 text-xs font-mono font-semibold text-primary-foreground shadow-[0_0_18px_-4px_var(--success)] hover:opacity-90 transition-opacity"
          >
            <Check className="h-3.5 w-3.5" /> Approve & Deploy
          </button>
        </div>
      )}
    </div>
  );
}
