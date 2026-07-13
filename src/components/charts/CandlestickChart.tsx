import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type SeriesMarker,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AlpacaBar } from "@/lib/alpaca";

export interface ChartMarker {
  time: number;
  position?: "aboveBar" | "belowBar" | "inBar";
  color?: string;
  shape?: "arrowUp" | "arrowDown" | "circle" | "square";
  text?: string;
}

interface Props {
  bars: AlpacaBar[];
  height?: number;
  markers?: ChartMarker[];
  showMAs?: boolean;
}

function sma(bars: AlpacaBar[], period: number): LineData[] {
  if (bars.length < period) return [];
  const out: LineData[] = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= period) sum -= bars[i - period].c;
    if (i >= period - 1) {
      out.push({ time: bars[i].t as UTCTimestamp, value: sum / period });
    }
  }
  return out;
}

export function CandlestickChart({ bars, height = 420, markers, showMAs = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(200, 210, 220, 0.85)",
        fontFamily: "ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      color: "rgba(59, 130, 246, 0.35)",
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const candleData: CandlestickData[] = bars.map((b) => ({
      time: b.t as UTCTimestamp,
      open: b.o, high: b.h, low: b.l, close: b.c,
    }));
    const volData: HistogramData[] = bars.map((b) => ({
      time: b.t as UTCTimestamp,
      value: b.v,
      color: b.c >= b.o ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
    }));
    candles.setData(candleData);
    volume.setData(volData);

    if (showMAs) {
      const mas: Array<{ p: number; color: string; title: string }> = [
        { p: 20,  color: "#38bdf8", title: "SMA 20" },   // sky
        { p: 50,  color: "#f59e0b", title: "SMA 50" },   // amber
        { p: 150, color: "#a855f7", title: "SMA 150" },  // violet
      ];
      for (const m of mas) {
        const data = sma(bars, m.p);
        if (data.length === 0) continue;
        const line = chart.addSeries(LineSeries, {
          color: m.color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          title: m.title,
        });
        line.setData(data);
      }
    }

    if (markers && markers.length) {
      const sm: SeriesMarker<UTCTimestamp>[] = markers.map((m) => ({
        time: m.time as UTCTimestamp,
        position: m.position ?? "aboveBar",
        color: m.color ?? "#facc15",
        shape: m.shape ?? "arrowDown",
        text: m.text ?? "",
      }));
      createSeriesMarkers(candles, sm);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e && chartRef.current) chartRef.current.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [bars, height, markers, showMAs]);

  return (
    <div className="w-full">
      <div ref={containerRef} className="w-full" style={{ height }} />
      {showMAs && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <LegendDot color="#38bdf8" label="SMA 20" />
          <LegendDot color="#f59e0b" label="SMA 50" />
          <LegendDot color="#a855f7" label="SMA 150" />
          {markers && markers.length > 0 && <LegendDot color="#facc15" label={`Alerts (${markers.length})`} />}
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-4 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
