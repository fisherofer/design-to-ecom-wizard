/**
 * agentOrchestrator — fleet-level scheduling and execution for Agent Studio.
 *
 * Modes:
 *  - manual : nothing runs automatically; operator presses "Run all".
 *  - semi   : due agents create approval requests the operator confirms.
 *  - auto   : due agents run automatically on their own schedule.
 *  - ai     : an AI planner decides which agents to run each tick.
 *
 * All state lives in localStorage; the ticker is driven by the UI panel.
 */
import { runAgent } from "./agentRunner";
import { loadBlueprints, type AgentBlueprint, type Schedule } from "./agentBuilder";
import { agentRunLog, type AgentRunRecord } from "./agentRunLog";
import { chatComplete } from "./chatCompletion.functions";
import { notifications } from "./notifications";

export type OrchestratorMode = "manual" | "semi" | "auto" | "ai";

export interface OrchestratorSettings {
  mode: OrchestratorMode;
  /** how often the scheduler evaluates due agents (seconds) */
  tickSeconds: number;
  /** how many agents may run at the same time */
  maxConcurrent: number;
  /** task used for scheduled runs */
  defaultTask: string;
  /** per-agent participation in fleet runs */
  enabled: Record<string, boolean>;
  /** skip agents whose status is "paused" */
  skipPaused: boolean;
}

export interface ApprovalRequest {
  id: string;
  agentId: string;
  agentName: string;
  task: string;
  reason: string;
  createdAt: string;
}

const SETTINGS_KEY = "agents.orchestrator.v1";
const APPROVALS_KEY = "agents.orchestrator.approvals.v1";
const LASTRUN_KEY = "agents.orchestrator.lastTick.v1";
export const ORCHESTRATOR_EVENT = "ai-os:agent-orchestrator-changed";

export const DEFAULT_SETTINGS: OrchestratorSettings = {
  mode: "manual",
  tickSeconds: 60,
  maxConcurrent: 3,
  defaultTask: "Run your standard cycle and report the most actionable finding.",
  enabled: {},
  skipPaused: true,
};

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ORCHESTRATOR_EVENT));
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadSettings(): OrchestratorSettings {
  return readJson<OrchestratorSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function saveSettings(s: OrchestratorSettings) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  emit();
}

export function isAgentEnabled(s: OrchestratorSettings, a: AgentBlueprint): boolean {
  const explicit = s.enabled[a.id];
  if (typeof explicit === "boolean") return explicit;
  return !(s.skipPaused && a.status === "paused");
}

/* ---------------------------------------------------------------- approvals */

export function listApprovals(): ApprovalRequest[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(APPROVALS_KEY) ?? "[]") as ApprovalRequest[];
  } catch {
    return [];
  }
}

function writeApprovals(list: ApprovalRequest[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(APPROVALS_KEY, JSON.stringify(list.slice(0, 40)));
  emit();
}

export function requestApproval(req: Omit<ApprovalRequest, "id" | "createdAt">) {
  const list = listApprovals();
  if (list.some((r) => r.agentId === req.agentId)) return; // one pending per agent
  writeApprovals([
    { ...req, id: `apr_${Date.now().toString(36)}`, createdAt: new Date().toISOString() },
    ...list,
  ]);
}

export function dismissApproval(id: string) {
  writeApprovals(listApprovals().filter((r) => r.id !== id));
}

/* --------------------------------------------------------------- scheduling */

function cronFieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    if (range === "*") return value % step === 0;
    const [aRaw, bRaw] = range.split("-");
    const a = Number(aRaw);
    const b = bRaw ? Number(bRaw) : a;
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return value >= a && value <= b && (value - a) % step === 0;
  });
}

/** Minimal 5-field cron matcher (minute hour dom month dow). */
export function cronMatches(expr: string, d = new Date()): boolean {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return false;
  return (
    cronFieldMatches(f[0], d.getMinutes()) &&
    cronFieldMatches(f[1], d.getHours()) &&
    cronFieldMatches(f[2], d.getDate()) &&
    cronFieldMatches(f[3], d.getMonth() + 1) &&
    cronFieldMatches(f[4], d.getDay())
  );
}

export function isDue(agent: AgentBlueprint, now = Date.now()): boolean {
  const s: Schedule = agent.schedule;
  if (s.kind === "manual") return false;
  const last = agentRunLog.forAgent(agent.id)[0];
  const lastAt = last ? Date.parse(last.startedAt) : 0;
  if (s.kind === "interval") {
    const everyMs = Math.max(1, s.everyMinutes) * 60_000;
    return now - lastAt >= everyMs;
  }
  // cron — fire at most once per minute
  if (now - lastAt < 60_000) return false;
  return cronMatches(s.expr, new Date(now));
}

export function nextDueLabel(agent: AgentBlueprint): string {
  const s = agent.schedule;
  if (s.kind === "manual") return "manual only";
  if (s.kind === "cron") return `cron ${s.expr}`;
  const last = agentRunLog.forAgent(agent.id)[0];
  if (!last) return "due now";
  const nextAt = Date.parse(last.startedAt) + s.everyMinutes * 60_000;
  const mins = Math.round((nextAt - Date.now()) / 60_000);
  return mins <= 0 ? "due now" : `in ~${mins}m`;
}

/* ---------------------------------------------------------------- execution */

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export interface FleetRunResult {
  records: AgentRunRecord[];
  okCount: number;
  failCount: number;
  skipped: string[];
}

/** Run every eligible agent with the given task. */
export async function runFleet(
  agents: AgentBlueprint[],
  task: string,
  opts: { source?: AgentRunRecord["source"]; maxConcurrent?: number; settings?: OrchestratorSettings } = {},
): Promise<FleetRunResult> {
  const settings = opts.settings ?? loadSettings();
  const eligible = agents.filter((a) => isAgentEnabled(settings, a));
  const skipped = agents.filter((a) => !isAgentEnabled(settings, a)).map((a) => a.name);
  const records: AgentRunRecord[] = [];

  await pool(eligible, opts.maxConcurrent ?? settings.maxConcurrent, async (a) => {
    const rec = await runAgent(a, { taskInput: task, source: opts.source ?? "manual" });
    records.push(rec);
  });

  const okCount = records.filter((r) => r.ok).length;
  return { records, okCount, failCount: records.length - okCount, skipped };
}

/** AI planner — asks the model which agents deserve a run right now. */
async function aiSelect(agents: AgentBlueprint[], task: string): Promise<AgentBlueprint[]> {
  const roster = agents
    .map((a) => {
      const last = agentRunLog.forAgent(a.id)[0];
      return `- ${a.id} | ${a.name} | ${a.role} | last: ${last ? `${last.startedAt} ${last.ok ? "ok" : "failed"}` : "never"} | schedule: ${a.schedule.kind}`;
    })
    .join("\n");
  try {
    const res = await chatComplete({
      data: {
        mode: "auto",
        system:
          "You are a scheduling planner for an autonomous agent fleet. Choose which agents should run now. Reply with ONLY a comma-separated list of agent ids, or the word NONE.",
        temperature: 0,
        maxTokens: 200,
        messages: [
          {
            role: "user",
            content: `Task context: ${task}\nCurrent time: ${new Date().toISOString()}\nRoster:\n${roster}`,
          },
        ],
      },
    });
    const ids = (res.reply || "")
      .replace(/[^\w,\-\s]/g, " ")
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const picked = agents.filter((a) => ids.includes(a.id));
    return picked.length ? picked : [];
  } catch {
    return agents.filter((a) => isDue(a));
  }
}

/** One scheduler tick. Returns a short human summary of what happened. */
export async function tick(settings = loadSettings()): Promise<string> {
  if (settings.mode === "manual") return "manual mode — idle";
  const agents = loadBlueprints().filter((a) => isAgentEnabled(settings, a));
  if (agents.length === 0) return "no enabled agents";

  if (typeof localStorage !== "undefined") localStorage.setItem(LASTRUN_KEY, String(Date.now()));

  let due: AgentBlueprint[];
  if (settings.mode === "ai") {
    due = await aiSelect(agents, settings.defaultTask);
  } else {
    due = agents.filter((a) => isDue(a));
  }
  if (due.length === 0) return "nothing due";

  if (settings.mode === "semi") {
    for (const a of due) {
      requestApproval({
        agentId: a.id,
        agentName: a.name,
        task: settings.defaultTask,
        reason: `Schedule due (${a.schedule.kind})`,
      });
    }
    notifications.push({
      level: "info",
      title: "Approval required",
      message: `${due.length} agent(s) are due — approve to run.`,
    });
    return `${due.length} pending approval`;
  }

  const res = await runFleet(due, settings.defaultTask, {
    source: "schedule",
    settings,
  });
  notifications.push({
    level: res.failCount ? "warn" : "info",
    title: settings.mode === "ai" ? "AI scheduler ran" : "Scheduler ran",
    message: `${res.okCount}/${res.records.length} agents succeeded.`,
  });
  return `${res.okCount}/${res.records.length} ok`;
}

export function lastTickAt(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LASTRUN_KEY);
  return raw ? Number(raw) : null;
}

export const RECOMMENDED_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  apply: (s: OrchestratorSettings) => OrchestratorSettings;
}> = [
  {
    id: "market-hours",
    label: "Market hours pulse",
    description: "Auto mode, tick every minute, 3 agents in parallel — for live sessions.",
    apply: (s) => ({ ...s, mode: "auto", tickSeconds: 60, maxConcurrent: 3 }),
  },
  {
    id: "supervised",
    label: "Supervised (semi-auto)",
    description: "Due agents queue for approval instead of firing — safest for live trading.",
    apply: (s) => ({ ...s, mode: "semi", tickSeconds: 120, maxConcurrent: 2 }),
  },
  {
    id: "ai-planner",
    label: "AI planner",
    description: "A model decides each cycle which agents add value — cost-aware.",
    apply: (s) => ({ ...s, mode: "ai", tickSeconds: 300, maxConcurrent: 2 }),
  },
  {
    id: "overnight",
    label: "Overnight research",
    description: "Slow cadence, single-threaded, deep research task.",
    apply: (s) => ({
      ...s,
      mode: "auto",
      tickSeconds: 900,
      maxConcurrent: 1,
      defaultTask: "Deep-research overnight: summarize new catalysts and prep the morning brief.",
    }),
  },
];
