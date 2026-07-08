import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Brain,
  Layers,
  KeyRound,
  Settings,
  Terminal,
  Activity,
  Bot,
  Users,
  ShieldCheck,
  Archive,
  SlidersHorizontal,
  TrendingUp,
  Code2,
  Wallet,
  Zap,
  Bird,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  to:
    | "/"
    | "/trading"
    | "/portfolio"
    | "/watchlists"
    | "/triggers"
    | "/intelligence"
    | "/strategy"
    | "/api-vault"
    | "/config"
    | "/code-studio"
    | "/terminal"
    | "/agents"
    | "/goose"
    | "/personas"
    | "/system"
    | "/backup"
    | "/settings";
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/trading", label: "Trading Hub", icon: TrendingUp },
  { to: "/portfolio", label: "Portfolio & Dividends", icon: Wallet },
  { to: "/watchlists", label: "Watchlists", icon: Layers },
  { to: "/triggers", label: "AI Triggers", icon: Zap },
  { to: "/intelligence", label: "Intelligence Hub", icon: Brain },
  { to: "/personas", label: "Personas · Meta-Agent", icon: Users },
  { to: "/agents", label: "Agent Studio", icon: Bot },
  { to: "/goose", label: "Goose Control", icon: Bird },
  { to: "/strategy", label: "Strategy Builder", icon: Layers },
  { to: "/code-studio", label: "Code Studio", icon: Code2 },
  { to: "/api-vault", label: "API Vault", icon: KeyRound },
  { to: "/config", label: "System Config", icon: Settings },
  { to: "/system", label: "System Health", icon: ShieldCheck },
  { to: "/terminal", label: "Terminal Logs", icon: Terminal },
  { to: "/backup", label: "Backup & Restore", icon: Archive },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="relative">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-[0_0_20px_-2px_var(--primary)]">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success pulse-dot" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold tracking-tight">
            AI Executive
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            OS · v1.0
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const active = item.end
            ? pathname === item.to
            : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-r-full bg-primary shadow-[0_0_12px_var(--primary)]" />
              )}
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-md border border-border bg-card/50 p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success pulse-dot" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Engine Online
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">
            Local + Cloud failover active
          </p>
        </div>
      </div>
    </aside>
  );
}
