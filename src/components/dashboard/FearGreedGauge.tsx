import { cn } from "@/lib/utils";

export function FearGreedGauge({ value = 68 }: { value?: number }) {
  const angle = (value / 100) * 180 - 90;
  const label =
    value < 25 ? "Extreme Fear" : value < 45 ? "Fear" : value < 55 ? "Neutral" : value < 75 ? "Greed" : "Extreme Greed";
  const color =
    value < 25 ? "text-destructive" : value < 45 ? "text-warning" : value < 55 ? "text-muted-foreground" : value < 75 ? "text-success" : "text-success";

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-32 w-56">
        <svg viewBox="0 0 200 110" className="h-full w-full">
          <defs>
            <linearGradient id="gauge" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="oklch(0.65 0.24 25)" />
              <stop offset="35%" stopColor="oklch(0.80 0.17 85)" />
              <stop offset="65%" stopColor="oklch(0.72 0.20 150)" />
              <stop offset="100%" stopColor="oklch(0.72 0.18 235)" />
            </linearGradient>
          </defs>
          <path
            d="M 15 100 A 85 85 0 0 1 185 100"
            fill="none"
            stroke="url(#gauge)"
            strokeWidth="10"
            strokeLinecap="round"
          />
          {/* needle */}
          <g transform={`rotate(${angle} 100 100)`}>
            <line x1="100" y1="100" x2="100" y2="28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-foreground" />
            <circle cx="100" cy="100" r="6" fill="currentColor" className="text-foreground" />
            <circle cx="100" cy="100" r="3" fill="currentColor" className="text-primary" />
          </g>
        </svg>
      </div>
      <div className="mt-1 text-center">
        <div className={cn("font-display text-4xl font-bold tabular-nums text-glow", color)}>
          {value}
        </div>
        <div className={cn("mt-0.5 text-xs font-mono uppercase tracking-widest", color)}>
          {label}
        </div>
      </div>
    </div>
  );
}
