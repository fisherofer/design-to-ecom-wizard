import { describe, expect, it } from "vitest";
import { extractSymbols, normalizeSymbol, describeScreenContext } from "@/lib/screenContextTracker";

describe("screenContextTracker", () => {
  it("normalizes exchange-prefixed symbols", () => {
    expect(normalizeSymbol("nasdaq:nvda")).toBe("NVDA");
    expect(normalizeSymbol(" brk.b ")).toBe("BRK.B");
  });

  it("extracts equities, class shares and crypto pairs without a hardcoded list", () => {
    const found = extractSymbols("Watching NVDA, BRK.B and BTC/USDT today");
    expect(found).toContain("NVDA");
    expect(found).toContain("BRK.B");
    expect(found).toContain("BTC/USDT");
  });

  it("filters UI noise tokens", () => {
    const found = extractSymbols("API OK ALL LIVE NVDA");
    expect(found).toEqual(["NVDA"]);
  });

  it("restricts to the known universe when provided", () => {
    const found = extractSymbols("NVDA AAPL TSLA", ["aapl", "tsla"]);
    expect(found).toEqual(["AAPL", "TSLA"]);
  });

  it("has no fixed upper length cap on symbols", () => {
    expect(extractSymbols("LONGTICKERNAME", ["LONGTICKERNAME"])).toEqual(["LONGTICKERNAME"]);
  });

  it("describes context for the assistant", () => {
    const text = describeScreenContext({
      symbols: ["NVDA"],
      routeSymbol: "NVDA",
      path: "/ticker/NVDA",
      heading: "NVDA Overview",
      capturedAt: new Date().toISOString(),
    });
    expect(text).toContain("NVDA Overview");
    expect(text).toContain("NVDA");
  });
});
