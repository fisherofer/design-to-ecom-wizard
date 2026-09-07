import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Layers3,
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
  BellRing,
  GitBranch,
  Ticket,
  LineChart,
  NotebookPen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isTradingRoute, useTradingEnabled } from "@/lib/tradingMode";

type NavTo =
  | "/"
  | "/command"
  | "/trading"
  | "/microstructure"
  | "/portfolio"
  | "/watchlists"
  | "/triggers"
  | "/alerts"
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
  | "/repo-analyzer"
  | "/live-trading"
  | "/order-ticket"
  | "/backtesting"
  | "/journal"
  | "/security"
  | "/settings";

type NavItem = {
  to: NavTo;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/command", label: "Quant Command", icon: Activity },
    ],
  },
  {
    label: "Trading",
    items: [
      { to: "/trading", label: "Trading Hub", icon: TrendingUp },
      { to: "/live-trading", label: "Live Trading Loop", icon: Activity },
      { to: "/order-ticket", label: "Order Ticket", icon: Ticket },
      { to: "/backtesting", label: "Backtesting Lab", icon: LineChart },
      { to: "/journal", label: "Trade Journal", icon: NotebookPen },
      { to: "/microstructure", label: "Microstructure", icon: Layers3 },
      { to: "/portfolio", label: "Portfolio & Dividends", icon: Wallet },
      { to: "/watchlists", label: "Watchlists", icon: Layers },
      { to: "/alerts", label: "Alerts", icon: BellRing },
      { to: "/triggers", label: "AI Triggers", icon: Zap },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/intelligence", label: "Intelligence Hub", icon: Brain },
      { to: "/personas", label: "Personas · Meta-Agent", icon: Users },
      { to: "/agents", label: "Agent Studio", icon: Bot },
      { to: "/goose", label: "MCP Control", icon: Bird },
      { to: "/strategy", label: "Strategy Builder", icon: Layers },
    ],
  },
  {
    label: "Developer",
    items: [
      { to: "/code-studio", label: "Code Studio", icon: Code2 },
      { to: "/repo-analyzer", label: "Repo Analyzer", icon: GitBranch },
      { to: "/api-vault", label: "API Vault", icon: KeyRound },
      { to: "/config", label: "System Config", icon: Settings },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/system", label: "System Health", icon: ShieldCheck },
      { to: "/security", label: "Cyber Defence", icon: ShieldHalf },
      { to: "/terminal", label: "Terminal Logs", icon: Terminal },
      { to: "/backup", label: "Backup & Restore", icon: Archive },
      { to: "/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];

// Backwards-compat export used elsewhere in the app.
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export function Sidebar() {
  const { pathname } = useLocation();
  const [tradingEnabled] = useTradingEnabled();

  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="relative">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent shadow-[0_0_20px_-2px_var(--primary)]">
            <Activity className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success pulse-dot" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-sm font-semibold tracking-tight text-sidebar-foreground">
            AI Executive
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-sidebar-foreground/60">
            OS · v1.0
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter(
            (i) => tradingEnabled || !isTradingRoute(i.to),
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-4">
              <div className="mb-1 px-3 text-[10px] font-mono font-semibold uppercase tracking-[0.14em] text-primary/80">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const active = item.end
                    ? pathname === item.to
                    : pathname === item.to || pathname.startsWith(item.to + "/");
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-all",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-primary shadow-[0_0_12px_var(--primary)]" />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active
                            ? "text-primary"
                            : "text-sidebar-foreground/70 group-hover:text-primary",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="rounded-md border border-border-strong bg-card/70 p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success pulse-dot" />
            <span className="text-xs font-mono uppercase tracking-wider text-sidebar-foreground">
              Engine Online
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-sidebar-foreground/60">
            Local + Cloud failover active
          </p>
        </div>
      </div>
    </aside>
  );
}
