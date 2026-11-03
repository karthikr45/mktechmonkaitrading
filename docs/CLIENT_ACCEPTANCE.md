# Client requirement acceptance — 2026-11-03

The complete client request remains open. Working code is not equivalent to full
production acceptance. The current client-facing research flow uses provider data;
advanced paper/replay tools still contain synthetic fixtures and are not live-data features.

| Master prompt area | Implemented and verified | Still required |
| --- | --- | --- |
| 1, 30: configurable filters | Price/futures OI thresholds; persisted scanner settings; historical-study costs/holding period | Independent options-OI filters, score/direction commands and all filter execution |
| 2: market regime | Global snapshot framework, seven configured US stock quotes | All regional feeds, FII/DII, complete regime scoring |
| 3–5: universe, price and futures structure | Dynamic broker universe, cash/futures observations, four price/OI classes | Official eligibility/ban checks and full liquidity exclusions |
| 6–7: chain and OI | Expiry-specific returned-strike OI/PCR/walls; futures OI displayed separately | Complete-chain verification, max pain, full contract-level UI and writing confirmation |
| 8: technicals | On-demand 5m, 15m, 1h, daily, weekly and monthly EMA/RSI/MACD/ADX/ATR | Confirmed crossovers/divergences and scanner qualification integration |
| 9: VWAP | Not implemented | Accurate session VWAP and rejection/breakout tracking |
| 10–11: levels | Classic, Fibonacci and Camarilla pivots from completed bars on six frames | Swing selection, Fibonacci retracements, confluence and validated breakout levels |
| 12: volume | Last completed bar vs previous 20 bars on each frame | Intraday time-of-day normalized comparisons and breakout confirmation |
| 13–15: delivery, sector, fundamentals/news | RSS/company disclosure and local evidence-linked AI pipeline in part | Delivery reports, sector comparisons, full financial/event coverage |
| 16–26: decisions, ranks, trades and warnings | Missing-evidence gating; no fabricated trade qualification | Full risk-aware scoring, entry/SL/targets, option risk, confidence calibration and warnings |
| 27–29: output and provenance | Saved observations/studies, source timestamps, missing fields, EOD vs intraday labels | Unified daily report, top-ten/top-five qualified tables, scheduled alerts |
| Client addition: historical success | Real active-contract daily futures outcome study, chronological split, costs/slippage, ledger, sample intervals, retained candles and hash | Expired contracts, historical universe, intraday/portfolio backtesting, margin, stops, rollover and out-of-sample threshold optimization |
| Word document additions | Multi-frame EMA/RSI/pivots | Rollover comparison/cost, 3–5 year fundamentals, attributed expert opinions |

## Verification performed

- Unit tests verify indicators, incomplete-candle exclusion, next-session execution,
  split boundaries, missing-OI handling, non-overlapping positions and costs.
- PostgreSQL integration tests verify saved studies, retained inputs, restart reads
  and tenant isolation using isolated fixture tenants.
- Actual Upstox RELIANCE requests returned all six timeframes: 1,500 five-minute,
  500 fifteen-minute, 412 hourly, 2,032 daily, 1,000 weekly and 296 monthly completed
  candles at the time of verification. These counts are observed, not configured.
- The actual active futures contract returned 46 completed daily bars. Default
  thresholds generated three earlier-period trades and zero later-period trades.
  This is insufficient evidence for a historical-success claim.

## How to exercise the new flows

Open F&O scanner. Enter an exchange stock symbol under six-timeframe technical
analysis and choose Analyse stock. The response is an on-demand snapshot; it does
not become a continuously streaming signal. Current EOD/week/month bars are excluded.

Under Historical futures price/OI study, enter a current F&O stock symbol, review
price/OI thresholds, holding sessions and costs, then run. Open saved studies to
inspect the two periods and execution ledger. This is a current-contract EOD study,
not an options strategy or margined portfolio simulation. No trade is placed.

CLI provider acceptance: `pnpm --filter @mk/api exec tsx src/check-fno-live.ts SYMBOL`.
This makes real provider requests and saves real reports in the local demo tenant.
Database fixture acceptance: `pnpm --filter @mk/api exec tsx src/check-fno.ts`.
