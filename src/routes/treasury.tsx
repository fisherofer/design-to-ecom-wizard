import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, Cpu, Megaphone, Play, RefreshCw, Save, Square } from "lucide-react";
import { toast } from "sonner";
import { getLedger, type LedgerEntry } from "@/lib/localStore";
import {
  EMPTY_ADS,
  EMPTY_MINER,
  adPlacementReady,
  getAdConfig,
  getMinerConfig,
  minerStatus,
  recordPayout,
  saveAdConfig,
  saveMinerConfig,
  startMiner,
  stopMiner,
  type AdConfig,
  type MinerConfig,
  type MinerStatus,
} from "@/lib/treasury";

export const Route = createFileRoute("/treasury")({
  head: () => ({
    meta: [
      { title: "Treasury — Ad Revenue, Mining & Growth Budget" },
      {
        name: "description",
        content:
          "Fund server rent and data feeds from verified income only: configure ad placements, attach your own miner, and record real payouts in the local ledger.",
      },
      { property: "og:title", content: "Treasury — Growth Budget" },
      {
        property: "og:description",
        content: "Ad placements, external miner control and a verified-income ledger, stored locally.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TreasuryPage,
});

function TreasuryPage() {
  const [miner, setMiner] = useState<MinerConfig>(EMPTY_MINER);
  const [status, setStatus] = useState<MinerStatus | null>(null);
  const [ads, setAds] = useState<AdConfig>(EMPTY_ADS);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [payout, setPayout] = useState({ source: "ads", amount: "", note: "", evidenceUrl: "" });
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const cfg = await getMinerConfig();
    setMiner(cfg.config);
    setStatus(await minerStatus());
    setAds(await getAdConfig());
    const l = await getLedger(100);
    setLedger(l.entries ?? []);
    setTotal(l.net_total ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const offline = Boolean(status?.unavailable);

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Coins className="h-5 w-5 text-primary" /> קופה ותקציב צמיחה
          </h1>
          <p className="text-sm text-muted-foreground">
            מקורות הכנסה למימון שרתים ומקורות מידע. נרשמת רק הכנסה שהתקבלה בפועל — אין כאן תחזיות או
            הערכות רווח.
          </p>
        </div>
        <button onClick={() => void load()} className="rounded-md border border-border p-2 hover:bg-accent">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <section className="rounded-xl border border-border glass p-4">
        <p className="text-xs text-muted-foreground">סך הכנסה מאומתת בקופה</p>
        <p className="text-2xl font-semibold">${total.toFixed(2)}</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border glass p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Megaphone className="h-4 w-4 text-primary" /> שטחי פרסום
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            השטחים נשארים ריקים עד שמזינים רשת פרסום ומזהה מפרסם אמיתיים.
          </p>
          <div className="mt-3 space-y-2">
            {(
              [
                ["network", "רשת פרסום (adsense / ethicalads)"],
                ["publisherId", "מזהה מפרסם"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="block text-xs">
                {label}
                <input
                  value={ads[k]}
                  onChange={(e) => setAds({ ...ads, [k]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
              </label>
            ))}
            {(["sidebar", "footer"] as const).map((slot) => (
              <label key={slot} className="block text-xs">
                מזהה שטח — {slot}
                <input
                  value={ads.slots[slot]}
                  onChange={(e) => setAds({ ...ads, slots: { ...ads.slots, [slot]: e.target.value } })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                />
              </label>
            ))}
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={ads.enabled}
                onChange={(e) => setAds({ ...ads, enabled: e.target.checked })}
              />
              הפעל הצגת פרסומות
            </label>
            <p className="text-xs text-muted-foreground">
              מצב שטחים: sidebar {adPlacementReady(ads, "sidebar") ? "מוכן" : "לא מוגדר"} · footer{" "}
              {adPlacementReady(ads, "footer") ? "מוכן" : "לא מוגדר"}
            </p>
            <button
              onClick={async () => {
                const res = await saveAdConfig(ads);
                toast[res.ok ? "success" : "error"](res.ok ? "הגדרות הפרסום נשמרו" : res.error!);
              }}
              className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              <Save className="h-3.5 w-3.5" /> שמור
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border glass p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Cpu className="h-4 w-4 text-primary" /> כריית מטבעות
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            המערכת לא כוללת כורה מובנה. הפנה אל הכורה שהתקנת במחשב; מוצגים רק נתונים אמיתיים שהכורה מדווח.
          </p>
          {offline ? (
            <p className="mt-2 text-xs text-muted-foreground">
              השרת המקומי אינו זמין ({status?.unavailable}).
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {(
                [
                  ["binary_path", "נתיב לקובץ ההרצה של הכורה"],
                  ["args", "פרמטרים (pool, wallet)"],
                  ["api_url", "כתובת API של הכורה לסטטיסטיקה"],
                  ["pool_payout_url", "כתובת דוח תשלומים של הבריכה"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block text-xs">
                  {label}
                  <input
                    value={miner[k]}
                    onChange={(e) => setMiner({ ...miner, [k]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-mono"
                  />
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={miner.enabled}
                  onChange={(e) => setMiner({ ...miner, enabled: e.target.checked })}
                />
                אפשר הפעלת כורה
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={async () => {
                    const res = await saveMinerConfig(miner);
                    toast[res.ok ? "success" : "error"](res.ok ? "ההגדרות נשמרו" : res.error!);
                    setStatus(await minerStatus());
                  }}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  <Save className="h-3.5 w-3.5" /> שמור
                </button>
                <button
                  onClick={async () => {
                    const res = status?.running ? await stopMiner() : await startMiner();
                    toast[res.ok ? "success" : "error"](res.ok ? "בוצע" : res.error!);
                    setStatus(await minerStatus());
                  }}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  {status?.running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {status?.running ? "עצור כורה" : "הפעל כורה"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                מצב: {status?.running ? "רץ" : status?.configured ? "מוגדר, כבוי" : "לא מוגדר"}
              </p>
              {status?.stats && (
                <pre className="max-h-40 overflow-auto rounded-md border border-border p-2 text-[10px]">
                  {JSON.stringify(status.stats, null, 2)}
                </pre>
              )}
              {status?.stats_error && (
                <p className="text-xs text-muted-foreground">אין סטטיסטיקה: {status.stats_error}</p>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-border glass p-4">
        <h2 className="text-sm font-semibold">רישום תקבול שהתקבל בפועל</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <select
            value={payout.source}
            onChange={(e) => setPayout({ ...payout, source: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="ads">פרסום</option>
            <option value="mining">כרייה</option>
            <option value="donation">תרומה</option>
            <option value="other">אחר</option>
          </select>
          <input
            value={payout.amount}
            onChange={(e) => setPayout({ ...payout, amount: e.target.value })}
            placeholder="סכום USD"
            inputMode="decimal"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <input
            value={payout.evidenceUrl}
            onChange={(e) => setPayout({ ...payout, evidenceUrl: e.target.value })}
            placeholder="קישור לאסמכתה"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <input
            value={payout.note}
            onChange={(e) => setPayout({ ...payout, note: e.target.value })}
            placeholder="הערה"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
        </div>
        <button
          onClick={async () => {
            const amount = Number(payout.amount);
            if (!Number.isFinite(amount) || amount === 0) {
              toast.error("הזן סכום מספרי");
              return;
            }
            const res = await recordPayout({ ...payout, amount });
            if (!res.ok) {
              toast.error(res.error!);
              return;
            }
            toast.success("נרשם בקופה");
            setPayout({ source: "ads", amount: "", note: "", evidenceUrl: "" });
            await load();
          }}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
        >
          הוסף לקופה
        </button>

        <ul className="mt-4 space-y-1">
          {ledger.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
              <span>
                {new Date(e.occurred_at * 1000).toLocaleDateString()} · {e.source}
                {e.note ? ` · ${e.note}` : ""}
              </span>
              <span className="font-mono">
                {e.amount.toFixed(2)} {e.currency}
              </span>
            </li>
          ))}
          {!ledger.length && <li className="text-xs text-muted-foreground">אין תקבולים רשומים.</li>}
        </ul>
      </section>
    </div>
  );
}
