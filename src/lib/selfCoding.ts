/**
 * selfCoding.ts — Self-modification engine with guardrails.
 *
 * Pipeline: Proposal → Lint/Safety → Sandbox preview → User approval (or auto if safe)
 *           → Apply → Health check → Rollback if regression.
 *
 * Pure logic only; the actual file I/O happens via /api/system/apply (mock today,
 * real GitHub commit when wired up via the GitHub tab).
 */

export type ChangeKind = "create" | "modify" | "delete";
export type SafetyLevel = "safe" | "review" | "danger";

export interface FileChange {
  path: string;
  kind: ChangeKind;
  before?: string;
  after?: string;
}

export interface ChangeProposal {
  id: string;
  ts: string;
  title: string;
  rationale: string;
  author: "ai" | "user";
  changes: FileChange[];
}

export interface SafetyReport {
  level: SafetyLevel;
  reasons: string[];
  blockers: string[];
}

export interface ApplyResult {
  ok: boolean;
  proposalId: string;
  appliedAt: string;
  healthOk: boolean;
  rolledBack: boolean;
  log: string[];
}

const DANGER_PATHS = [/^src\/router\.tsx$/, /^src\/routes\/__root\.tsx$/, /package\.json$/];
const REVIEW_PATHS = [/^src\/lib\//, /^src\/components\/layout\//];

export function analyzeSafety(p: ChangeProposal): SafetyReport {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let level: SafetyLevel = "safe";

  for (const c of p.changes) {
    if (DANGER_PATHS.some((re) => re.test(c.path))) {
      level = "danger";
      blockers.push(`Touches critical infra: ${c.path}`);
    } else if (REVIEW_PATHS.some((re) => re.test(c.path)) && level !== "danger") {
      level = "review";
      reasons.push(`Touches shared module: ${c.path}`);
    }

    if (c.kind === "delete") {
      if (level === "safe") level = "review";
      reasons.push(`Deletion proposed: ${c.path}`);
    }

    if (c.after && /process\.env\.|delete\s+from|drop\s+table/i.test(c.after)) {
      level = "danger";
      blockers.push(`Suspicious operation in ${c.path}`);
    }
  }

  if (p.changes.length > 12 && level === "safe") {
    level = "review";
    reasons.push(`Large changeset (${p.changes.length} files)`);
  }

  return { level, reasons, blockers };
}

export function diffSummary(c: FileChange): { added: number; removed: number } {
  const before = (c.before || "").split("\n");
  const after = (c.after || "").split("\n");
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  let added = 0;
  let removed = 0;
  for (const l of after) if (!beforeSet.has(l)) added++;
  for (const l of before) if (!afterSet.has(l)) removed++;
  return { added, removed };
}

const HISTORY_KEY = "selfcoding.history";

export function loadHistory(): ApplyResult[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordHistory(r: ApplyResult) {
  if (typeof localStorage === "undefined") return;
  const all = [r, ...loadHistory()].slice(0, 100);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
}

/**
 * Mock apply: in production this calls the server route which commits via GitHub PAT.
 * Here we simulate the safety pipeline + health check + rollback flow.
 */
export async function applyProposal(
  p: ChangeProposal,
  opts: { autoApprove?: boolean } = {},
): Promise<ApplyResult> {
  const log: string[] = [];
  const safety = analyzeSafety(p);
  log.push(`[safety] level=${safety.level}`);

  if (safety.blockers.length && !opts.autoApprove) {
    const r: ApplyResult = {
      ok: false,
      proposalId: p.id,
      appliedAt: new Date().toISOString(),
      healthOk: false,
      rolledBack: false,
      log: [...log, ...safety.blockers.map((b) => `[blocked] ${b}`)],
    };
    recordHistory(r);
    return r;
  }

  log.push(`[apply] ${p.changes.length} file(s)`);
  await new Promise((r) => setTimeout(r, 400));

  // Simulated health check — fails ~10% of the time
  const healthOk = Math.random() > 0.1;
  log.push(`[health] ${healthOk ? "OK" : "FAIL"}`);

  const rolledBack = !healthOk;
  if (rolledBack) log.push(`[rollback] restored previous snapshot`);

  const r: ApplyResult = {
    ok: healthOk,
    proposalId: p.id,
    appliedAt: new Date().toISOString(),
    healthOk,
    rolledBack,
    log,
  };
  recordHistory(r);
  return r;
}

export function makeProposal(partial: Omit<ChangeProposal, "id" | "ts">): ChangeProposal {
  return {
    id: `prop_${Date.now().toString(36)}`,
    ts: new Date().toISOString(),
    ...partial,
  };
}
