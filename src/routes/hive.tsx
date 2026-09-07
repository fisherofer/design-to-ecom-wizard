import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Network, Send, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchConsensus, shareSignal, type HiveConsensus } from "@/lib/hive";

export const Route = createFileRoute("/hive")({
  head: () => ({
    meta: [
      { title: "Hive Consensus — Weighted Community Signals" },
      {
        name: "description",
        content:
          "Share trading signals into the hive and read weighted consensus per symbol, scored by each contributor's track record.",
      },
      { property: "og:title", content: "Hive Consensus — Weighted Community Signals" },
      {
        property: "og:description",
        content: "Weighted swarm consensus per symbol, backed by contributor track records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HivePage,
});

function HivePage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [data, setData] = useState<HiveConsensus | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"BUY" | "SELL" | "HOLD">("BUY");
  const [confidence, setConfidence] = useState(0.7);
  const [sent, setSent] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setData(await fetchConsensus(symbol.toUpperCase()));
    setLoading(false);
  };

  const share = async () => {
    const res = await shareSignal({ symbol: symbol.toUpperCase(), action, confidence });
    setSent(res.success ? "הסיגנל שותף לכוורת." : `שיתוף נכשל: ${res.reason ?? "לא ידוע"}`);
    if (res.success) await load();
  };

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Network className="h-5 w-5 text-primary" />
          כוורת (Hive)
        </h1>
        <p className="text-sm text-muted-foreground">
          שיתוף סיגנלים וקונצנזוס משוקלל לפי טרק-רקורד — מגיע מהשרת המקומי, ללא נתונים מומצאים.
        </p>
      </header>

      <section className="rounded-xl border border-border glass p-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">סימבול</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="w-28 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">פעולה</span>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as "BUY" | "SELL" | "HOLD")}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="HOLD">HOLD</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted-foreground">ביטחון</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
              className="w-24 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-sm"
            />
          </label>
          <button
            onClick={() => void share()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          >
            <Send className="h-4 w-4" />
            שתף סיגנל
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            טען קונצנזוס
          </button>
        </div>
        {sent && <p className="mt-2 text-xs text-muted-foreground">{sent}</p>}
      </section>

      {data && (
        <section className="rounded-xl border border-border glass p-4">
          {!data.available && !data.consensus ? (
            <p className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              אין קונצנזוס זמין ל-{data.symbol}. {data.reason ?? ""}
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">קונצנזוס</div>
                  <div className="font-mono text-xl">{data.consensus ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">ציון</div>
                  <div className="font-mono text-xl">{data.score?.toFixed(2) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">משתתפים</div>
                  <div className="font-mono text-xl">{data.contributors ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">משקל קנייה / מכירה</div>
                  <div className="font-mono text-xl">
                    {data.buy_weight?.toFixed(2) ?? "—"} / {data.sell_weight?.toFixed(2) ?? "—"}
                  </div>
                </div>
              </div>
              {(data.signals?.length ?? 0) > 0 && (
                <table className="mt-4 w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="p-2 text-start">משתתף</th>
                      <th className="p-2 text-start">פעולה</th>
                      <th className="p-2 text-start">ביטחון</th>
                      <th className="p-2 text-start">מודל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.signals!.map((s, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="p-2 font-mono text-xs">{s.user_id ?? "—"}</td>
                        <td className="p-2 text-xs">{s.action}</td>
                        <td className="p-2 font-mono text-xs">{s.confidence?.toFixed(2)}</td>
                        <td className="p-2 text-xs text-muted-foreground">{s.model_version ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
