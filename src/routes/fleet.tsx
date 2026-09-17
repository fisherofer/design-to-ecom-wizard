import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, Check, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  archiveRuns, decideProposal, fleetStatus, listProposals, listTasks, listWorkers,
  registerWorker, removeWorker, requeueStale, submitTask,
  type CodeProposal, type FleetStatus, type FleetTask, type FleetWorker,
} from "@/lib/fleet";

export const Route = createFileRoute("/fleet")({
  head: () => ({
    meta: [
      { title: "Agent Fleet — Workers, Task Queue & Code Proposals" },
      {
        name: "description",
        content:
          "Coordinate local agent workers, queue and track fleet tasks, archive agent runs into durable lessons and approve or reject code upgrade proposals before anything is applied.",
      },
      { property: "og:title", content: "Agent Fleet Control" },
      {
        property: "og:description",
        content: "Local agent workers, shared task queue and owner-approved code upgrade proposals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FleetPage,
});

const card = "rounded-lg border border-border bg-card p-4";
const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const btn = "inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent";

function FleetPage() {
  const [status, setStatus] = useState<FleetStatus | null>(null);
  const [workers, setWorkers] = useState<FleetWorker[]>([]);
  const [tasks, setTasks] = useState<FleetTask[]>([]);
  const [proposals, setProposals] = useState<CodeProposal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [workerName, setWorkerName] = useState("");
  const [workerRole, setWorkerRole] = useState("general");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskRole, setTaskRole] = useState("general");

  async function load() {
    setLoading(true);
    try {
      const [s, w, t, p] = await Promise.all([fleetStatus(), listWorkers(), listTasks(), listProposals()]);
      setStatus(s);
      setWorkers(w.workers);
      setTasks(t.tasks);
      setProposals(p.proposals);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(fn: () => Promise<{ ok: boolean; error?: string; note?: string }>, ok: string) {
    try {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Action failed");
        return;
      }
      toast.success(res.note ?? ok);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5" /> Agent Fleet
          </h1>
          <p className="text-sm text-muted-foreground">
            Local workers, shared task queue, learned lessons and code proposals that wait for your approval.
          </p>
        </div>
        <button className={btn} onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh
        </button>
      </header>

      {error && (
        <div className={`${card} border-destructive/50 text-sm`}>
          Fleet data unavailable — the local hub is not reachable ({error}). Start the local backend and refresh.
        </div>
      )}

      {status && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Workers online" value={`${status.workers_online} / ${status.workers_total}`} />
          <Metric label="Queued tasks" value={String(status.task_counts.queued ?? 0)} />
          <Metric label="In progress" value={String(status.task_counts.claimed ?? 0)} />
          <Metric label="Proposals awaiting you" value={String(status.pending_proposals)} />
        </div>
      )}

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold">Workers</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className={`${input} max-w-52`} placeholder="worker name" value={workerName}
            onChange={(e) => setWorkerName(e.target.value)} />
          <input className={`${input} max-w-40`} placeholder="role" value={workerRole}
            onChange={(e) => setWorkerRole(e.target.value)} />
          <button className={btn} disabled={!workerName.trim()}
            onClick={() => void act(() => registerWorker(workerName.trim(), workerRole.trim() || "general"), "Worker registered")}>
            <Plus className="h-4 w-4" /> Register
          </button>
          <button className={btn} onClick={() => void act(() => requeueStale(), "Stale tasks returned to the queue")}>
            Requeue stale
          </button>
        </div>
        {workers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workers registered yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {workers.map((w) => (
              <li key={w.name} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${w.online ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                  <span className="font-medium">{w.name}</span>
                  <span className="text-muted-foreground">{w.role} · {w.status}</span>
                </span>
                <button className="text-muted-foreground hover:text-destructive"
                  onClick={() => void act(() => removeWorker(w.name), "Worker removed")}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">Task queue</h2>
          <input className={`${input} max-w-64`} placeholder="task title" value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)} />
          <input className={`${input} max-w-40`} placeholder="role" value={taskRole}
            onChange={(e) => setTaskRole(e.target.value)} />
          <button className={btn} disabled={!taskTitle.trim()}
            onClick={() => void act(async () => {
              const res = await submitTask(taskTitle.trim(), taskRole.trim() || "general");
              setTaskTitle("");
              return res;
            }, "Task queued")}>
            <Plus className="h-4 w-4" /> Queue task
          </button>
          <button className={btn} onClick={() => void act(() => archiveRuns(), "Agent runs archived as lessons")}>
            <Archive className="h-4 w-4" /> Archive runs
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">The queue is empty.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{t.title}</span>{" "}
                  <span className="text-muted-foreground">· {t.role}{t.worker ? ` · ${t.worker}` : ""}</span>
                  {t.error && <span className="block text-xs text-destructive">{t.error}</span>}
                </span>
                <span className="text-xs uppercase text-muted-foreground">{t.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-1 text-sm font-semibold">Code upgrade proposals</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Suggestions only. Approving records your decision — applying a change stays a separate manual step.
        </p>
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No proposals recorded.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {proposals.map((p) => (
              <li key={p.id} className="py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs uppercase text-muted-foreground">{p.status} · risk {p.risk}</span>
                    {p.status === "pending" && (
                      <>
                        <button className="text-emerald-500 hover:opacity-80" title="Approve"
                          onClick={() => void act(() => decideProposal(p.id, true), "Approved")}>
                          <Check className="h-4 w-4" />
                        </button>
                        <button className="text-destructive hover:opacity-80" title="Reject"
                          onClick={() => void act(() => decideProposal(p.id, false), "Rejected")}>
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </span>
                </div>
                {p.target_path && <p className="text-xs text-muted-foreground">{p.target_path}</p>}
                {p.rationale && <p className="text-xs text-muted-foreground">{p.rationale}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {status && (
        <section className={card}>
          <h2 className="mb-2 text-sm font-semibold">Standing rules the fleet cannot override</h2>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {status.constitution.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
