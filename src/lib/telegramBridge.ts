/**
 * telegramBridge — client for hub/telegram_routes.py (/api/telegram).
 *
 * The bridge itself runs on the user's machine and long-polls Telegram, so the
 * phone talks to the LOCAL model with no inbound ports and no cloud relay.
 * The bot token never comes back to the browser.
 */
import { getApiBase } from "@/lib/apiConfig";

const TIMEOUT_MS = 20_000;

export interface BridgeStatus {
  ok: boolean;
  running: boolean;
  started_at: number | null;
  messages_in: number;
  messages_out: number;
  allowed_chat_ids: number[];
  model: string | null;
  last_error: string | null;
  consent_telegram: boolean;
  consent_history: boolean;
  token_saved: boolean;
  unavailable?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiBase()}/api/telegram${path}`, {
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

export async function bridgeStatus(): Promise<BridgeStatus> {
  try {
    return await call<BridgeStatus>("/status");
  } catch (e) {
    return {
      ok: false, running: false, started_at: null, messages_in: 0, messages_out: 0,
      allowed_chat_ids: [], model: null, last_error: null,
      consent_telegram: false, consent_history: false, token_saved: false,
      unavailable: (e as Error).message,
    };
  }
}

export async function startBridge(input: { token?: string; allowedChatIds?: number[]; model?: string }) {
  try {
    const res = await call<{ ok: boolean; bot?: string }>("/start", {
      method: "POST",
      body: JSON.stringify({
        token: input.token ?? null,
        allowed_chat_ids: input.allowedChatIds ?? [],
        model: input.model ?? null,
        remember_token: true,
      }),
    });
    return { ok: true, bot: res.bot };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function stopBridge() {
  try {
    await call("/stop", { method: "POST" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function forgetToken() {
  try {
    await call("/token", { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
