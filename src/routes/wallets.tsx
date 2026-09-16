import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coins, RefreshCw, Star, Trash2, Wallet as WalletIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addWallet, listWallets, recordWalletReceipt, removeWallet, setDefaultWallet,
  type ChainSpec, type Wallet,
} from "@/lib/autonomy";

export const Route = createFileRoute("/wallets")({
  head: () => ({
    meta: [
      { title: "Payout Wallets — Watch-Only Mining & Ad Revenue" },
      {
        name: "description",
        content:
          "Register watch-only payout addresses for TON (Telegram Wallet), Bitcoin, Ethereum and Solana, read confirmed balances from public chain explorers and log verified receipts to the treasury ledger.",
      },
      { property: "og:title", content: "Payout Wallets" },
      {
        property: "og:description",
        content: "Watch-only crypto payout addresses with public-chain balance verification.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WalletsPage,
});

function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [chains, setChains] = useState<Record<string, ChainSpec>>({});
  const [note, setNote] = useState("");
  const [chain, setChain] = useState("ton");
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const res = await listWallets();
    setWallets(res.wallets);
    setChains(res.chains);
    setNote(res.note);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <WalletIcon className="h-6 w-6 text-primary" /> ארנקי תקבולים
        </h1>
        <p className="text-sm text-muted-foreground">
          כתובות לצפייה בלבד עבור תקבולי כרייה ופרסום. המערכת לא מחזיקה מפתח פרטי ולא ביטוי שחזור — לעולם.
        </p>
        <p className="text-xs text-muted-foreground">
          ארנק Google אינו תומך במטבעות קריפטו, לכן הוא לא מוצע כאן. ארנק טלגרם עובד דרך כתובת TON ציבורית.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-medium text-foreground">הוסף כתובת</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {Object.entries(chains).length === 0 && <option value="ton">TON (Telegram Wallet)</option>}
            {Object.entries(chains).map(([id, spec]) => (
              <option key={id} value={id}>
                {spec.label}
              </option>
            ))}
          </select>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={chains[chain]?.hint ?? "כתובת ציבורית לקבלת כספים"}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="שם לזיהוי (לא חובה)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={busy || !address.trim()}
          onClick={() =>
            void act(async () => {
              await addWallet(chain, address.trim(), label.trim());
              setAddress("");
              setLabel("");
            }, "הכתובת נוספה")
          }
          className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          שמור כתובת
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-foreground">
            <Coins className="h-4 w-4 text-primary" /> כתובות ויתרות מאומתות
          </h2>
          <button onClick={() => void load()} className="rounded-md border border-border p-2 hover:bg-muted">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : wallets.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין עדיין כתובות רשומות.</p>
        ) : (
          <div className="space-y-2">
            {wallets.map((w) => (
              <div
                key={`${w.chain}-${w.address}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {w.label}
                    {w.default && <span className="rounded bg-primary/15 px-1.5 text-xs text-primary">ברירת מחדל</span>}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{w.address}</div>
                  <div className="mt-1 text-xs">
                    {w.balance?.ok ? (
                      <span className="text-emerald-500">
                        {w.balance.amount} {w.balance.symbol}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">יתרה לא זמינה — {w.balance?.error}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!w.default && (
                    <button
                      onClick={() => void act(() => setDefaultWallet(w.chain, w.address), "עודכן")}
                      className="rounded-md border border-border p-1.5 hover:bg-muted"
                      title="הגדר כברירת מחדל"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const raw = window.prompt("סכום שהתקבל בפועל בשרשרת:");
                      const amount = Number(raw);
                      if (!raw || !Number.isFinite(amount) || amount <= 0) return;
                      void act(() => recordWalletReceipt(w.chain, w.address, amount), "התקבול נרשם ביומן");
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    רשום תקבול
                  </button>
                  <button
                    onClick={() => void act(() => removeWallet(w.chain, w.address), "הוסר")}
                    className="rounded-md border border-border p-1.5 hover:bg-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {note && <p className="mt-3 text-xs text-muted-foreground">{note}</p>}
      </section>
    </div>
  );
}
