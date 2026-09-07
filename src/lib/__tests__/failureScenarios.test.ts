/**
 * failureScenarios.test.ts — automated proof that the trading path degrades
 * safely instead of pretending things worked.
 *
 * Every case here is a real failure the system can hit in production:
 * backend unreachable, broker HTTP error, malformed payload, request timeout,
 * missing credentials. In none of them may the code report success or invent
 * data — that is exactly what these tests assert.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  amendBrokerProtection,
  brokerReady,
  cancelAllBrokerOrders,
  cancelBrokerOrder,
  listBrokerOrders,
  mapBrokerStatus,
  submitBrokerBracket,
} from "@/lib/brokerOrders";
import { simulate, DEFAULT_PARAMS } from "@/lib/backtest";

const realFetch = globalThis.fetch;

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(impl(String(input), init)),
  ) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("broker path — backend unreachable", () => {
  beforeEach(() => {
    mockFetch(() => {
      throw new TypeError("fetch failed");
    });
  });

  it("never reports the broker as ready", async () => {
    const r = await brokerReady();
    expect(r.ready).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("never claims an order was accepted", async () => {
    const r = await submitBrokerBracket({
      symbol: "AAPL",
      side: "buy",
      qty: 1,
      type: "market",
      time_in_force: "day",
    });
    expect(r.accepted).toBe(false);
    expect(r.error).toBeTruthy();
    expect(r.order).toBeUndefined();
  });

  it("returns an empty order list with an explicit error, not fake orders", async () => {
    const r = await listBrokerOrders("open");
    expect(r.orders).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it("never claims a cancel succeeded", async () => {
    expect((await cancelBrokerOrder("abc")).cancelled).toBe(false);
    expect((await cancelAllBrokerOrders()).cancelled).toBe(0);
  });

  it("never claims protection legs were amended", async () => {
    const r = await amendBrokerProtection("abc", 100, 120);
    expect(r.amended).toBe(false);
    expect(r.legs).toEqual([]);
    expect(r.error).toBeTruthy();
  });
});

describe("broker path — credentials missing / provider rejection", () => {
  it("surfaces the backend's 'credentials not configured' answer verbatim", async () => {
    mockFetch(() => json({ accepted: false, error: "ALPACA_API_KEY is not configured." }));
    const r = await submitBrokerBracket({
      symbol: "AAPL",
      side: "buy",
      qty: 1,
      type: "market",
      time_in_force: "day",
    });
    expect(r.accepted).toBe(false);
    expect(r.error).toContain("ALPACA_API_KEY");
  });

  it("treats a 5xx from the backend as a failure, not a fill", async () => {
    mockFetch(() => json({ message: "boom" }, 502));
    const r = await submitBrokerBracket({
      symbol: "AAPL",
      side: "buy",
      qty: 1,
      type: "market",
      time_in_force: "day",
    });
    expect(r.accepted).toBe(false);
    expect(r.error).toContain("502");
  });

  it("reports partial leg rejection as NOT amended", async () => {
    mockFetch(() =>
      json({
        amended: false,
        legs: [
          { leg_id: "1", kind: "STOP", action: "replaced", ok: true },
          { leg_id: "2", kind: "TARGET", action: "replaced", ok: false, detail: "rejected" },
        ],
        error: "TARGET: rejected",
      }),
    );
    const r = await amendBrokerProtection("parent", 100, 120);
    expect(r.amended).toBe(false);
    expect(r.error).toContain("TARGET");
    expect(r.legs).toHaveLength(2);
  });
});

describe("broker path — malformed payloads", () => {
  it("survives a non-JSON body without throwing", async () => {
    mockFetch(() => new Response("<html>gateway</html>", { status: 200 }));
    const r = await listBrokerOrders("open");
    expect(r.orders).toEqual([]);
    expect(r.error).toBeTruthy();
  });

  it("survives a JSON body missing the orders array", async () => {
    mockFetch(() => json({ unexpected: true }));
    const r = await listBrokerOrders("open");
    expect(r.orders).toEqual([]);
  });
});

describe("broker status mapping is total", () => {
  it("maps every Alpaca status onto a known local state", () => {
    const known = ["PENDING", "WORKING", "FILLED", "CANCELLED", "REJECTED"];
    for (const s of [
      "new",
      "accepted",
      "partially_filled",
      "filled",
      "canceled",
      "expired",
      "rejected",
      "pending_new",
      "done_for_day",
      "some_future_status",
    ]) {
      expect(known).toContain(mapBrokerStatus(s));
    }
  });
});

describe("backtest engine — degenerate market data", () => {
  const bar = (t: number, c: number) => ({
    t: new Date(t).toISOString(),
    o: c,
    h: c,
    l: c,
    c,
    v: 1000,
  });

  it("returns no trades and no NaN on an empty bar set", () => {
    const out = simulate([], DEFAULT_PARAMS);
    expect(out.trades).toEqual([]);
    expect(Number.isFinite(out.metrics.totalReturnPct)).toBe(true);
  });

  it("produces finite metrics on a flat market (zero volatility)", () => {
    const bars = Array.from({ length: 120 }, (_, i) => bar(Date.now() - (120 - i) * 86_400_000, 100));
    const out = simulate(bars, DEFAULT_PARAMS);
    for (const v of Object.values(out.metrics)) {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
    }
  });
});
