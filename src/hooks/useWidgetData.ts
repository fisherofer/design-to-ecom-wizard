/**
 * useWidgetData
 * =============
 * Common lifecycle for every dashboard widget:
 *  - Fetches data with the currently-selected source.
 *  - Tracks `updatedAt` and the countdown to the next refresh.
 *  - Reacts to the global "Refresh" button + interval changes + source swaps.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRefreshInterval, type ComponentId } from "@/lib/refreshIntervals";
import { widgetSources, WIDGET_SOURCE_EVENT, type WidgetKind } from "@/lib/widgetSources";
import { DASHBOARD_REFRESH_EVENT } from "@/components/dashboard/RefreshButton";

interface Options<T> {
  kind: WidgetKind;
  refreshId: ComponentId;
  fetcher: (source: string) => Promise<T>;
  initial: T;
}

export interface WidgetDataState<T> {
  data: T;
  loading: boolean;
  updatedAt: number | null;
  intervalMs: number;
  nextInMs: number;
  source: string;
  setSource: (s: string) => void;
  refresh: () => void;
}

export function useWidgetData<T>({ kind, refreshId, fetcher, initial }: Options<T>): WidgetDataState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [source, setSourceState] = useState<string>(() => widgetSources.get(kind));
  const [nextInMs, setNextInMs] = useState<number>(0);
  const intervalMs = useRefreshInterval(refreshId);
  const lastLoadedAt = useRef<number>(0);

  // Pin the fetcher in a ref so inline arrow functions at call sites don't
  // recreate `load` and retrigger the initial-load effect on every render
  // (that caused ~1 req/s per widget regardless of the configured interval).
  const fetcherRef = useRef(fetcher);
  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);

  // In-flight guard + minimum gap between calls — a defensive rate-limit that
  // protects the backend even if upstream events fire in a tight loop.
  const inFlight = useRef(false);
  const MIN_GAP_MS = 2_000;

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (Date.now() - lastLoadedAt.current < MIN_GAP_MS) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const next = await fetcherRef.current(source);
      setData(next);
      const now = Date.now();
      setUpdatedAt(now);
      lastLoadedAt.current = now;
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [source]);

  // Initial fetch + on source change
  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh timer — honors the interval configured in Settings → Refresh.
  useEffect(() => {
    if (intervalMs <= 0) return;
    const safe = Math.max(intervalMs, MIN_GAP_MS);
    const id = window.setInterval(load, safe);
    return () => window.clearInterval(id);
  }, [intervalMs, load]);

  // React to dashboard-wide manual refresh + source-changed events
  useEffect(() => {
    const onManual = () => load();
    const onSource = () => {
      const next = widgetSources.get(kind);
      setSourceState(next);
    };
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onManual);
    window.addEventListener(WIDGET_SOURCE_EVENT, onSource);
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onManual);
      window.removeEventListener(WIDGET_SOURCE_EVENT, onSource);
    };
  }, [kind, load]);

  // Countdown ticker
  useEffect(() => {
    if (intervalMs <= 0 || !updatedAt) { setNextInMs(0); return; }
    const tick = () => {
      const elapsed = Date.now() - (lastLoadedAt.current || updatedAt);
      setNextInMs(Math.max(0, intervalMs - elapsed));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [intervalMs, updatedAt]);

  const setSource = useCallback((s: string) => {
    widgetSources.set(kind, s);
    setSourceState(s);
  }, [kind]);

  return { data, loading, updatedAt, intervalMs, nextInMs, source, setSource, refresh: load };
}

export function formatShortAgo(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
