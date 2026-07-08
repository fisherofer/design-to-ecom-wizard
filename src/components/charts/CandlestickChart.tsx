import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import type { AlpacaBar } from "@/lib/alpaca";

interface Props {
  bars: AlpacaBar[];
  height?: number;
}

export function CandlestickChart({ bars, height = 420 }: Props) {
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
    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e && chartRef.current) chartRef.current.applyOptions({ width: e.contentRect.width });
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; };
  }, [bars, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
