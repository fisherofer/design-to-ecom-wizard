/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';

export const tradingRouter = Router();

let services = [
  {
    name: 'FastAPI Backend Engine',
    active: true,
    port: 8000,
    pid: 14202,
    logs: [
      '[INFO] Bootstrapping OFERTRADINGBOT on dynamic runtime path',
      '[INFO] bootstrapper.py: Scanning requirements.txt',
      '[INFO] VENV Manager active: All dependencies verified.',
      '[INFO] SQLite connected at trading.db',
      '[INFO] FastAPI starting on http://127.0.0.1:8000',
    ],
  },
  {
    name: 'Alpaca Trade Bot (Paper Trading)',
    active: false,
    port: undefined,
    pid: undefined,
    logs: [
      '[INFO] Initializing Alpaca Client on endpoint: https://paper-api.alpaca.markets',
      '[INFO] Fetching account details: Status ACTIVE, Buying Power: $100,000.00',
      '[INFO] Bot paused by RiskManager: High-volatility market warning.',
    ],
  },
  {
    name: 'Local Ollama Connection',
    active: true,
    port: 11434,
    pid: 9844,
    logs: [
      '[INFO] Testing local ping to http://127.0.0.1:11434',
      '[INFO] Ollama ping SUCCESS: model "qwen2.5-coder:7b" is available',
      '[INFO] Local model context verified: 32K window supported.',
    ],
  },
];

let tradeSignals = [
  {
    id: 'SIG-1092',
    timestamp: new Date().toISOString(),
    strategy: 'WhaleTracker',
    action: 'BUY',
    asset: 'BTC',
    price: 61250.0,
    quantity: 0.15,
    status: 'EXECUTED',
    reason: 'Heavy whale accumulation detected on order book',
  },
  {
    id: 'SIG-1093',
    timestamp: new Date().toISOString(),
    strategy: 'AlphaHunter',
    action: 'BUY',
    asset: 'ETH',
    price: 3410.5,
    quantity: 2.5,
    status: 'EXECUTED',
    reason: 'Bullish engulfing candle matched with 5-minute VWAP breakout',
  }
];

let tradingMetrics = [
  { timestamp: '01:00', portfolioValue: 100000, cash: 100000, pnl: 0, signalStrength: 45 },
  { timestamp: '01:15', portfolioValue: 100150, cash: 90812, pnl: 150, signalStrength: 65 },
  { timestamp: '01:30', portfolioValue: 100220, cash: 90812, pnl: 220, signalStrength: 72 },
  { timestamp: '01:45', portfolioValue: 100580, cash: 82285, pnl: 580, signalStrength: 80 },
  { timestamp: '02:00', portfolioValue: 100410, cash: 82285, pnl: 410, signalStrength: 52 },
  { timestamp: '02:05', portfolioValue: 100650, cash: 99349, pnl: 650, signalStrength: 60 },
];

tradingRouter.get('/services', (req: Request, res: Response) => {
  res.json(services);
});

tradingRouter.post('/services/toggle', (req: Request, res: Response) => {
  const { name } = req.body;
  const service = services.find((s) => s.name === name);
  if (service) {
    service.active = !service.active;
    if (service.active) {
      service.pid = Math.floor(Math.random() * 8000) + 1000;
      service.logs.push(`[INFO] ${new Date().toISOString()} - Service ${name} STARTED manually.`);
    } else {
      service.pid = undefined;
      service.logs.push(`[INFO] ${new Date().toISOString()} - Service ${name} STOPPED manually.`);
    }
  }
  res.json({ success: true, services });
});

tradingRouter.get('/trade-signals', (req: Request, res: Response) => {
  res.json(tradeSignals);
});

tradingRouter.get('/trading-metrics', (req: Request, res: Response) => {
  res.json(tradingMetrics);
});

tradingRouter.get('/trading/status', (req: Request, res: Response) => {
  res.json({
    metrics: tradingMetrics,
    signals: tradeSignals,
    stats: {
      totalTrades: tradeSignals.length,
      winRate: '66.7%',
      pnlPercent: '+0.65%',
      runningTime: '02h 05m',
      portfolioValue: tradingMetrics[tradingMetrics.length - 1].portfolioValue,
    },
  });
});

tradingRouter.post('/trading/simulate-signal', (req: Request, res: Response) => {
  const { strategy, action, asset, price, quantity, reason } = req.body;
  if (!strategy || !action || !asset || !price || !quantity) {
    return res.status(400).json({ error: 'Missing signal parameters' });
  }

  const newSignal = {
    id: `SIG-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: new Date().toISOString(),
    strategy,
    action,
    asset,
    price: Number(price),
    quantity: Number(quantity),
    status: 'EXECUTED' as const,
    reason: reason || 'Simulated user trigger signal',
  };

  tradeSignals.unshift(newSignal);

  const lastMetric = tradingMetrics[tradingMetrics.length - 1];
  const delta = action === 'BUY' ? -price * quantity : price * quantity;
  const pnlDelta = action === 'SELL' ? (price - 140) * quantity : 0;
  
  const nextMetric = {
    timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    portfolioValue: lastMetric.portfolioValue + (pnlDelta > 0 ? pnlDelta : 50),
    cash: lastMetric.cash + delta,
    pnl: lastMetric.pnl + (pnlDelta > 0 ? pnlDelta : 50),
    signalStrength: Math.floor(20 + Math.random() * 75),
  };
  tradingMetrics.push(nextMetric);
  if (tradingMetrics.length > 15) tradingMetrics.shift();

  res.json({ success: true, signals: tradeSignals, metrics: tradingMetrics });
});
