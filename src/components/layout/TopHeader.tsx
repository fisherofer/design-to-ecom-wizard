import { Search, Bell, Smartphone, User } from "lucide-react";

export function TopHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/70 px-6 backdrop-blur-xl">
      <div className="relative flex-1 max-w-xl">
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

      <div className="flex items-center gap-2">
        <button className="flex h-9 items-center gap-2 rounded-md border border-border bg-card/50 px-3 text-xs font-mono text-muted-foreground hover:border-border-strong hover:text-foreground transition-colors">
          <Smartphone className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">+972 · DEVICE LINKED</span>
          <span className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
        </button>

        <button className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/50 hover:border-border-strong transition-colors">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
        </button>

        <button className="flex h-9 items-center gap-2 rounded-md border border-border bg-card/50 px-2 hover:border-border-strong transition-colors">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent">
            <User className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="hidden md:inline text-xs font-medium">Operator</span>
        </button>
      </div>
    </header>
  );
}
