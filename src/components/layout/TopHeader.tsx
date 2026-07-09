import { Link, useLocation } from "@tanstack/react-router";
import { Search, Smartphone, User, Menu, Activity } from "lucide-react";
import { NotificationsBell } from "./NotificationsBell";
import { NAV_ITEMS } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function TopHeader() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/70 px-3 backdrop-blur-xl sm:gap-4 sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[min(88vw,320px)] flex-col overflow-hidden bg-sidebar p-0">
          <SheetHeader className="border-b border-sidebar-border p-5 text-left">
            <SheetTitle className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Activity className="h-5 w-5" /></span>
              AI Executive OS
            </SheetTitle>
            <SheetDescription>Trading command center</SheetDescription>
          </SheetHeader>
          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
            {NAV_ITEMS.map((item) => {
              const active = item.end ? pathname === item.to : pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <SheetClose asChild key={item.to}>
                  <Link to={item.to} className={cn("flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium", active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground")}>
                    <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </SheetClose>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="relative min-w-0 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search markets, strategies, logs…"
          className="h-9 w-full rounded-md border border-border bg-card/50 pl-9 pr-16 text-sm placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40 transition-colors"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <Button variant="outline" className="hidden gap-2 bg-card/50 px-3 font-mono text-xs text-muted-foreground sm:flex">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">+972 · DEVICE LINKED</span>
          <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
        </Button>

        <NotificationsBell />

        <Button variant="outline" className="hidden gap-2 bg-card/50 px-2 sm:flex">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <User className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="hidden md:inline text-xs font-medium">Operator</span>
        </Button>
      </div>
    </header>
  );
}
