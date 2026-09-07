/**
 * brokerOrders — the real order path to the broker (Alpaca, via the local
 * Python backend which holds the credentials).
 *
 * Nothing here fabricates a fill. Every call returns either a real broker
 * order payload or an explicit error string, so the UI can always tell the
 * difference between "the broker accepted it" and "we only have it locally".
 */
import { getApiBase } from "@/lib/apiConfig";

export interface BrokerOrder {
  broker_order_id: string;
  client_order_id: string | null;
  symbol: string;
  side: string;
  type: string;
  time_in_force: string;
  qty: number;
  filled_qty: number;
  filled_avg_price: number;
  limit_price: number | null;
  stop_price: number | null;
  status: string;
  order_class: string;
  submitted_at: string | null;
  filled_at: string | null;
  canceled_at: string | null;
  legs: BrokerOrder[];
}

export interface BrokerSubmitPayload {
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  type: "market" | "limit";
  time_in_force: "day" | "gtc" | "ioc";
  limit_price?: number | null;
  stop_price?: number | null;
  target_price?: number | null;
  client_order_id?: string;
}

export interface BrokerSubmitResult {
  accepted: boolean;
  order?: BrokerOrder;
  error?: string | null;
}

const TIMEOUT = 15_000;

async function call<T>(path: string, init?: RequestInit): Promise<T | { error: string }> {
  try {
    const res = await fetch(`${getApiBase()}/api/account${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return { error: `Backend returned HTTP ${res.status}` };
    return (await res.json()) as T;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Backend unreachable" };
  }
}

/** True when the backend holds usable broker credentials. */
export async function brokerReady(): Promise<{ ready: boolean; reason: string | null }> {
  const r = await call<{ credentials_present?: boolean; base_url?: string }>("/health");
  if ("error" in r) return { ready: false, reason: r.error };
  if (!r.credentials_present) return { ready: false, reason: "Broker credentials are not configured on the backend" };
  return { ready: true, reason: null };
}

export async function submitBrokerBracket(payload: BrokerSubmitPayload): Promise<BrokerSubmitResult> {
  const r = await call<BrokerSubmitResult>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if ("error" in r && !("accepted" in r)) return { accepted: false, error: r.error };
  return r as BrokerSubmitResult;
}

export async function listBrokerOrders(status: "open" | "closed" | "all" = "open"): Promise<{
  orders: BrokerOrder[];
  error: string | null;
}> {
  const r = await call<{ orders?: BrokerOrder[]; error?: string }>(`/orders?status=${status}&limit=200`);
  if ("error" in r && !("orders" in r)) return { orders: [], error: r.error as string };
  const body = r as { orders?: BrokerOrder[]; error?: string };
  return { orders: body.orders ?? [], error: body.error ?? null };
}

export async function cancelBrokerOrder(brokerOrderId: string): Promise<{ cancelled: boolean; error: string | null }> {
  const r = await call<{ cancelled?: boolean; error?: string }>(`/orders/${encodeURIComponent(brokerOrderId)}`, {
    method: "DELETE",
  });
  if ("error" in r && !("cancelled" in r)) return { cancelled: false, error: r.error as string };
  const body = r as { cancelled?: boolean; error?: string };
  return { cancelled: Boolean(body.cancelled), error: body.error ?? null };
}

export async function cancelAllBrokerOrders(): Promise<{ cancelled: number; error: string | null }> {
  const r = await call<{ cancelled?: number; error?: string }>("/orders", { method: "DELETE" });
  if ("error" in r && !("cancelled" in r)) return { cancelled: 0, error: r.error as string };
  const body = r as { cancelled?: number; error?: string };
  return { cancelled: body.cancelled ?? 0, error: body.error ?? null };
}

/** Maps an Alpaca order status onto the local book's status vocabulary. */
export function mapBrokerStatus(status: string): "PENDING" | "WORKING" | "FILLED" | "CANCELLED" | "REJECTED" {
  const s = status.toUpperCase();
  if (s === "FILLED") return "FILLED";
  if (s === "REJECTED" || s === "EXPIRED") return "REJECTED";
  if (s === "CANCELED" || s === "CANCELLED" || s === "DONE_FOR_DAY") return "CANCELLED";
  if (s === "NEW" || s === "ACCEPTED" || s === "PARTIALLY_FILLED" || s === "PENDING_NEW") return "WORKING";
  return "PENDING";
}
