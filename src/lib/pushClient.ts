/**
 * pushClient.ts — browser side of Android/desktop push.
 *
 * Registers the service worker, subscribes with the server's VAPID public key
 * and stores the subscription server-side. All browser API access happens
 * inside functions (never at module scope) so SSR stays clean.
 */
import { getSyncSession } from "@/lib/cloudSync";
import {
  getVapidPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
  sendPushToOwner,
} from "@/lib/webPush.functions";

export interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  endpointHint: string | null;
  detail: string;
}

function b64ToUint8(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function ensureRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) {
    return { supported: false, permission: "unsupported", subscribed: false, endpointHint: null, detail: "This browser has no Push API." };
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: Boolean(sub),
      endpointHint: sub ? `…${sub.endpoint.slice(-12)}` : null,
      detail: sub ? "This device is registered." : "This device is not registered yet.",
    };
  } catch (e) {
    return { supported: true, permission: Notification.permission, subscribed: false, endpointHint: null, detail: String(e) };
  }
}

export async function enablePush(label?: string): Promise<{ ok: boolean; detail: string }> {
  if (!pushSupported()) return { ok: false, detail: "Push is not supported in this browser." };

  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, detail: "Notification permission was denied." };

  const vapid = await getVapidPublicKey();
  if (!vapid.configured || !vapid.publicKey) return { ok: false, detail: "Server push keys are not configured." };

  try {
    const reg = await ensureRegistration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToUint8(vapid.publicKey) as BufferSource,
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, detail: "Browser returned an incomplete subscription." };
    }
    return await registerPushSubscription({
      data: {
        ownerSession: getSyncSession(),
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 400),
        label: label ?? "This device",
      },
    });
  } catch (e) {
    return { ok: false, detail: `Subscription failed: ${String(e)}` };
  }
}

export async function disablePush(): Promise<{ ok: boolean; detail: string }> {
  if (!pushSupported()) return { ok: false, detail: "Push is not supported." };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return { ok: true, detail: "Device was not registered." };
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return await unregisterPushSubscription({ data: { endpoint } });
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

/** Deliver a background push to every registered device of this profile. */
export async function pushToAllDevices(title: string, body: string, url = "/alerts") {
  return sendPushToOwner({ data: { ownerSession: getSyncSession(), title, body, url, urgency: "high" } });
}
