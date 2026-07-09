import { Bell, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle2, AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { notifications, useNotifications, type NotificationLevel } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const ICONS: Record<NotificationLevel, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  critical: AlertCircle,
};

const COLORS: Record<NotificationLevel, string> = {
  info: "text-primary",
  success: "text-success",
  warn: "text-warning",
  critical: "text-destructive",
};

function relative(ts: string) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function NotificationsBell() {
  const list = useNotifications();
  const unread = list.filter((n) => !n.read).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative bg-card/50" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground ring-2 ring-background">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h4 className="font-display text-sm font-semibold">Notifications</h4>
            <p className="text-[11px] font-mono text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "All caught up"}
            </p>
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => notifications.markAllRead()} title="Mark all read">
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => notifications.clear()} title="Clear all">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <ScrollArea className="max-h-[380px]">
          {list.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground font-mono">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {list.map((n) => {
                const Icon = ICONS[n.level];
                const body = (
                  <div className="flex gap-3 px-4 py-3 hover:bg-card/40 transition-colors">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", COLORS[n.level])} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cn("text-sm font-semibold truncate", !n.read && "text-foreground", n.read && "text-muted-foreground")}>
                          {n.title}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{relative(n.ts)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                    </div>
                    {!n.read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </div>
                );
                return (
                  <li key={n.id} onClick={() => notifications.markRead(n.id)}>
                    {n.href ? <Link to={n.href}>{body}</Link> : body}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
