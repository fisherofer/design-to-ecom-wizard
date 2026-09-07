/**
 * localStore — typed client for hub/local_store_routes.py (/api/local-store).
 *
 * This is the single persistence layer for everything the system remembers on
 * the user's own machine: chats, agent runs, telemetry, preferences, treasury.
 * Two scopes are kept apart end-to-end:
 *   "user"   — personal, never redacted, never sent to a cloud model unless the
 *              user grants the 'share_with_cloud_models' consent.
 *   "system" — operational, redacted of personal identifiers by the backend.
 *
 * When the local hub is not running every call resolves to an explicit
 * unavailable result. Nothing is fabricated and nothing falls back to a
 * remote database.
 */
import { getApiBase } from "@/lib/apiConfig";

const TIMEOUT_MS = 15_000;

export type Scope = "user" | "system";

export interface PrivacySetting {
  purpose: string;
  granted: number;
  retention_days: number;
  updated_at: number;
}

export interface StoredMessage {
  id: number;
  conversation_id: string;
  scope: Scope;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  runtime: string | null;
  latency_ms: number | null;
  created_at: number;
}

export interface StoredConversation {
  id: string;
  scope: Scope;
  channel: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
}

export interface StoreStats {
  ok: boolean;
  db: string;
  size_bytes: number;
  user: { conversations: number; messages: number; preferences: number };
  system: { agent_runs: number; events: number; settings: number; ledger_entries: number };
}

export interface LedgerEntry {
  id: number;
  source: string;
  currency: string;
  amount: number;
  note: string | null;
  evidence_url: string | null;
  created_at: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/local-store${path}`, {
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

/** True when the local venv database is reachable. */
export async function storeAvailable(): Promise<boolean> {
  try {
    await call<StoreStats>("/stats");
    return true;
  } catch {
    return false;
  }
}

export async function getStats(): Promise<StoreStats | { ok: false; error: string }> {
  try {
    return await call<StoreStats>("/stats");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------- privacy
export async function getPrivacy(): Promise<{ ok: boolean; settings: PrivacySetting[]; db?: string; error?: string }> {
  try {
    return await call<{ ok: boolean; settings: PrivacySetting[]; db: string }>("/privacy");
  } catch (e) {
    return { ok: false, settings: [], error: (e as Error).message };
  }
}

export async function setPrivacy(purpose: string, patch: { granted?: boolean; retention_days?: number }) {
  return call<{ ok: boolean }>("/privacy", {
    method: "POST",
    body: JSON.stringify({ purpose, ...patch }),
  });
}

export const purgeExpired = () => call<{ ok: boolean; deleted: Record<string, number> }>("/privacy/purge", { method: "POST" });
export const exportUserData = () => call<Record<string, unknown>>("/privacy/export");
export const eraseUserData = () => call<{ ok: boolean; deleted: Record<string, number> }>("/privacy/erase", { method: "POST" });

// ---------------------------------------------------------- conversations
export async function listConversations(scope?: Scope, limit = 50): Promise<StoredConversation[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (scope) q.set("scope", scope);
  try {
    const res = await call<{ conversations: StoredConversation[] }>(`/conversations?${q.toString()}`);
    return res.conversations;
  } catch {
    return [];
  }
}

export async function getMessages(conversationId: string, limit = 200): Promise<StoredMessage[]> {
  try {
    const res = await call<{ messages: StoredMessage[] }>(
      `/conversations/${encodeURIComponent(conversationId)}?limit=${limit}`,
    );
    return res.messages;
  } catch {
    return [];
  }
}

export interface AddMessageInput {
  conversationId: string;
  role: StoredMessage["role"];
  content: string;
  scope?: Scope;
  channel?: string;
  model?: string;
  runtime?: string;
  latencyMs?: number;
}

/** Persist a chat turn. Returns the failure reason instead of throwing. */
export async function addMessage(input: AddMessageInput): Promise<{ ok: boolean; error?: string }> {
  try {
    return await call<{ ok: boolean }>("/messages", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        scope: input.scope ?? "user",
        channel: input.channel ?? "app",
        model: input.model ?? null,
        runtime: input.runtime ?? null,
        latency_ms: input.latencyMs ?? null,
      }),
    });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteConversation(conversationId: string) {
  return call<{ ok: boolean }>(`/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
}

// --------------------------------------------------------------- system
export interface AgentRunInput {
  id?: string;
  agent: string;
  task?: string;
  output?: string;
  model?: string;
  runtime?: string;
  ok: boolean;
  error?: string;
  durationMs?: number;
}

/** Mirror an agent run into the local database (best effort, never throws). */
export async function logAgentRun(run: AgentRunInput): Promise<boolean> {
  try {
    await call("/agent-runs", {
      method: "POST",
      body: JSON.stringify({
        id: run.id ?? null,
        agent: run.agent,
        task: run.task ?? null,
        output: run.output ?? null,
        model: run.model ?? null,
        runtime: run.runtime ?? null,
        ok: run.ok,
        error: run.error ?? null,
        duration_ms: run.durationMs ?? null,
      }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function logEvent(kind: string, message: string, severity: "info" | "warn" | "critical" = "info", details?: Record<string, unknown>) {
  try {
    await call("/events", { method: "POST", body: JSON.stringify({ kind, message, severity, details: details ?? {} }) });
    return true;
  } catch {
    return false;
  }
}

export async function kvSet(scope: Scope, key: string, value: unknown) {
  return call<{ ok: boolean }>("/kv", { method: "POST", body: JSON.stringify({ scope, key, value }) });
}

export async function kvGet<T>(scope: Scope, key: string): Promise<T | null> {
  try {
    const res = await call<{ found: boolean; value: T }>(`/kv/${scope}/${encodeURIComponent(key)}`);
    return res.found ? res.value : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------- treasury
export async function getLedger(limit = 200): Promise<{
  ok: boolean;
  entries: LedgerEntry[];
  totals_by_source: Record<string, number>;
  net_total: number;
  error?: string;
}> {
  try {
    return await call("/treasury?limit=" + limit);
  } catch (e) {
    return { ok: false, entries: [], totals_by_source: {}, net_total: 0, error: (e as Error).message };
  }
}
