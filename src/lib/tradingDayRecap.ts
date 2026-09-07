/**
 * tradingDayRecap — assembles a VERIFIED recap of the last trading session so
 * the Video Studio (and any agent) can write about what actually happened.
 *
 * Hard rule: every number here comes from a real source — the local trade
 * journal, the order book, and Alpaca daily bars through the backend. Nothing
 * is simulated. When a source is unreachable the recap says so in plain text
 * instead of filling the gap, so the script writer stays qualitative.
 */
import { fetchBars } from "@/lib/backtest";
import { getBook } from "@/lib/orderTicket";
import { getJournal, type JournalEntry } from "@/lib/tradeJournal";

export interface SymbolMove {
  symbol: string;
  open: number;
  close: number;
  changePct: number;
  volume: number;
  date: string;
}

export interface DayRecap {
  /** ISO date of the session the recap describes. */
  sessionDate: string;
  symbols: string[];
  moves: SymbolMove[];
  fills: JournalEntry[];
  realizedUsd: number | null;
  ordersWorking: number;
  incidents: JournalEntry[];
  /** Sources that could not be reached — surfaced to the user, never hidden. */
  gaps: string[];
  /** Ready-to-quote context block for the script writer. */
  context: string;
  hasVerifiedNumbers: boolean;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : ((a - b) / b) * 100);

/** Symbols the desk actually touched, most recent first. */
function tradedSymbols(entries: JournalEntry[], limit: number): string[] {
  const seen: string[] = [];
  for (const e of entries) {
    if (e.symbol && !seen.includes(e.symbol)) seen.push(e.symbol);
    if (seen.length >= limit) break;
  }
  return seen;
}

/**
 * Builds the recap. `extraSymbols` lets the caller add tickers the desk did not
 * trade but wants covered (index proxies, watchlist names).
 */
export async function buildDayRecap(extraSymbols: string[] = []): Promise<DayRecap> {
  const gaps: string[] = [];
  const journal = getJournal();
  const book = getBook();

  // Look back 36h so a recap written the next morning still covers the session.
  const since = Date.now() - 36 * 3600 * 1000;
  const recent = journal.filter((e) => new Date(e.occurredAt).getTime() >= since);

  const fills = recent.filter((e) => e.eventType === "ORDER_FILLED" || e.eventType === "ORDER_SUBMITTED");
  const incidents = recent.filter((e) => e.severity === "warn" || e.severity === "critical");

  const realizedEntries = recent.filter((e) => typeof e.realizedUsd === "number");
  const realizedUsd = realizedEntries.length
    ? realizedEntries.reduce((s, e) => s + (e.realizedUsd ?? 0), 0)
    : null;
  if (realizedUsd === null) gaps.push("No realized P&L was recorded in the journal for this window.");

  const symbols = Array.from(
    new Set([...tradedSymbols(recent, 6), ...extraSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean)]),
  ).slice(0, 8);

  const moves: SymbolMove[] = [];
  if (!symbols.length) {
    gaps.push("No symbols to report — the journal has no activity and no tickers were supplied.");
  } else {
    const results = await Promise.all(symbols.map((s) => fetchBars(s, "1Day", 3).then((r) => [s, r] as const)));
    for (const [symbol, r] of results) {
      const last = r.bars[r.bars.length - 1];
      if (!last) {
        gaps.push(`Daily bars for ${symbol} are unavailable (${r.error ?? r.source}).`);
        continue;
      }
      moves.push({
        symbol,
        open: last.o,
        close: last.c,
        changePct: +pct(last.c, last.o).toFixed(2),
        volume: last.v,
        date: new Date(last.t * 1000).toISOString().slice(0, 10),
      });
    }
  }

  const sessionDate = moves[0]?.date ?? new Date().toISOString().slice(0, 10);
  const ordersWorking = book.orders.filter((o) => o.status === "WORKING" || o.status === "PENDING").length;

  const lines: string[] = [`Session date: ${sessionDate}`];
  if (moves.length) {
    lines.push("Verified daily moves (Alpaca bars):");
    for (const m of moves) {
      lines.push(
        `- ${m.symbol}: open ${m.open}, close ${m.close}, ${m.changePct >= 0 ? "+" : ""}${m.changePct}%, volume ${m.volume.toLocaleString("en-US")}`,
      );
    }
  }
  if (fills.length) {
    lines.push(`Desk activity: ${fills.length} order event(s).`);
    for (const f of fills.slice(0, 10)) {
      lines.push(
        `- ${new Date(f.occurredAt).toISOString().slice(11, 16)} ${f.eventType} ${f.symbol ?? ""} ${f.side ?? ""} ${
          f.qty ?? ""
        } @ ${f.price ?? "—"}`.replace(/\s+/g, " "),
      );
    }
  } else {
    lines.push("Desk activity: no orders were submitted or filled in this window.");
  }
  lines.push(realizedUsd === null ? "Realized P&L: not recorded." : `Realized P&L: ${realizedUsd.toFixed(2)} USD`);
  lines.push(`Working orders still open: ${ordersWorking}`);
  if (incidents.length) {
    lines.push("Incidents:");
    for (const i of incidents.slice(0, 6)) lines.push(`- [${i.severity}] ${i.message}`);
  }
  if (gaps.length) {
    lines.push("Unavailable data (do NOT invent it, speak qualitatively):");
    for (const g of gaps) lines.push(`- ${g}`);
  }

  return {
    sessionDate,
    symbols,
    moves,
    fills,
    realizedUsd,
    ordersWorking,
    incidents,
    gaps,
    context: lines.join("\n"),
    hasVerifiedNumbers: moves.length > 0 || fills.length > 0,
  };
}

/** A short episode topic derived from the recap — no invented narrative. */
export function recapTopic(recap: DayRecap): string {
  const best = [...recap.moves].sort((a, b) => b.changePct - a.changePct)[0];
  const worst = [...recap.moves].sort((a, b) => a.changePct - b.changePct)[0];
  const bits = [`Recap of the ${recap.sessionDate} session.`];
  if (best && worst && best.symbol !== worst.symbol) {
    bits.push(`Best mover ${best.symbol} ${best.changePct}%, weakest ${worst.symbol} ${worst.changePct}%.`);
  } else if (best) {
    bits.push(`${best.symbol} closed ${best.changePct}% on the day.`);
  }
  bits.push(
    recap.fills.length
      ? `The desk logged ${recap.fills.length} order event(s).`
      : "The desk did not trade during the session.",
  );
  if (recap.realizedUsd !== null) bits.push(`Realized P&L ${recap.realizedUsd.toFixed(2)} USD.`);
  return bits.join(" ");
}
