# Client requirement acceptance — 2026-11-03

The complete client request remains open. Working code is not equivalent to full
production acceptance. The current client-facing research flow uses provider data;
advanced paper/replay tools still contain synthetic fixtures and are not live-data features.

| Master prompt area                           | Implemented and verified                                                                                                                                        | Still required                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1, 30: configurable filters                  | Price/futures OI thresholds; persisted scanner settings; historical-study costs/holding period                                                                  | Independent options-OI filters, score/direction commands and all filter execution                                                        |
| 2: market regime                             | Upstox India/global indices, GIFT Nifty, seven configured US stock snapshots and USD/INR + USD/JPY mappings                                                     | Remaining regional/commodity feeds, confirmed market-session calendars, FII/DII and complete regime scoring                              |
| 3–5: universe, price and futures structure   | Dynamic broker universe, cash/futures observations, four price/OI classes                                                                                       | Official eligibility/ban checks and full liquidity exclusions                                                                            |
| 6–7: chain and OI                            | Expiry-specific strike table, separate cash/futures/option OI changes, PCR/change/walls; contract-list completeness and conditional max pain in Stock workspace | Writing confirmation, independently timestamped chains and verified volume units                                                         |
| 8: technicals                                | On-demand 5m, 15m, 1h, daily, weekly and monthly EMA/RSI/MACD/ADX/ATR                                                                                           | Confirmed crossovers/divergences and scanner qualification integration                                                                   |
| 9: VWAP                                      | Not implemented                                                                                                                                                 | Accurate session VWAP and rejection/breakout tracking                                                                                    |
| 10–11: levels                                | Classic, Fibonacci and Camarilla pivots from completed bars on six frames                                                                                       | Swing selection, Fibonacci retracements, confluence and validated breakout levels                                                        |
| 12: volume                                   | Last completed bar vs previous 20 bars on each frame                                                                                                            | Intraday time-of-day normalized comparisons and breakout confirmation                                                                    |
| 13–15: delivery, sector, fundamentals/news   | RSS/company disclosure and local evidence-linked AI pipeline in part                                                                                            | Delivery reports, sector comparisons, full financial/event coverage                                                                      |
| 16–26: decisions, ranks, trades and warnings | Missing-evidence gating; no fabricated trade qualification                                                                                                      | Full risk-aware scoring, entry/SL/targets, option risk, confidence calibration and warnings                                              |
| 27–29: output and provenance                 | Saved observations/studies, source timestamps, missing fields, EOD vs intraday labels                                                                           | Unified daily report, top-ten/top-five qualified tables, scheduled alerts                                                                |
| Client addition: historical success          | Real active-contract daily futures outcome study, chronological split, costs/slippage, ledger, sample intervals, retained candles and hash                      | Expired contracts, historical universe, intraday/portfolio backtesting, margin, stops, rollover and out-of-sample threshold optimization |
| Word document additions                      | Multi-frame EMA/RSI/pivots                                                                                                                                      | Rollover comparison/cost, 3–5 year fundamentals, attributed expert opinions                                                              |

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

Market charts is now a primary navigation item. Select a current F&O stock symbol
and fetch provider data to display candlesticks, EMA20/EMA50 overlays, volume and
RSI across all six timeframes. Charts retain the latest 120 completed bars and use
the preceding history for indicator warmup. Optional refresh runs every 60 seconds
while the page is visible. It is polling of completed candles, not tick-by-tick charting;
developing candles are excluded and closed sessions remain historical. Refresh
failures retain the prior snapshot with a visible warning. Full live candle building,
pan/zoom and drawing tools remain pending.

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

## Client interface verification — 3 November 2026

The primary interface now exposes Today, Charts & indicators, Live prices,
F&O research & backtests, News & AI research, Global markets, Trade journal,
and Data & AI status. It no longer requests the synthetic `/dashboard` endpoint
or displays paper balances, synthetic charts, sample orders or demo strategy tools.
Legacy paper APIs remain for isolated development tests; they are not client menus.

Actual Upstox WebSocket acceptance returned NIFTY 50 and BANK NIFTY provider
quotes, with exchange status CLOSING_END and inactive last-trade timestamps.
This verifies authorization, subscription, decoding and delivery into the UI,
not continuous open-session tick performance. Tick graphs retain at most 200
received observations per instrument and wait for at least two ticks; no missing
ticks or synthetic history are inserted. Candlestick charts remain completed-bar
snapshots with optional 60-second polling.

Twelve Data returned the configured US-stock snapshots. Global coverage remains
partial; unavailable exchanges are visible. The service status screen checks
PostgreSQL, analytics, Ollama reachability and installed model, plus actual feed
state and global quote coverage. Ollama reachability is not a claim that the latest
briefing succeeded. Full production readiness and complete client coverage remain
subject to the gaps documented above.

## Stock workflow acceptance — 3 November 2026, evening

The default Stock workspace resolves 218 symbols from the current Upstox master.
A single symbol loads cash/futures quotes, previous-session futures OI comparison,
30-second option-chain snapshots and selected-instrument WebSocket controls.
The six-timeframe chart form is preselected to that same stock. The real feed now
subscribes in full mode and handles futures OI, volume and average traded price,
including an OI-only change without a price change. These are provider fields;
full tick reconstruction and a session VWAP rejection/breakout system remain open.

RELIANCE live-provider verification returned 49 strikes, matching the expiry
contract list for 2026-11-23. Cash price change, futures price change, futures OI
change and combined returned option OI change are separate. Max pain is calculated
only when all contract identities/strikes/sides match, lots are uniform, OI exists,
and the payout minimum is unique. It is neither a price forecast nor a freshness
assertion. Old last-trade timestamps cannot become fresh because a REST request
was made recently.

Stock research fetched nine recent articles and seven company/sector ratios.
The initial Ollama report failed validation; tighter bounded output and permitted
citation IDs produced a generated report with three validated findings. Source
financial reporting periods remain unknown. The report and input evidence are
saved to PostgreSQL. A stock can be added to scheduled in-app news monitoring
without manually entering an instrument key. Local monitoring requires the server
to remain running; external notifications are not configured.

Upstox returned GIFT, Hang Seng, Nikkei, Dow, S&P, US Tech 100, FTSE, DAX and CAC,
plus Nifty, Bank Nifty and India VIX. Per-instrument source intervals and actual
trade times are retained. Session closure for international instruments is not
inferred from wall-clock hours; older observations are marked stale. Regional
colour remains gated by coverage. Upstox USDINR/Brent documented keys were rejected
by both V2 full quote and V3 LTP. Twelve Data returned USD/INR and USD/JPY instead;
local mappings were added. Twelve Data's confirmed eight-credit-per-minute limit
is handled with cached per-symbol batches and queued remaining symbols. Each
symbol is normally refreshed every 15 minutes; this is not streaming FX.

**Proven access blocker:** expired-contract history returned HTTP 401 / UDAPI1149,
requiring Upstox Plus. The user has been asked to enable access. No subscription
purchase or credential change is performed by the app.

Still open: China/Korea/Taiwan and remaining market coverage, exact delivery and
turnover reports, FII/DII, events, full market-regime scoring, complete liquidity
and restriction qualification, live candle reconstruction, historical options/
expired futures studies, historical threshold optimization and open-session
acceptance. These are not marked complete by passing transport tests.

Run `pnpm --filter @mk/api exec tsx src/check-stock-live.ts SYMBOL` to exercise
real stock quotes/chain/completeness, source news/ratios and local AI with saved
research evidence. Credentials and `.env` stay local.

## Client workflow repair — 3 November 2026

- Selected stock context is shared across Stock workspace, Charts & indicators,
  Live prices and historical-study entry. The duplicate technical form was removed
  from the scanner screen. Context is retained during menu navigation, not browser reload.
- Selecting a stock subscribes its actual cash and nearest futures instruments.
  The selected-stock panel filters unrelated shared-feed quotes and labels cash
  and futures clearly. Streaming subscription uses configured local credentials;
  it never places an order. The tenant feed is shared: changing subscriptions in
  another tab may require reconnecting the desired stock.
- Global quote observations carry their provider identity into newly generated
  AI evidence. Older saved reports are historical and are not rewritten.
- News links replace raw citation IDs in stock research. The AI prompt explicitly
  rejects inferring bullish sentiment/writing from OI magnitude alone. This is a
  generation constraint, not independent factual verification.
- International headline URLs are deduplicated before display. The alert inbox
  initially shows the five most recent outstanding alerts; older warnings remain
  accessible through Show all. Mobile navigation wraps instead of hiding menus.
- Six-frame technical reports include EMA 10/20/50/100/200 alignment, EMA50/200
  crossovers and MACD/signal crossovers from the last two completed observations.
  Insufficient warmup is explicit. These are not qualified trade recommendations.
- Verification: provider readiness passed PostgreSQL, Upstox sample, global sample
  and local Ollama inference. Real RELIANCE research returned 49 matched strikes,
  nine articles, seven ratios and three generated findings with no snapshot
  failures. Browser checks verified stock-specific feed instruments and stock
  continuity into charts and backtests. Equity markets were closed during checks.

Full release remains open: session VWAP/breakout logic, all liquidity/restriction
checks, complete market regime and rankings, delivery/FII/DII/events, long-term
fundamentals, rollover analysis, full historical backtesting, portfolio/execution
and market-hours endurance still require implementation and acceptance. No new
credentials alone resolve those software gaps.


## Verified implementation checkpoint — 6 November 2026

- Live-price panels now render provider-supplied one-minute OHLC/volume bars.
  Updates merge by timestamp, retain up to 120 observed bars and do not fill gaps.
  Old candles are labeled; initial subscriptions do not reconstruct a full session.
- The Trade journal accepts cash-equity plans with trader-entered entry, stop,
  target, quantity, costs, slippage and risk budget. Server-side calculations
  include costs/slippage in loss and reward, retain the provider snapshot, and
  persist with tenant isolation. These plans do not place orders or validate
  derivatives lots, margin, funds or trade eligibility.
- Stock research fetches annual and quarterly consolidated income statements,
  annual balance sheets and cash flows through existing Upstox access. Values
  retain provider reporting periods and INR-crore units; missing sections stay
  unavailable. Ollama receives these statements as cited evidence.
- Actual RELIANCE acceptance returned all four statement sections: annual
  periods March 2023–March 2026, quarterly periods September 2025–June 2026.
  The latest returned quarter is not asserted to be the latest filed quarter.
  The same run returned 50 matched option strikes, two recent articles, seven
  ratios and three Ollama findings, with no snapshot failures.
- Validation: 74 unit tests, TypeScript checks, lint, production build and
  F&O database integration passed. Dependency checks passed PostgreSQL,
  Upstox authentication, one global quote and local Ollama inference. Local
  web/API/analytics health passed after starting the production build.
- Browser acceptance of this final build remains unverified: Chrome terminated
  during headless launch in the execution environment. Earlier browser checks
  above apply only to their stated checkpoint, not these final changes.

This checkpoint is not full client acceptance. Session VWAP, complete liquidity
and restriction filters, regime scoring/ranking, delivery/FII/DII/events,
rollover, historical threshold validation, complete historical backtesting,
portfolio and live execution remain open. International data coverage is partial.
Expired-contract access previously required Upstox Plus and has not been
reconfirmed. Fundamentals now have provider history, but filing reconciliation
and verification against the latest published results remain open.
