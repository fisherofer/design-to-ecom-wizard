/**
 * fleet — typed client for /api/fleet on the local hub.
 *
 * Workers register and heartbeat, tasks move queued → claimed → done/failed,
 * agent runs are digested into durable lessons, and code upgrade proposals wait
 * for the owner's approval. Nothing here applies a code change.
 *
 * When the local hub is down every call surfaces the failure — no invented data.
 */
import { getApiBase } from "@/lib/apiConfig";

const TIMEOUT_MS = 30_000;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/fleet${path}`, {
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...init,
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (body as { detail?: { error?: string } })?.detail?.error;
      throw new Error(detail ?? `HTTP ${res.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

const post = <T,>(path: string, body?: unknown) =>
  call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export interface FleetWorker {
  name: string;
  role: string;
  capabilities: string[];
  note: string | null;
  status: string;
  registered_at: number;
  last_seen: number;
  online: boolean;
}

export interface FleetTask {
  id: number;
  title: string;
  role: string;
  spec: unknown;
  status: "queued" | "claimed" | "done" | "failed";
  worker: string | null;
  result: unknown;
  error: string | null;
  priority: number;
  created_at: number;
  updated_at: number;
}

export interface CodeProposal {
  id: number;
  title: string;
  target_path: string | null;
  rationale: string;
  patch: string;
  risk: string;
  source: string | null;
  status: "pending" | "approved" | "rejected";
  decided_at: number | null;
  created_at: number;
}

export interface FleetStatus {
  ok: boolean;
  workers_online: number;
  workers_total: number;
  task_counts: Record<string, number>;
  pending_proposals: number;
  constitution: string[];
}

export const fleetStatus = () => call<FleetStatus>("/status");
export const listWorkers = () => call<{ ok: boolean; workers: FleetWorker[]; online: number; total: number }>("/workers");
export const registerWorker = (name: string, role = "general", capabilities: string[] = [], note?: string) =>
  post<{ ok: boolean; name: string }>("/workers", { name, role, capabilities, note });
export const removeWorker = (name: string) =>
  call<{ ok: boolean }>(`/workers/${encodeURIComponent(name)}`, { method: "DELETE" });
export const heartbeat = (name: string, status = "idle") =>
  post<{ ok: boolean; error?: string }>("/heartbeat", { name, status });

export const listTasks = (status?: string, limit = 100) =>
  call<{ ok: boolean; tasks: FleetTask[]; counts: Record<string, number> }>(
    `/tasks?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
  );
export const submitTask = (title: string, role = "general", spec?: Record<string, unknown>, priority = 5) =>
  post<{ ok: boolean; id: number; status: string }>("/tasks", { title, role, spec, priority });
export const claimTask = (worker: string, role?: string) =>
  post<{ ok: boolean; task: FleetTask | null; note?: string; error?: string }>("/claim", { worker, role });
export const completeTask = (task_id: number, worker: string, result?: unknown, error?: string) =>
  post<{ ok: boolean; status?: string; error?: string }>("/complete", { task_id, worker, result, error });
export const requeueStale = () => post<{ ok: boolean; requeued: number }>("/requeue-stale");
export const archiveRuns = (limit = 200) =>
  post<{ ok: boolean; written: number; agents?: number; note?: string }>(`/archive-runs?limit=${limit}`);

export const listProposals = (status?: string) =>
  call<{ ok: boolean; proposals: CodeProposal[] }>(`/proposals${status ? `?status=${encodeURIComponent(status)}` : ""}`);
export const proposeCode = (input: {
  title: string;
  rationale?: string;
  target_path?: string;
  patch?: string;
  risk?: string;
  source?: string;
}) => post<{ ok: boolean; id: number; status: string; note: string }>("/proposals", input);
export const decideProposal = (id: number, approve: boolean) =>
  post<{ ok: boolean; status?: string; note?: string; error?: string }>(
    `/proposals/${id}/decide?approve=${approve ? "true" : "false"}`,
  );
