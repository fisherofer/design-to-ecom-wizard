import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  icon: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive" | "accent";
  children: React.ReactNode;
}

const ACCENT: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  primary: "from-primary/20 to-transparent border-primary/30",
  success: "from-success/20 to-transparent border-success/30",
  warning: "from-warning/20 to-transparent border-warning/30",
  destructive: "from-destructive/20 to-transparent border-destructive/30",
  accent: "from-accent/20 to-transparent border-accent/30",
};

export function KpiCard({ title, icon: Icon, accent = "primary", children }: KpiCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-gradient-to-br p-5 glass-strong",
        ACCENT[accent],
      )}
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-radial from-primary/10 to-transparent blur-2xl" />
      <div className="relative flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-card/60">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <div className="relative mt-4">{children}</div>
    </div>
  );
}
