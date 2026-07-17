/**
 * agentRunLog — persistent, per-agent run history (localStorage).
 * Captures compiled prompts, output, duration, model, tokens (best-effort),
 * and error state so the Agent Builder can show a real audit trail instead
 * of static "successRate" numbers.
 */
export interface AgentRunRecord {
  id: string;
  agentId: string;
  agentName: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  taskInput: string;
  output: string;
  ok: boolean;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  source: "manual" | "schedule" | "consensus";
}

const KEY = "agents.runLog.v1";
const EVENT = "ai-os:agent-run-log-changed";
const MAX_PER_AGENT = 50;

function read(): AgentRunRecord[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AgentRunRecord[]) : [];
  } catch {
    return [];
  }
}
function write(list: AgentRunRecord[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export const agentRunLog = {
  EVENT,
  all(): AgentRunRecord[] {
    return read().sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  },
  forAgent(agentId: string): AgentRunRecord[] {
    return this.all().filter((r) => r.agentId === agentId);
  },
  append(rec: AgentRunRecord) {
    const all = read();
    all.push(rec);
    // trim per-agent
    const byAgent = new Map<string, AgentRunRecord[]>();
    for (const r of all) {
      const arr = byAgent.get(r.agentId) ?? [];
      arr.push(r);
      byAgent.set(r.agentId, arr);
    }
    const trimmed: AgentRunRecord[] = [];
    for (const arr of byAgent.values()) {
      arr.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
      trimmed.push(...arr.slice(0, MAX_PER_AGENT));
    }
    write(trimmed);
  },
  clear(agentId?: string) {
    if (!agentId) return write([]);
    write(read().filter((r) => r.agentId !== agentId));
  },
  successRate(agentId: string): number {
    const runs = this.forAgent(agentId);
    if (runs.length === 0) return 0;
    const ok = runs.filter((r) => r.ok).length;
    return ok / runs.length;
  },
};
