# OctoBot & Open-Source Trading — Learnings Applied

Notes from reviewing OctoBot, Freqtrade, Jesse, Hummingbot, and Nautilus
Trader — filtered for what we can reuse in OferTradingBot.

## 1. Provider abstraction (OctoBot exchanges / Freqtrade exchange layer)
- Every exchange/data source is a **connector** implementing a small
  interface (`fetch_ticker`, `fetch_ohlcv`, `place_order`).
- Config lives in one file; the engine picks a connector by *category*
  (spot/futures/paper) — not by hard-coded names.
- **Applied**: `src/lib/providerConnectors.ts` + `providerRegistry.ts`
  give us the same shape (LLM & Data families, categories, priority,
  live health, budget-aware pick).

## 2. Category-based routing (OctoBot `tentacles`)
- OctoBot groups plugins into categories (trading modes, evaluators,
  services). The core doesn't know provider names — it asks the category
  for a candidate.
- **Applied**: `pickConnector(category, {task, sensitivity})` — the
  Compute Router decides local vs cloud, then the registry picks the
  highest-priority healthy connector in that category.

## 3. Trailing / drawdown alerts (Freqtrade `edge` + trailing stop)
- Trailing-percent + peak/trough tracking, per-symbol runtime state
  persisted across restarts.
- **Applied**: already in `src/lib/alerts.ts` (trailing %, drawdown,
  volume spike, RSI, MA cross, ATR breakout).

## 4. Signal explainability (Jesse, Nautilus reports)
- Every signal carries a *why* — feature contributions, thresholds hit.
- **Applied**: `alertChannels` + AI signal rules already include a
  `reason` field; pick simulator prints a decision trace.

## 5. Budget / rate-limit guardrails (Hummingbot gateway)
- Every outbound call passes through a budget check before hitting the
  wire; failing calls back off exponentially.
- **Applied**: `apiBudget.canSpend()` + `rateLimits` snapshot; the
  registry's `execute()` records real spend on success.

## 6. Hybrid local/cloud compute (OctoBot cloud strategies)
- Heavy backtests run cloud-side, live tick evaluation runs locally.
- **Applied**: `computeRouter` hybrid mode; `pickConnector` respects the
  router's verdict when choosing between `llm.local` and `llm.cloud`.

## Still to port (backlog)
- **Strategy DSL** (Freqtrade's Python strategies / OctoBot's YAML
  tentacles) — a small JSON strategy schema so users can define
  "buy when RSI<30 and volume>2×avg" without code.
- **Paper-trading loop** with a deterministic replay of historical ticks
  through the same connector interface.
- **Portfolio risk sizing** (Kelly / volatility target) — Nautilus and
  Jesse both ship this; today we only have static % sizing.
- **Notification templating** — Freqtrade's Jinja templates for
  Telegram; we send raw strings today.
