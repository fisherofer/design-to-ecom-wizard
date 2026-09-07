/**
 * webPush.functions.ts — real Web Push (RFC 8291) delivery for Android/desktop.
 *
 * Subscriptions are stored server-side (browsers can never read them back), and
 * messages are signed with the project's VAPID key pair inside the handler.
 * Expired / unsubscribed endpoints (404/410) are deactivated automatically.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SubInput = z.object({
  ownerSession: z.string().min(8),
  endpoint: z.string().url(),
  p256dh: z.string().min(10),
  auth: z.string().min(5),
  userAgent: z.string().max(400).optional(),
  label: z.string().max(80).optional(),
});

/** Public VAPID key — safe to hand to the browser, needed to subscribe. */
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ configured: boolean; publicKey: string | null }> => {
    const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? null;
    return { configured: Boolean(publicKey), publicKey };
  },
);

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const registerPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SubInput.parse(raw))
  .handler(async ({ data }): Promise<{ ok: boolean; detail: string }> => {
    const db = await adminClient();
    const { error } = await db.from("push_subscriptions").upsert(
      {
        owner_session: data.ownerSession,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        label: data.label ?? null,
        active: true,
      },
      { onConflict: "endpoint" },
    );
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "Device registered for push." };
  });

export const unregisterPushSubscription = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ endpoint: z.string().url() }).parse(raw))
  .handler(async ({ data }): Promise<{ ok: boolean; detail: string }> => {
    const db = await adminClient();
    const { error } = await db.from("push_subscriptions").delete().eq("endpoint", data.endpoint);
    if (error) return { ok: false, detail: error.message };
    return { ok: true, detail: "Device removed." };
  });

export const listPushDevices = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ ownerSession: z.string().min(8) }).parse(raw))
  .handler(async ({ data }) => {
    const db = await adminClient();
    const { data: rows, error } = await db
      .from("push_subscriptions")
      .select("id, label, user_agent, active, last_sent_at, created_at, endpoint")
      .eq("owner_session", data.ownerSession)
      .order("created_at", { ascending: false });
    if (error) return { ok: false as const, detail: error.message, devices: [] };
    // Never return the raw endpoint URL (it is a bearer capability) — only a hint.
    const devices = (rows ?? []).map((r) => ({
      id: r.id as string,
      label: (r.label as string | null) ?? null,
      userAgent: (r.user_agent as string | null) ?? null,
      active: r.active as boolean,
      lastSentAt: (r.last_sent_at as string | null) ?? null,
      createdAt: r.created_at as string,
      endpointHint: `…${String(r.endpoint).slice(-12)}`,
    }));
    return { ok: true as const, detail: "", devices };
  });

const SendInput = z.object({
  ownerSession: z.string().min(8),
  title: z.string().min(1).max(120),
  body: z.string().max(1000).default(""),
  url: z.string().max(300).default("/alerts"),
  urgency: z.enum(["low", "normal", "high"]).default("high"),
});

export const sendPushToOwner = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => SendInput.parse(raw))
  .handler(async ({ data }): Promise<{ ok: boolean; delivered: number; failed: number; detail: string }> => {
    const subject = process.env["VAPID_SUBJECT"];
    const publicKey = process.env["VAPID_PUBLIC_KEY"];
    const privateKey = process.env["VAPID_PRIVATE_KEY"];
    if (!subject || !publicKey || !privateKey) {
      return { ok: false, delivered: 0, failed: 0, detail: "VAPID keys are not configured on the server." };
    }

    const db = await adminClient();
    const { data: rows, error } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("owner_session", data.ownerSession)
      .eq("active", true);
    if (error) return { ok: false, delivered: 0, failed: 0, detail: error.message };
    if (!rows?.length) return { ok: false, delivered: 0, failed: 0, detail: "No registered devices for this profile." };

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    let delivered = 0;
    let failed = 0;
    const notes: string[] = [];

    for (const row of rows) {
      const subscription = {
        endpoint: row.endpoint as string,
        expirationTime: null,
        keys: { p256dh: row.p256dh as string, auth: row.auth as string },
      };
      try {
        const payload = await buildPushPayload(
          {
            data: { title: data.title, body: data.body, url: data.url, tag: "ofer-alert" },
            options: { ttl: 3600, urgency: data.urgency },
          },
          subscription,
          { subject, publicKey, privateKey },
        );
        const res = await fetch(subscription.endpoint, {
          method: payload.method,
          headers: payload.headers,
          body: payload.body as BodyInit,
          signal: AbortSignal.timeout(15_000),
        });
        if (res.ok) {
          delivered += 1;
          await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).eq("id", row.id);
        } else if (res.status === 404 || res.status === 410) {
          failed += 1;
          notes.push("device expired (removed)");
          await db.from("push_subscriptions").update({ active: false }).eq("id", row.id);
        } else {
          failed += 1;
          notes.push(`HTTP ${res.status}`);
        }
      } catch (e) {
        failed += 1;
        notes.push(String(e));
      }
    }

    return {
      ok: delivered > 0,
      delivered,
      failed,
      detail: delivered > 0 ? `Delivered to ${delivered} device(s).` : notes.join("; ") || "No delivery.",
    };
  });
