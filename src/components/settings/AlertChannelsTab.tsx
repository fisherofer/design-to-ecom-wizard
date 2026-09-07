import { Bell, MessageCircle, Send, Smartphone, TestTube2, Mail, Webhook, ShieldCheck, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { channels, useChannels, type ChannelKind } from "@/lib/alertChannels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NotificationDispatcherPanel } from "@/components/settings/NotificationDispatcherPanel";
import { sendTelegram, sendWebhookRelay, telegramStatus } from "@/lib/relay.functions";
import { disablePush, enablePush, pushState, pushToAllDevices, type PushState } from "@/lib/pushClient";

const ICON: Record<ChannelKind, typeof Bell> = {
  bell: Bell,
  telegram: Send,
  whatsapp: MessageCircle,
  push: Smartphone,
  email: Mail,
  webhook: Webhook,
};

export function AlertChannelsTab() {
  const list = useChannels();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [tg, setTg] = useState<{ configured: boolean; botUsername?: string; detail: string } | null>(null);
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    void telegramStatus().then(setTg).catch(() => setTg(null));
    void pushState().then(setPush);
  }, []);

  async function refreshPush() {
    setPush(await pushState());
  }

  async function test(id: string, label: string) {
    const ch = list.find((c) => c.id === id);
    setBusy(id);
    setNotice("");
    try {
      if (id === "push") {
        const r = await pushToAllDevices("AI Executive OS", `Test push · ${label}`, "/alerts");
        setNotice(r.ok ? `${r.detail}` : `Push failed: ${r.detail}`);
        return;
      }
      if (ch?.kind === "telegram") {
        if (!ch.target) return setNotice("Enter your Telegram chat_id first.");
        const r = await sendTelegram({
          data: { chatId: ch.target, subject: "AI Executive OS · test alert", body: "Telegram relay is live.", silent: false },
        });
        return setNotice(r.detail);
      }
      if (ch?.kind === "webhook") {
        if (!ch.target) return setNotice("Enter the webhook URL first.");
        const r = await sendWebhookRelay({
          data: { url: ch.target, subject: "AI Executive OS · test alert", body: "Webhook relay is live." },
        });
        return setNotice(r.detail);
      }
      if (ch?.kind === "bell") {
        return setNotice("In-app bell always delivers locally.");
      }
      setNotice(`${label}: relay not wired yet — config is saved locally.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Alert Channels</h2>
        {tg && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase ${
              tg.configured && tg.botUsername
                ? "border-success/40 bg-success/10 text-success"
                : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            {tg.configured && tg.botUsername ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            {tg.botUsername ? `@${tg.botUsername}` : "telegram token"}
          </span>
        )}
      </header>

      <div className="grid gap-3">
        {list.map((c) => {
          const Icon = ICON[c.kind];
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-semibold">{c.label}</div>
                    <div className="font-mono text-[10px] uppercase text-muted-foreground">{c.kind}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={c.enabled} onCheckedChange={(v) => channels.update(c.id, { enabled: v })} />
                  <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => test(c.id, c.label)}>
                    <TestTube2 className="h-3.5 w-3.5" /> {busy === c.id ? "Sending…" : "Test"}
                  </Button>
                </div>
              </div>

              {(c.kind === "telegram" || c.kind === "whatsapp") && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
                  <Input
                    placeholder={c.kind === "telegram" ? "chat_id (e.g. 123456789)" : "recipient phone (E.164)"}
                    value={c.target ?? ""}
                    onChange={(e) => channels.update(c.id, { target: e.target.value })}
                  />
                  {c.kind === "telegram" && (
                    <Input
                      placeholder="Bot name (optional)"
                      value={c.meta?.botName ?? ""}
                      onChange={(e) => channels.update(c.id, { meta: { ...c.meta, botName: e.target.value } })}
                    />
                  )}
                  {c.kind === "whatsapp" && (
                    <Input
                      placeholder="Phone Number ID"
                      value={c.meta?.phoneNumberId ?? ""}
                      onChange={(e) => channels.update(c.id, { meta: { ...c.meta, phoneNumberId: e.target.value } })}
                    />
                  )}
                </div>
              )}

              {c.kind === "telegram" && tg && (
                <p className="mt-2 text-xs text-muted-foreground">{tg.detail}</p>
              )}

              {(c.kind === "email" || c.kind === "webhook") && (
                <Input
                  className="mt-3"
                  placeholder={c.kind === "email" ? "recipient@example.com" : "https://chat.googleapis.com/... or Slack webhook URL"}
                  value={c.target ?? ""}
                  onChange={(e) => channels.update(c.id, { target: e.target.value })}
                />
              )}

              {c.kind === "push" && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Background Web Push (VAPID). Install the app to your Android home screen, then register this device —
                    alerts arrive with the app closed.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={busy === "push-reg"}
                      onClick={async () => {
                        setBusy("push-reg");
                        const r = await enablePush();
                        setNotice(r.detail);
                        await refreshPush();
                        setBusy(null);
                      }}
                    >
                      Register this device
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === "push-unreg"}
                      onClick={async () => {
                        setBusy("push-unreg");
                        const r = await disablePush();
                        setNotice(r.detail);
                        await refreshPush();
                        setBusy(null);
                      }}
                    >
                      Remove device
                    </Button>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {push
                        ? push.supported
                          ? `${push.subscribed ? "registered" : "not registered"} · ${push.permission}${push.endpointHint ? ` · ${push.endpointHint}` : ""}`
                          : "unsupported browser"
                        : "checking…"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {notice && <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs text-info">{notice}</div>}

      <NotificationDispatcherPanel />
    </div>
  );
}
