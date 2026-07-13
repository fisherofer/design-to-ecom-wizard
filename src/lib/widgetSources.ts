/**
 * Widget Sources Registry
 * =======================
 * Every live widget on the dashboard can now expose a "source" selector so the
 * operator can swap between data providers on the fly (e.g. Alpaca vs Polygon
 * vs an AI consensus). The selection is persisted per widget in localStorage
 * and dispatched via a global event so all instances re-sync.
 *
 * This module is data only — no React. Consumed by the `useWidgetData` hook.
 */

const STORAGE_KEY = "ai-os.widget-sources.v1";
export const WIDGET_SOURCE_EVENT = "ai-os:widget-source-changed";

export type WidgetKind =
  | "breakouts"
  | "news"
  | "movers"
  | "quotes"
  | "fearGreed"
  | "watchlists";

export interface WidgetSource {
  id: string;
  label: string;
  /** Short description shown in the picker. */
  hint?: string;
  /** True when the source is a real, wired provider — false for planned. */
  live?: boolean;
}

export const SOURCE_REGISTRY: Record<WidgetKind, WidgetSource[]> = {
  breakouts: [
    { id: "alpaca", label: "Alpaca AI", hint: "Backend scoring engine", live: true },
    { id: "ai-consensus", label: "AI Consensus", hint: "Merge of Gemini + local Ollama", live: true },
    { id: "finviz", label: "Finviz Elite", hint: "Screener + patterns" },
    { id: "tradingview", label: "TradingView", hint: "Community signals" },
  ],
  news: [
    { id: "alpaca", label: "Alpaca News", live: true },
    { id: "benzinga", label: "Benzinga Pro", hint: "Squawk + rumors" },
    { id: "polygon", label: "Polygon.io" },
    { id: "reuters", label: "Reuters" },
  ],
  movers: [
    { id: "alpaca", label: "Alpaca", live: true },
    { id: "polygon", label: "Polygon.io" },
    { id: "yahoo", label: "Yahoo Finance" },
    { id: "finviz", label: "Finviz" },
  ],
  quotes: [
    { id: "alpaca", label: "Alpaca", live: true },
    { id: "polygon", label: "Polygon.io" },
    { id: "yahoo", label: "Yahoo Finance" },
  ],
  fearGreed: [
    { id: "alpaca", label: "Alpaca / CNN", live: true },
    { id: "cnn", label: "CNN direct" },
    { id: "crypto", label: "Alt Crypto F&G" },
  ],
  watchlists: [
    { id: "alpaca", label: "Alpaca", live: true },
    { id: "local", label: "Local file" },
  ],
};

function readAll(): Partial<Record<WidgetKind, string>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(next: Partial<Record<WidgetKind, string>>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(WIDGET_SOURCE_EVENT));
}

export const widgetSources = {
  get(kind: WidgetKind): string {
    const all = readAll();
    const saved = all[kind];
    if (saved && SOURCE_REGISTRY[kind].some((s) => s.id === saved)) return saved;
    return SOURCE_REGISTRY[kind][0]?.id ?? "alpaca";
  },
  set(kind: WidgetKind, source: string) {
    const all = readAll();
    all[kind] = source;
    writeAll(all);
  },
  list(kind: WidgetKind): WidgetSource[] {
    return SOURCE_REGISTRY[kind];
  },
};
