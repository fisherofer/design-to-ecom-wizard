/**
 * Circular ticker logo with graceful fallback + optional hover-preview card.
 * On image load-error, renders a colored monogram matching the symbol.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { logoUrl, tickerColor, initials } from "@/lib/tickerLogo";
import { TickerHoverCard } from "@/components/tickers/TickerHoverCard";
import { cn } from "@/lib/utils";

type Size = "xs" | "sm" | "md";

const SIZE: Record<Size, string> = {
  xs: "h-5 w-5 text-[9px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
};

export function TickerLogo({
  symbol,
  size = "sm",
  className,
  linkTo = true,
  hoverPreview = true,
}: {
  symbol: string;
  size?: Size;
  className?: string;
  linkTo?: boolean;
  /** Show quote preview on hover. Set false inside tables/cards that already show quotes. */
  hoverPreview?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const color = tickerColor(symbol);

  const inner = failed ? (
    <span
      className={cn(
        "flex items-center justify-center rounded-full font-bold text-white shadow-inner",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-label={symbol}
    >
      {initials(symbol)}
    </span>
  ) : (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10",
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: "#ffffff" }}
      title={symbol}
    >
      <img
        src={logoUrl(symbol)}
        alt={`${symbol} logo`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-contain"
      />
    </span>
  );

  const anchor = linkTo ? (
    <Link
      to="/ticker/$symbol"
      params={{ symbol }}
      className="inline-flex items-center hover:opacity-80 transition-opacity"
      aria-label={`View ${symbol} details`}
    >
      {inner}
    </Link>
  ) : (
    <span className="inline-flex items-center">{inner}</span>
  );

  if (!hoverPreview) return anchor;
  return <TickerHoverCard symbol={symbol}>{anchor}</TickerHoverCard>;
}

