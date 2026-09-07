/**
 * tradeJournal — append-only audit trail for everything that touches money.
 *
 * Every order submission, fill, cancellation, risk breach and emergency halt
 * is written here with a timestamp, so any trade can be reconstructed after
 * the fact ("why did we enter this?").
 *
 * Entries are written locally first (Portable profile / localStorage) and then
 * mirrored to the cloud table `trade_journal`, which is insert-and-read only —
 * rows can never be edited or deleted.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { portableGetJson, portableSetJson } from "@/lib/portableStorage";
import { getSyncSession } from "@/lib/cloudSync";

export const JOURNAL_KEY = "ofer.trade.journal.v1";
export const JOURNAL_EVENT = "ofer:trade-journal-changed";
const MAX_LOCAL = 2000;

export type JournalEventType =
  | "ORDER_SUBMITTED"
  | "ORDER_REJECTED"
  | "ORDER_FILLED"
  | "ORDER_CANCELLED"
  | "POSITION_CLOSED"
  | "PROTECTION_AMENDED"
  | "RISK_BREACH"
  | "KILL_SWITCH"
  | "AGENT_DECISION"
  | "NOTE";

export type JournalSeverity = "info" | "warn" | "critical";

export interface JournalEntry {
  id: string;
  eventType: JournalEventType;
  symbol: string | null;
  side: string | null;
  qty: number | null;
  price: number | null;
  realizedUsd: number | null;
  source: "local" | "broker" | "agent" | "risk";
  severity: JournalSeverity;
  message: string;
  details: Record<string, unknown>;
  orderId: string | null;
  brokerOrderId: string | null;
  occurredAt: string;
  synced: boolean;
}

export interface JournalInput {
  eventType: JournalEventType;
  message: string;
  symbol?: string | null;
  side?: string | null;
  qty?: number | null;
  price?: number | null;
  realizedUsd?: number | null;
  source?: JournalEntry["source"];
  severity?: JournalSeverity;
  details?: Record<string, unknown>;
  orderId?: string | null;
  brokerOrderId?: string | null;
}

function read(): JournalEntry[] {
  const raw = portableGetJson<JournalEntry[]>(JOURNAL_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

function write(entries: JournalEntry[]) {
  portableSetJson(JOURNAL_KEY, entries.slice(0, MAX_LOCAL));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(JOURNAL_EVENT));
}

export function getJournal(): JournalEntry[] {
  return read();
}

/** Writes one immutable entry. Local write is synchronous; cloud is best-effort. */
export function journal(input: JournalInput): JournalEntry {
  const entry: JournalEntry = {
    id: `JRN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    eventType: input.eventType,
    symbol: input.symbol?.toUpperCase() ?? null,
    side: input.side ?? null,
    qty: input.qty ?? null,
    price: input.price ?? null,
    realizedUsd: input.realizedUsd ?? null,
    source: input.source ?? "local",
    severity: input.severity ?? "info",
    message: input.message,
    details: input.details ?? {},
    orderId: input.orderId ?? null,
    brokerOrderId: input.brokerOrderId ?? null,
    occurredAt: new Date().toISOString(),
    synced: false,
  };
  write([entry, ...read()]);
  void pushToCloud(entry);
  return entry;
}

async function pushToCloud(entry: JournalEntry): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { error } = await supabase.from("trade_journal").insert({
      owner_session: getSyncSession(),
      event_type: entry.eventType,
      symbol: entry.symbol,
      side: entry.side,
      qty: entry.qty,
      price: entry.price,
      realized_usd: entry.realizedUsd,
      source: entry.source,
      severity: entry.severity,
      message: entry.message,
      details: entry.details as never,
      order_id: entry.orderId,
      broker_order_id: entry.brokerOrderId,
      occurred_at: entry.occurredAt,
    });
    if (!error) {
      write(read().map((e) => (e.id === entry.id ? { ...e, synced: true } : e)));
    }
  } catch {
    /* offline — the local copy remains the source of truth */
  }
}

/** Re-sends every entry that never reached the cloud. */
export async function flushJournal(): Promise<{ pushed: number; failed: number }> {
  const pending = read().filter((e) => !e.synced);
  let pushed = 0;
  for (const entry of pending) {
    const before = read().find((e) => e.id === entry.id)?.synced;
    await pushToCloud(entry);
    const after = read().find((e) => e.id === entry.id)?.synced;
    if (!before && after) pushed += 1;
  }
  return { pushed, failed: pending.length - pushed };
}

/** Pulls the cloud copy — the record that survives a wiped machine. */
export async function fetchCloudJournal(limit = 300): Promise<{ rows: JournalEntry[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("trade_journal")
      .select("*")
      .eq("owner_session", getSyncSession())
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], error: error.message };
    const rows: JournalEntry[] = (data ?? []).map((r) => ({
      id: r.id,
      eventType: r.event_type as JournalEventType,
      symbol: r.symbol,
      side: r.side,
      qty: r.qty === null ? null : Number(r.qty),
      price: r.price === null ? null : Number(r.price),
      realizedUsd: r.realized_usd === null ? null : Number(r.realized_usd),
      source: (r.source as JournalEntry["source"]) ?? "local",
      severity: (r.severity as JournalSeverity) ?? "info",
      message: r.message,
      details: (r.details as Record<string, unknown>) ?? {},
      orderId: r.order_id,
      brokerOrderId: r.broker_order_id,
      occurredAt: r.occurred_at,
      synced: true,
    }));
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : "Cloud unreachable" };
  }
}

export function journalToCsv(entries: JournalEntry[]): string {
  const head = [
    "occurred_at", "event_type", "severity", "source", "symbol", "side",
    "qty", "price", "realized_usd", "order_id", "broker_order_id", "message",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = entries.map((e) =>
    [
      e.occurredAt, e.eventType, e.severity, e.source, e.symbol ?? "", e.side ?? "",
      e.qty ?? "", e.price ?? "", e.realizedUsd ?? "", e.orderId ?? "", e.brokerOrderId ?? "", e.message,
    ].map(esc).join(","),
  );
  return [head.join(","), ...lines].join("\n");
}

export function useJournal(): JournalEntry[] {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    const sync = () => setEntries(read());
    sync();
    window.addEventListener(JOURNAL_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(JOURNAL_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return entries;
}
