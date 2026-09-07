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

/* ------------------------------------------------------------------ *
 * Email relay (Resend)
 * ------------------------------------------------------------------ */

const EmailInput = z.object({
  to: z.string().email(),
  subject: z.string().trim().min(1),
  body: z.string().default(""),
});

/** Report whether an email provider is configured on the server. */
export const emailStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; from?: string; detail: string }> => {
    const key = process.env["RESEND_API_KEY"];
    if (!key) return { configured: false, detail: "RESEND_API_KEY is not set on the server." };
    const from = process.env["RESEND_FROM"] ?? "";
    if (!from) return { configured: false, detail: "RESEND_FROM (verified sender address) is not set." };
    return { configured: true, from, detail: "Email relay ready." };
  },
);

/** Send a real email through Resend. */
export const sendEmailRelay = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => EmailInput.parse(raw))
  .handler(async ({ data }): Promise<RelayResult> => {
    const key = process.env["RESEND_API_KEY"];
    const from = process.env["RESEND_FROM"];
    if (!key) return { ok: false, detail: "RESEND_API_KEY is not set on the server." };
    if (!from) return { ok: false, detail: "RESEND_FROM (verified sender address) is not set." };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to: [data.to],
          subject: data.subject,
          text: data.body,
          html: `<h3>${esc(data.subject)}</h3><pre style="font:13px/1.5 monospace">${esc(data.body)}</pre>`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, detail: json.message ?? `Resend returned HTTP ${res.status}` };
      return { ok: true, detail: `Email delivered to ${data.to}.`, providerId: json.id };
    } catch (e) {
      return { ok: false, detail: `Email request failed: ${String(e)}` };
    }
  });

/* ------------------------------------------------------------------ *
 * WhatsApp relay (Meta Cloud API, Twilio fallback)
 * ------------------------------------------------------------------ */

const WhatsAppInput = z.object({
  to: z.string().trim().min(6),
  subject: z.string().trim().min(1),
  body: z.string().default(""),
});

const digits = (s: string) => s.replace(/[^\d]/g, "");

/** Report which WhatsApp provider (if any) is configured. */
export const whatsappStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; provider?: string; detail: string }> => {
    if (process.env["WHATSAPP_TOKEN"] && process.env["WHATSAPP_PHONE_NUMBER_ID"])
      return { configured: true, provider: "meta", detail: "Meta WhatsApp Cloud API ready." };
    if (process.env["TWILIO_ACCOUNT_SID"] && process.env["TWILIO_AUTH_TOKEN"] && process.env["TWILIO_WHATSAPP_FROM"])
      return { configured: true, provider: "twilio", detail: "Twilio WhatsApp ready." };
    return {
      configured: false,
      detail:
        "Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID (Meta Cloud API) or TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM.",
    };
  },
);

/** Send a real WhatsApp message. */
export const sendWhatsAppRelay = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => WhatsAppInput.parse(raw))
  .handler(async ({ data }): Promise<RelayResult> => {
    const text = `*${data.subject}*\n${data.body}`.slice(0, 4000);
    const to = digits(data.to);
    if (!to) return { ok: false, detail: "Recipient must be a phone number in international format." };

    const metaToken = process.env["WHATSAPP_TOKEN"];
    const metaPhoneId = process.env["WHATSAPP_PHONE_NUMBER_ID"];
    if (metaToken && metaPhoneId) {
      try {
        const res = await fetch(`https://graph.facebook.com/v20.0/${metaPhoneId}/messages`, {
          method: "POST",
          headers: { authorization: `Bearer ${metaToken}`, "content-type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
          signal: AbortSignal.timeout(15_000),
        });
        const json = (await res.json().catch(() => ({}))) as {
          messages?: { id?: string }[];
          error?: { message?: string };
        };
        if (!res.ok) return { ok: false, detail: json.error?.message ?? `Meta returned HTTP ${res.status}` };
        return { ok: true, detail: "WhatsApp delivered (Meta Cloud API).", providerId: json.messages?.[0]?.id };
      } catch (e) {
        return { ok: false, detail: `WhatsApp request failed: ${String(e)}` };
      }
    }

    const sid = process.env["TWILIO_ACCOUNT_SID"];
    const authToken = process.env["TWILIO_AUTH_TOKEN"];
    const from = process.env["TWILIO_WHATSAPP_FROM"];
    if (sid && authToken && from) {
      try {
        const form = new URLSearchParams({
          From: `whatsapp:${from.startsWith("+") ? from : `+${digits(from)}`}`,
          To: `whatsapp:+${to}`,
          Body: text,
        });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            authorization: `Basic ${btoa(`${sid}:${authToken}`)}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(15_000),
        });
        const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
        if (!res.ok) return { ok: false, detail: json.message ?? `Twilio returned HTTP ${res.status}` };
        return { ok: true, detail: "WhatsApp delivered (Twilio).", providerId: json.sid };
      } catch (e) {
        return { ok: false, detail: `WhatsApp request failed: ${String(e)}` };
      }
    }

    return {
      ok: false,
      detail:
        "No WhatsApp provider configured. Set WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID, or the three TWILIO_* variables.",
    };
  });
