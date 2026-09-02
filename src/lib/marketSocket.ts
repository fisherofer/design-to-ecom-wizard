/**
 * marketSocket — real streaming market data over WebSocket.
 *
 * Replaces HTTP polling for the symbols the app actually watches. Two real
 * providers are supported, both connected directly from the client because
 * this is a local-first desktop/portable app:
 *
 *   • Polygon.io      wss://socket.polygon.io/stocks        (auth → subscribe T.*)
 *   • Alpaca IEX      wss://stream.data.alpaca.markets/v2/iex (auth → subscribe trades)
 *
 * The socket keeps an in-memory tick cache. `liveQuotes.fetchQuotes()` reads
 * that cache first and only falls back to the REST quotes_router when the
 * stream is off, stale, or missing a symbol. Prices are never fabricated.
 */

export type StreamProvider = "polygon" | "alpaca_iex" | "off";

export interface StreamConfig {
  provider: StreamProvider;
  /** Polygon API key, or Alpaca key id. */
  apiKey: string;
  /** Alpaca secret key (unused for Polygon). */
  apiSecret: string;
  /** Ticks older than this are treated as stale and ignored. */
  maxTickAgeSec: number;
  autoConnect: boolean;
}

export interface StreamTick {
  symbol: string;
  price: number;
  size?: number;
  /** epoch seconds */
  ts: number;
  provider: string;
}

export type StreamStatus =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "live"
  | "error";

export interface StreamState {
  status: StreamStatus;
  provider: StreamProvider;
  symbols: string[];
  ticks: number;
  lastTickAt: number | null;
  error: string | null;
  reconnects: number;
}

const CFG_KEY = "ofer.market.socket.cfg.v1";
export const STREAM_EVENT = "ofer:market-socket-changed";

const DEFAULT_CFG: StreamConfig = {
  provider: "off",
  apiKey: "",
  apiSecret: "",
  maxTickAgeSec: 15,
  autoConnect: false,
};

export function getStreamConfig(): StreamConfig {
  if (typeof window === "undefined") return DEFAULT_CFG;
  try {
    const raw = window.localStorage.getItem(CFG_KEY);
    return raw ? { ...DEFAULT_CFG, ...(JSON.parse(raw) as Partial<StreamConfig>) } : DEFAULT_CFG;
  } catch {
    return DEFAULT_CFG;
  }
}

export function setStreamConfig(patch: Partial<StreamConfig>): StreamConfig {
  const next = { ...getStreamConfig(), ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CFG_KEY, JSON.stringify(next));
  }
  emit();
  return next;
}

/* ------------------------------------------------------------------ *
 * Runtime
 * ------------------------------------------------------------------ */

const cache = new Map<string, StreamTick>();
let socket: WebSocket | null = null;
let wanted: string[] = [];
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const state: StreamState = {
  status: "disconnected",
  provider: "off",
  symbols: [],
  ticks: 0,
  lastTickAt: null,
  error: null,
  reconnects: 0,
};

function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STREAM_EVENT));
}

function set(patch: Partial<StreamState>) {
  Object.assign(state, patch);
  emit();
}

export function getStreamState(): StreamState {
  return { ...state, symbols: [...state.symbols] };
}

/** Fresh cached tick for a symbol, or null when absent/stale. */
export function getStreamTick(symbol: string, maxAgeSec?: number): StreamTick | null {
  const tick = cache.get(symbol.toUpperCase());
  if (!tick) return null;
  const limit = maxAgeSec ?? getStreamConfig().maxTickAgeSec;
  if (Date.now() / 1000 - tick.ts > limit) return null;
  return tick;
}

/** All fresh cached ticks for the requested symbols. */
export function getStreamTicks(symbols: string[]): Record<string, StreamTick> {
  const out: Record<string, StreamTick> = {};
  symbols.forEach((s) => {
    const t = getStreamTick(s);
    if (t) out[s.toUpperCase()] = t;
  });
  return out;
}

function record(tick: StreamTick) {
  if (!tick.symbol || !(tick.price > 0)) return;
  cache.set(tick.symbol.toUpperCase(), tick);
  state.ticks += 1;
  state.lastTickAt = tick.ts;
  // Throttle re-render notifications to ~4/s.
  scheduleNotify();
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNotify() {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    emit();
  }, 250);
}

function endpoint(cfg: StreamConfig): string {
  return cfg.provider === "polygon"
    ? "wss://socket.polygon.io/stocks"
    : "wss://stream.data.alpaca.markets/v2/iex";
}

function authPayload(cfg: StreamConfig): string {
  return cfg.provider === "polygon"
    ? JSON.stringify({ action: "auth", params: cfg.apiKey })
    : JSON.stringify({ action: "auth", key: cfg.apiKey, secret: cfg.apiSecret });
}

function subscribePayload(cfg: StreamConfig, symbols: string[]): string {
  return cfg.provider === "polygon"
    ? JSON.stringify({ action: "subscribe", params: symbols.map((s) => `T.${s}`).join(",") })
    : JSON.stringify({ action: "subscribe", trades: symbols, quotes: [] });
}

function handleMessage(cfg: StreamConfig, raw: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const messages = Array.isArray(parsed) ? parsed : [parsed];

  messages.forEach((m) => {
    const msg = m as Record<string, unknown>;

    // ---- control frames -------------------------------------------------
    const ev = String(msg["ev"] ?? msg["T"] ?? "");
    if (ev === "status" || ev === "success" || ev === "error" || ev === "subscription") {
      const status = String(msg["status"] ?? msg["msg"] ?? "");
      const text = String(msg["message"] ?? msg["msg"] ?? "");
      if (ev === "error" || status === "auth_failed") {
        set({ status: "error", error: text || "authentication failed" });
        return;
      }
      if (status === "auth_success" || text === "authenticated") {
        set({ status: "live", error: null });
        send(subscribePayload(cfg, wanted));
        return;
      }
      if (status === "connected" || text === "connected") {
        set({ status: "authenticating" });
        send(authPayload(cfg));
      }
      return;
    }

    // ---- trade frames ---------------------------------------------------
    if (cfg.provider === "polygon" && ev === "T") {
      record({
        symbol: String(msg["sym"] ?? ""),
        price: Number(msg["p"] ?? 0),
        size: Number(msg["s"] ?? 0),
        ts: Number(msg["t"] ?? Date.now()) / 1000,
        provider: "polygon",
      });
      return;
    }
    if (cfg.provider === "alpaca_iex" && ev === "t") {
      record({
        symbol: String(msg["S"] ?? ""),
        price: Number(msg["p"] ?? 0),
        size: Number(msg["s"] ?? 0),
        ts: msg["t"] ? new Date(String(msg["t"])).getTime() / 1000 : Date.now() / 1000,
        provider: "alpaca_iex",
      });
    }
  });
}

function send(payload: string) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(payload);
}

/** Opens (or re-opens) the stream for the given symbols. */
export function connectStream(symbols: string[]): StreamState {
  const cfg = getStreamConfig();
  wanted = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);

  if (typeof window === "undefined") return getStreamState();
  if (cfg.provider === "off") {
    set({ status: "disconnected", provider: "off", symbols: wanted, error: "Streaming provider is off" });
    return getStreamState();
  }
  if (!cfg.apiKey || (cfg.provider === "alpaca_iex" && !cfg.apiSecret)) {
    set({ status: "error", provider: cfg.provider, symbols: wanted, error: "Missing stream credentials" });
    return getStreamState();
  }

  disconnectStream(true);
  set({ status: "connecting", provider: cfg.provider, symbols: wanted, error: null });

  try {
    socket = new WebSocket(endpoint(cfg));
  } catch (err) {
    set({ status: "error", error: (err as Error).message });
    return getStreamState();
  }

  socket.onopen = () => {
    retry = 0;
    set({ status: "authenticating", error: null });
    send(authPayload(cfg));
  };
  socket.onmessage = (e) => handleMessage(cfg, String(e.data));
  socket.onerror = () => set({ status: "error", error: "WebSocket transport error" });
  socket.onclose = () => {
    socket = null;
    if (state.status === "disconnected") return; // deliberate stop
    set({ status: "connecting", error: "Connection closed — reconnecting" });
    scheduleReconnect();
  };

  return getStreamState();
}

function scheduleReconnect() {
  if (retryTimer) return;
  retry += 1;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(retry, 5));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    state.reconnects += 1;
    connectStream(wanted);
  }, delay);
}

export function disconnectStream(silent = false): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const s = socket;
  socket = null;
  if (s) {
    s.onclose = null;
    s.onerror = null;
    s.onmessage = null;
    try {
      s.close();
    } catch {
      /* ignore */
    }
  }
  if (!silent) set({ status: "disconnected", error: null });
}

export function isStreamLive(): boolean {
  return state.status === "live";
}

export function clearStreamCache(): void {
  cache.clear();
}
