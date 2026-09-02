/**
 * MarketStreamCard — control panel for the real-time market WebSocket.
 *
 * Replaces HTTP polling with a live trade stream (Polygon.io or Alpaca IEX).
 * Credentials stay in this browser/desktop profile; when the stream is live
 * every consumer (dual loop, order ticket, VaR scan) reads streamed ticks
 * first and only falls back to the REST quotes_router.
 */
import { useEffect, useState } from "react";
import { Antenna, PlugZap, Radio, Unplug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  connectStream,
  disconnectStream,
  getStreamConfig,
  getStreamState,
  setStreamConfig,
  STREAM_EVENT,
  type StreamProvider,
} from "@/lib/marketSocket";

const PROVIDERS: Array<{ id: StreamProvider; label: string; hint: string }> = [
  { id: "off", label: "Off (REST polling)", hint: "quotes_router provider chain over HTTP" },
  { id: "polygon", label: "Polygon.io", hint: "wss://socket.polygon.io/stocks · API key" },
  { id: "alpaca_iex", label: "Alpaca IEX", hint: "wss://stream.data.alpaca.markets/v2/iex · key + secret" },
];

export function MarketStreamCard({ symbols }: { symbols: string[] }) {
  const [cfg, setCfg] = useState(getStreamConfig());
  const [state, setState] = useState(getStreamState());

  useEffect(() => {
    const sync = () => {
      setCfg(getStreamConfig());
      setState(getStreamState());
    };
    sync();
    window.addEventListener(STREAM_EVENT, sync);
    return () => window.removeEventListener(STREAM_EVENT, sync);
  }, []);

  useEffect(() => {
    if (cfg.autoConnect && cfg.provider !== "off" && state.status === "disconnected") {
      connectStream(symbols);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.autoConnect, cfg.provider]);

  const tone =
    state.status === "live"
      ? "text-emerald-500"
      : state.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
          <Radio className={cn("h-4 w-4", state.status === "live" && "animate-pulse text-emerald-500")} />
          Market Stream · WebSocket
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant={state.status === "live" ? "default" : state.status === "error" ? "destructive" : "secondary"}>
            {state.status.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="font-mono">
            {state.ticks} ticks
          </Badge>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Label>Provider</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {PROVIDERS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={cfg.provider === p.id ? "secondary" : "ghost"}
                onClick={() => setCfg(setStreamConfig({ provider: p.id }))}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {PROVIDERS.find((p) => p.id === cfg.provider)?.hint}
          </p>
        </div>

        {cfg.provider !== "off" ? (
          <>
            <div>
              <Label htmlFor="ws-key">{cfg.provider === "polygon" ? "Polygon API key" : "Alpaca key id"}</Label>
              <Input
                id="ws-key"
                type="password"
                value={cfg.apiKey}
                onChange={(e) => setCfg(setStreamConfig({ apiKey: e.target.value }))}
              />
            </div>
            {cfg.provider === "alpaca_iex" ? (
              <div>
                <Label htmlFor="ws-secret">Alpaca secret</Label>
                <Input
                  id="ws-secret"
                  type="password"
                  value={cfg.apiSecret}
                  onChange={(e) => setCfg(setStreamConfig({ apiSecret: e.target.value }))}
                />
              </div>
            ) : null}
            <div>
              <Label htmlFor="ws-age">Max tick age (s)</Label>
              <Input
                id="ws-age"
                inputMode="numeric"
                value={String(cfg.maxTickAgeSec)}
                onChange={(e) => setCfg(setStreamConfig({ maxTickAgeSec: Number(e.target.value) || 15 }))}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="gap-2"
          disabled={cfg.provider === "off"}
          onClick={() => {
            connectStream(symbols);
            toast.info(`Connecting ${cfg.provider} stream for ${symbols.length} symbols`);
          }}
        >
          <PlugZap className="h-3.5 w-3.5" />
          Connect
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => {
            disconnectStream();
            toast.info("Stream disconnected — falling back to REST polling");
          }}
        >
          <Unplug className="h-3.5 w-3.5" />
          Disconnect
        </Button>
        <Button
          size="sm"
          variant={cfg.autoConnect ? "secondary" : "ghost"}
          className="gap-2"
          onClick={() => setCfg(setStreamConfig({ autoConnect: !cfg.autoConnect }))}
        >
          <Antenna className="h-3.5 w-3.5" />
          Auto-connect {cfg.autoConnect ? "on" : "off"}
        </Button>
      </div>

      <p className={cn("mt-2 text-[11px]", tone)}>
        {state.error
          ? state.error
          : state.status === "live"
            ? `Streaming ${state.symbols.length} symbols · last tick ${
                state.lastTickAt ? new Date(state.lastTickAt * 1000).toLocaleTimeString() : "—"
              } · ${state.reconnects} reconnects`
            : "Not streaming — the app is using REST snapshots from quotes_router."}
      </p>
    </section>
  );
}
