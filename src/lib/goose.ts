/**
 * @deprecated Vendor-specific alias kept for backwards compatibility.
 * The generic implementation now lives in `src/lib/agentRuntime.ts`.
 * New code should import from `@/lib/agentRuntime`.
 */
import {
  DEFAULT_RUNTIME_TOOLS,
  createUnprobedRuntimeStatus,
  type AgentRuntimeStatus,
  type RuntimeCheckState,
  type RuntimeTool,
  type RuntimeVerification,
  type RuntimeVerificationCheck,
} from "@/lib/agentRuntime";

export { auditExternalInstructions } from "@/lib/agentRuntime";
export type { InstructionAudit, InstructionFinding } from "@/lib/agentRuntime";

export type GooseCheckState = RuntimeCheckState;
export type GooseTool = RuntimeTool;
export type GooseStatus = AgentRuntimeStatus;
export type GooseVerificationCheck = RuntimeVerificationCheck;
export type GooseVerification = RuntimeVerification;

/** Placeholder status until a live runtime probe succeeds. */
export const MOCK_GOOSE_STATUS: GooseStatus = createUnprobedRuntimeStatus(
  "Goose",
  "http://localhost:8050/api/goose",
  DEFAULT_RUNTIME_TOOLS,
);
