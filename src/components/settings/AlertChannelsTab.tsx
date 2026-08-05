import { Bell, MessageCircle, Send, Smartphone, TestTube2, Mail, Webhook } from "lucide-react";
import { useState } from "react";
import { channels, useChannels, type ChannelKind } from "@/lib/alertChannels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NotWiredBadge } from "@/components/common/NotWiredBadge";
import { NotificationDispatcherPanel } from "@/components/settings/NotificationDispatcherPanel";

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

  async function test(id: string, label: string) {
    if (id === "push") {
      const r = await channels.testPush(label);
      setNotice(r === "ok" ? "Push sent." : r === "denied" ? "Permission denied." : "Not supported.");
      return;
    }
    setNotice(`Backend delivery for ${label} is queued once /api/alerts/send is wired.`);
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Alert Channels</h2>
        <NotWiredBadge detail="Telegram / WhatsApp delivery requires the backend /api/alerts/send endpoint. Config is saved locally in the meantime." />
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
                  <Button size="sm" variant="outline" onClick={() => test(c.id, c.label)}>
                    <TestTube2 className="h-3.5 w-3.5" /> Test
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

              {(c.kind === "email" || c.kind === "webhook") && (
                <Input
                  className="mt-3"
                  placeholder={c.kind === "email" ? "recipient@example.com" : "https://chat.googleapis.com/... or Slack webhook URL"}
                  value={c.target ?? ""}
                  onChange={(e) => channels.update(c.id, { target: e.target.value })}
                />
              )}

              {c.kind === "push" && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Uses the browser Notification API. For Android background delivery, install the site as a PWA
                  or wire a Firebase Cloud Messaging device token in the backend.
                </p>
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

