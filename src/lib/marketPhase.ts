/**
 * Market Phase — classifies "now" against US equity market hours (ET) into
 *   market    → 09:30 – 16:00 (regular session)
 *   pre       → 04:00 – 09:30 (pre-market)
 *   post      → 16:00 – 20:00 (after-hours)
 *   closed    → everything else (nights / weekends)
 *
 * Also provides `scaleForPhase(baseMs)` — the "smart refresh engine": budgets
 * refresh frequency across the trading day with a 90/5/5 split
 * (regular / pre / post), meaning during regular hours widgets refresh at the
 * user's chosen base interval, and pre/post refresh ~18x slower. Closed hours
 * refresh very slowly (once/5min minimum).
 */

export type MarketPhase = "market" | "pre" | "post" | "closed";

export interface PhaseInfo {
  phase: MarketPhase;
  label: string;
  /** Multiplier applied to the base refresh interval. */
  multiplier: number;
  /** ISO time when the current phase ends (best-effort). */
  until?: string;
}

function etParts(now = new Date()): { day: number; h: number; m: number } {
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  return { day: et.getDay(), h: et.getHours(), m: et.getMinutes() };
}

export function marketPhase(now = new Date()): PhaseInfo {
  const { day, h, m } = etParts(now);
  const isWeekday = day >= 1 && day <= 5;
  const minutes = h * 60 + m;

  if (!isWeekday) {
    return { phase: "closed", label: "Weekend · Closed", multiplier: 20 };
  }
  // 04:00 – 09:30 pre-market
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) {
    return { phase: "pre", label: "Pre-Market", multiplier: 18 };
  }
  // 09:30 – 16:00 regular
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) {
    return { phase: "market", label: "Regular Session", multiplier: 1 };
  }
  // 16:00 – 20:00 after-hours
  if (minutes >= 16 * 60 && minutes < 20 * 60) {
    return { phase: "post", label: "After-Hours", multiplier: 18 };
  }
  return { phase: "closed", label: "Overnight · Closed", multiplier: 20 };
}

/**
 * Given the user's base interval, scale it by the current market phase.
 * Returns 0 unchanged (means "paused").
 */
export function scaleForPhase(baseMs: number, now = new Date()): number {
  if (baseMs <= 0) return 0;
  const { multiplier } = marketPhase(now);
  const scaled = Math.round(baseMs * multiplier);
  // Never poll slower than 5 minutes during closed hours, never faster than base.
  return Math.max(baseMs, Math.min(scaled, 5 * 60_000));
}
