import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, X, ExternalLink } from "lucide-react";
import { alpaca, type Watchlist } from "@/lib/alpaca";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watchlists")({
  head: () => ({
    meta: [
      { title: "Watchlists — AI Executive OS" },
      { name: "description", content: "Manage Alpaca-synced watchlists of tickers to track and trade." },
    ],
  }),
  component: WatchlistsPage,
});

function WatchlistsPage() {
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    alpaca.listWatchlists().then((l) => {
      setLists(l);
      if (l[0]) setSelected(l[0].id);
    });
  }, []);

  const active = lists.find((l) => l.id === selected) ?? null;

  const addSymbol = async () => {
    if (!active || !newSymbol.trim()) return;
    const sym = newSymbol.trim().toUpperCase();
    if (active.symbols.includes(sym)) return;
    const next = [...active.symbols, sym];
    const updated = await alpaca.updateWatchlist(active.id, next);
    setLists((ls) => ls.map((l) => (l.id === active.id ? updated : l)));
    setNewSymbol("");
  };

  const removeSymbol = async (sym: string) => {
    if (!active) return;
    const next = active.symbols.filter((s) => s !== sym);
    const updated = await alpaca.updateWatchlist(active.id, next);
    setLists((ls) => ls.map((l) => (l.id === active.id ? updated : l)));
  };

  const createList = async () => {
    if (!newName.trim()) return;
    const wl = await alpaca.createWatchlist(newName.trim(), []);
    setLists((ls) => [...ls, wl]);
    setSelected(wl.id);
    setNewName("");
  };

  const deleteList = async (id: string) => {
    await alpaca.deleteWatchlist(id);
    setLists((ls) => ls.filter((l) => l.id !== id));
    if (selected === id) setSelected(lists[0]?.id ?? null);
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold">Watchlists</h1>
        <p className="text-sm text-muted-foreground font-mono">Synced with Alpaca · Add tickers to track & alert</p>
      </header>

      <div className="grid gap-5 md:grid-cols-[260px_1fr]">
        <aside className="rounded-xl border border-border glass p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">Lists</h3>
          </div>
          <ul className="space-y-1">
            {lists.map((l) => (
              <li key={l.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelected(l.id)}
                  className={cn(
                    "flex-1 text-left rounded-md px-2.5 py-2 text-sm hover:bg-card",
                    selected === l.id ? "bg-card text-foreground" : "text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span>{l.name}</span>
                    <span className="text-[10px] font-mono">{l.symbols.length}</span>
                  </div>
                </button>
                <button onClick={() => deleteList(l.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-1">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New list name"
              className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs"
              onKeyDown={(e) => e.key === "Enter" && createList()}
            />
            <button onClick={createList} className="rounded-md border border-border bg-card px-2 hover:bg-card/80">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>

        <section className="rounded-xl border border-border glass p-5">
          {active ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-semibold">{active.name}</h2>
                  <p className="text-[11px] font-mono text-muted-foreground">
                    {active.symbols.length} symbols · Updated {new Date(active.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  <input
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    placeholder="AAPL"
                    className="w-24 rounded-md border border-border bg-card px-2 py-1.5 text-xs font-mono uppercase"
                    onKeyDown={(e) => e.key === "Enter" && addSymbol()}
                  />
                  <button onClick={addSymbol} className="rounded-md border border-border bg-primary/20 px-3 py-1.5 text-xs font-mono uppercase hover:bg-primary/30">
                    <Plus className="inline h-3 w-3" /> Add
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {active.symbols.map((s) => (
                  <div key={s} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-mono">
                    <Link to="/ticker/$symbol" params={{ symbol: s }} className="hover:text-primary">
                      {s} <ExternalLink className="inline h-3 w-3" />
                    </Link>
                    <button onClick={() => removeSymbol(s)} className="ml-1 text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {active.symbols.length === 0 && (
                  <p className="text-sm text-muted-foreground">No symbols yet — add one above.</p>
                )}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Select or create a list.</p>
          )}
        </section>
      </div>
    </div>
  );
}
