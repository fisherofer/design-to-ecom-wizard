/**
 * Trade Journal — the append-only audit trail.
 *
 * Every order, fill, cancellation, risk breach and emergency halt lands here
 * with a timestamp, locally and in the cloud copy. Rows are never edited or
 * deleted, so any trade can be reconstructed after the fact.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudUpload, Download, NotebookPen, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fetchCloudJournal,
  flushJournal,
  journal,
  journalToCsv,
  useJournal,
  type JournalEntry,
  type JournalEventType,
} from "@/lib/tradeJournal";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trade Journal — OFERTRADINGBOT" },
      {
        name: "description",
        content:
          "Append-only audit trail of every order, fill, cancellation, risk breach and emergency halt, with CSV export.",
      },
      { property: "og:title", content: "Trade Journal — OFERTRADINGBOT" },
      {
        property: "og:description",
        content: "Reconstruct any trade: timestamped record of orders, fills, risk breaches and halts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JournalScreen,
});

const FILTERS: Array<{ key: JournalEventType | "ALL"; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "ORDER_SUBMITTED", label: "Orders" },
  { key: "ORDER_FILLED", label: "Fills" },
  { key: "POSITION_CLOSED", label: "Closes" },
  { key: "ORDER_CANCELLED", label: "Cancels" },
  { key: "RISK_BREACH", label: "Risk" },
  { key: "KILL_SWITCH", label: "Halts" },
  { key: "NOTE", label: "Notes" },
];

const severityTone: Record<JournalEntry["severity"], string> = {
  info: "border-border text-muted-foreground",
  warn: "border-amber-500/50 text-amber-600 dark:text-amber-400",
  critical: "border-destructive/50 text-destructive",
};

function JournalScreen() {
  const local = useJournal();
  const [cloud, setCloud] = useState<JournalEntry[]>([]);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [source, setSource] = useState<"local" | "cloud">("local");
  const [filter, setFilter] = useState<JournalEventType | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const loadCloud = useCallback(async () => {
    setBusy(true);
    const { rows, error } = await fetchCloudJournal(500);
    setCloud(rows);
    setCloudError(error);
    setBusy(false);
  }, []);

  useEffect(() => {
    void loadCloud();
  }, [loadCloud]);

  const entries = source === "cloud" ? cloud : local;
  const pending = local.filter((e) => !e.synced).length;

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    return entries.filter((e) => {
      if (filter !== "ALL" && e.eventType !== filter) return false;
      if (!q) return true;
      return (
        (e.symbol ?? "").includes(q) ||
        e.message.toUpperCase().includes(q) ||
        e.eventType.includes(q)
      );
    });
  }, [entries, filter, query]);

  const exportCsv = () => {
    const blob = new Blob([journalToCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} entries`);
  };

  const sync = async () => {
    setBusy(true);
    const { pushed, failed } = await flushJournal();
    setBusy(false);
    if (failed > 0) toast.warning(`${pushed} synced, ${failed} still pending`);
    else if (pushed > 0) toast.success(`${pushed} entries synced to the cloud`);
    else toast.info("Everything is already synced");
    void loadCloud();
  };

  const addNote = () => {
    if (!note.trim()) return;
    journal({ eventType: "NOTE", message: note.trim(), severity: "info", source: "local" });
    setNote("");
    toast.success("Note recorded");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-3 sm:space-y-6 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            <NotebookPen className="h-6 w-6 text-primary" />
            Trade Journal
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Append-only record — orders, fills, cancellations, risk breaches and halts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={sync} disabled={busy}>
            <CloudUpload className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-pulse")} />
            Sync {pending > 0 ? `(${pending})` : ""}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void loadCloud()} disabled={busy}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", busy && "animate-spin")} />
            Reload
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["local", "cloud"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium capitalize transition-colors",
                  source === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "local" ? "This device" : "Cloud copy"}
              </button>
            ))}
          </div>

          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                filter === f.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}

          <div className="relative ml-auto min-w-48 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by symbol or text"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {source === "cloud" && cloudError && (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Cloud copy unavailable: {cloudError}. The device copy above is still complete.
          </p>
        )}

        <div className="mt-3 flex gap-2">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addNote()}
            placeholder="Add a note to the record — why you took or skipped a trade"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" onClick={addNote} disabled={!note.trim()}>
            Record
          </Button>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Event</th>
                <th className="px-3 py-2 text-left font-medium">Symbol</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Realised</th>
                <th className="px-3 py-2 text-left font-medium">Detail</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    Nothing recorded yet. Every order and halt will appear here automatically.
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                      {new Date(e.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn("text-[10px]", severityTone[e.severity])}>
                        {e.eventType.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">{e.symbol ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{e.qty ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {e.price != null ? e.price.toFixed(2) : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-mono tabular-nums",
                        (e.realizedUsd ?? 0) < 0 ? "text-destructive" : (e.realizedUsd ?? 0) > 0 ? "text-primary" : "",
                      )}
                    >
                      {e.realizedUsd != null ? e.realizedUsd.toFixed(2) : "—"}
                    </td>
                    <td className="max-w-md px-3 py-2 text-xs text-muted-foreground">{e.message}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="capitalize">{e.source}</span>
                      {!e.synced && source === "local" && (
                        <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400">pending</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
