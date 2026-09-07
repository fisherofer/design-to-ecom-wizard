/**
 * relay.functions.ts — real outbound delivery for alert channels.
 *
 * Telegram uses the server-side TELEGRAM_BOT_TOKEN secret (never exposed to
 * the browser). Webhook delivery is proxied server-side so the browser is not
 * blocked by CORS and so we can refuse private/loopback targets (SSRF guard).
 *
 * Nothing here fabricates success: if the token is missing or the provider
 * rejects the call, the result carries ok:false and the provider's message.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface RelayResult {
  ok: boolean;
  detail: string;
  providerId?: string;
}

const TelegramInput = z.object({
  chatId: z.string().trim().min(1, "chat_id is required"),
  subject: z.string().trim().min(1),
  body: z.string().default(""),
  silent: z.boolean().default(false),
});

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Report whether the bot token is configured, and who the bot is. */
export const telegramStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; botUsername?: string; detail: string }> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) return { configured: false, detail: "TELEGRAM_BOT_TOKEN is not set on the server." };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { ok?: boolean; result?: { username?: string }; description?: string };
      if (!json.ok) return { configured: true, detail: json.description ?? "Telegram rejected the token." };
      return { configured: true, botUsername: json.result?.username, detail: "Bot token valid." };
    } catch (e) {
      return { configured: true, detail: `Telegram unreachable: ${String(e)}` };
    }
  },
);

/** Send a real Telegram message through the project's bot. */
export const sendTelegram = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => TelegramInput.parse(raw))
  .handler(async ({ data }): Promise<RelayResult> => {
    const token = process.env["TELEGRAM_BOT_TOKEN"];
    if (!token) return { ok: false, detail: "TELEGRAM_BOT_TOKEN is not set on the server." };

    const text = `<b>${esc(data.subject)}</b>\n<pre>${esc(data.body)}</pre>`;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: data.chatId,
          text: text.slice(0, 4000),
          parse_mode: "HTML",
          disable_notification: data.silent,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        description?: string;
        result?: { message_id?: number };
      };
      if (!json.ok) return { ok: false, detail: json.description ?? `HTTP ${res.status}` };
      return { ok: true, detail: "Delivered to Telegram.", providerId: String(json.result?.message_id ?? "") };
    } catch (e) {
      return { ok: false, detail: `Telegram request failed: ${String(e)}` };
    }
  });

const WebhookInput = z.object({
  url: z.string().url(),
  subject: z.string().trim().min(1),
  body: z.string().default(""),
});

const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;

/** Proxy a Slack / Google Chat / generic webhook post, with an SSRF guard. */
export const sendWebhookRelay = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => WebhookInput.parse(raw))
  .handler(async ({ data }): Promise<RelayResult> => {
    let target: URL;
    try {
      target = new URL(data.url);
    } catch {
      return { ok: false, detail: "Invalid webhook URL." };
    }
    if (target.protocol !== "https:") return { ok: false, detail: "Webhook must use https." };
    if (BLOCKED_HOST.test(target.hostname)) return { ok: false, detail: "Private / loopback webhook targets are refused." };

    const text = `*${data.subject}*\n${data.body}`;
    try {
      const res = await fetch(target.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Slack uses `text`, Google Chat uses `text` too; Discord accepts `content`.
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, detail: `Webhook returned HTTP ${res.status}` };
      return { ok: true, detail: "Webhook delivered." };
    } catch (e) {
      return { ok: false, detail: `Webhook request failed: ${String(e)}` };
    }
  });
