/**
 * agentConsensus — runs the same task across N blueprints in parallel and
 * aggregates the answers. Enables "second-opinion" and voting patterns
 * without wiring a full multi-agent framework.
 */
import { runAgent } from "./agentRunner";
import { agentRunLog, type AgentRunRecord } from "./agentRunLog";
import type { AgentBlueprint } from "./agentBuilder";

export interface ConsensusResult {
  runs: AgentRunRecord[];
  okCount: number;
  failCount: number;
  aggregate: string;
  agreement: number; // 0..1 crude jaccard on tokens across outputs
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

export async function runConsensus(
  agents: AgentBlueprint[],
  taskInput: string,
  context = "",
): Promise<ConsensusResult> {
  const runs = await Promise.all(
    agents.map((a) => runAgent(a, { taskInput, context, source: "consensus" })),
  );
  const okRuns = runs.filter((r) => r.ok && r.output.trim().length > 0);
  // agreement — average pairwise jaccard on outputs
  let pairs = 0;
  let sum = 0;
  const sets = okRuns.map((r) => tokenSet(r.output));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  const agreement = pairs > 0 ? sum / pairs : okRuns.length > 0 ? 1 : 0;
  const aggregate = okRuns
    .map((r) => `### ${r.agentName} (${r.modelId})\n${r.output}`)
    .join("\n\n---\n\n");
  // touch log listener for UI refresh
  agentRunLog.all();
  return {
    runs,
    okCount: okRuns.length,
    failCount: runs.length - okRuns.length,
    aggregate,
    agreement,
  };
}
