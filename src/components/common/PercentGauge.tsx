/**
 * Circular percentage gauge — "clock dial" style used across dashboard.
 * value: -100..+100 (percent). Positive = green sweep, negative = red sweep.
 * Also supports 0..100 probability display via `mode="unipolar"`.
 */
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  size?: number;
  label?: string;
  sublabel?: string;
  mode?: "bipolar" | "unipolar";
  className?: string;
}

export function PercentGauge({
  value,
  size = 64,
  label,
  sublabel,
  mode = "bipolar",
  className,
}: Props) {
  const clamped =
    mode === "bipolar" ? Math.max(-100, Math.min(100, value)) : Math.max(0, Math.min(100, value));
  const pct = mode === "bipolar" ? Math.abs(clamped) : clamped;
  const isUp = mode === "bipolar" ? clamped >= 0 : true;

  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  const color =
    mode === "unipolar"
      ? clamped >= 75
        ? "#22c55e"
        : clamped >= 50
        ? "#84cc16"
        : clamped >= 25
        ? "#f59e0b"
        : "#ef4444"
      : isUp
      ? clamped >= 6
        ? "#16a34a"
        : "#4ade80"
      : clamped <= -6
      ? "#dc2626"
      : "#f87171";

  const display =
    mode === "bipolar"
      ? `${clamped > 0 ? "+" : ""}${clamped.toFixed(clamped >= 10 || clamped <= -10 ? 0 : 1)}%`
      : `${Math.round(clamped)}`;

  return (
    <div className={cn("inline-flex flex-col items-center", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 400ms ease, stroke 200ms" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono text-[11px] font-bold tabular-nums leading-none"
            style={{ color }}
          >
            {display}
          </span>
          {sublabel && (
            <span className="mt-0.5 text-[8px] font-mono uppercase text-muted-foreground">
              {sublabel}
            </span>
          )}
        </div>
      </div>
      {label && (
        <span className="mt-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      )}
    </div>
  );
}
