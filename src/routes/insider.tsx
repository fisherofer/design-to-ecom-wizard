import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { UserSearch, AlertTriangle, RefreshCw } from "lucide-react";
import { fetchOwnership, type OwnershipSnapshot } from "@/lib/ownership";

export const Route = createFileRoute("/insider")({
  head: () => ({
    meta: [
      { title: "Insider & Ownership — Institutional Holdings" },
      {
        name: "description",
        content:
          "Insider ownership, institutional holdings, float and recent insider transactions for any US symbol, served from the local quant hub.",
      },
      { property: "og:title", content: "Insider & Ownership — Institutional Holdings" },
      {
        property: "og:description",
        content: "Who owns the float: insiders, institutions and recent insider transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InsiderPage,
});

function pct(v?: number | null) {
  if (v === null || v === undefined) return "—";
  const n = v > 1 ? v : v * 100;
  return `${n.toFixed(2)}%`;
}

function InsiderPage() {
  const [input, setInput] = useState("AAPL");
  const [symbol, setSymbol] = useState("AAPL");
  const [data, setData] = useState<OwnershipSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    setData(await fetchOwnership(sym));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(symbol);
  }, [symbol, load]);

  const trades = data?.insider_trades ?? [];
  const holders = data?.holders ?? [];

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <UserSearch className="h-5 w-5 text-primary" />
            Insider &amp; Ownership
          </h1>
          <p className="text-sm text-muted-foreground">מי מחזיק את המניה: מקורבים, מוסדיים, פלואוט ועסקאות פנים.</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSymbol(input.trim().toUpperCase());
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-28 rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-sm uppercase"
          />
          <button className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            טען
          </button>
        </form>
      </header>

      {data && !data.available && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
          <div>
            אין נתוני בעלות זמינים ל-{data.symbol}.
            <div className="text-xs text-muted-foreground">{data.reason ?? "השרת המקומי לא החזיר נתונים."}</div>
          </div>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "אחזקות מקורבים", value: pct(data?.insider_percent) },
          { label: "אחזקות מוסדיים", value: pct(data?.institution_percent) },
          { label: "Short %", value: pct(data?.short_percent) },
          {
            label: "Float",
            value: data?.float_shares ? `${(data.float_shares / 1e6).toFixed(1)}M` : "—",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-border glass p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 font-mono text-xl">{k.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border glass p-4">
          <h2 className="text-sm font-semibold">מחזיקים עיקריים</h2>
          {holders.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">אין רשימת מחזיקים מהמקור.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 text-start">מחזיק</th>
                  <th className="p-2 text-start">מניות</th>
                  <th className="p-2 text-start">%</th>
                </tr>
              </thead>
              <tbody>
                {holders.slice(0, 15).map((h, i) => (
                  <tr key={`${h.holder}-${i}`} className="border-b border-border/50">
                    <td className="p-2">{h.holder ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{h.shares?.toLocaleString() ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{pct(h.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-border glass p-4">
          <h2 className="text-sm font-semibold">עסקאות פנים אחרונות</h2>
          {trades.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">אין עסקאות פנים מהמקור.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="p-2 text-start">שם</th>
                  <th className="p-2 text-start">תפקיד</th>
                  <th className="p-2 text-start">פעולה</th>
                  <th className="p-2 text-start">מניות</th>
                  <th className="p-2 text-start">תאריך</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 20).map((t, i) => (
                  <tr key={`${t.name}-${i}`} className="border-b border-border/50">
                    <td className="p-2">{t.name ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground">{t.relation ?? "—"}</td>
                    <td className="p-2 text-xs">{t.transaction ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{t.shares?.toLocaleString() ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{t.date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {data?.source && <p className="text-xs text-muted-foreground">מקור: {data.source}</p>}
    </div>
  );
}
