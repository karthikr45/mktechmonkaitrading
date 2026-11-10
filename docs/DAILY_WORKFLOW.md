# Daily trading experience — 10 November 2026

## Entry and navigation
The URL opens Trading day. It creates the existing local research session; this
is not production sign-in. Connection failure must be visible, with no demo prices.

| Screen | User question | Action and destination |
|---|---|---|
| Trading day | What matters today? | Read saved briefing, attention items, checklist and market board; investigate a stock |
| Find stocks | Which stocks warrant investigation? | Run current-universe observations; open a selected result in Stock analysis |
| Stock analysis | What evidence supports this idea? | Cash/futures/option OI, chain, news, financials, Ollama explanation; continue to chart |
| Charts & indicators | What is the technical context? | Inspect completed-candle indicators; continue to Backtest |
| Backtest | How did my rules behave historically? | Run the existing limited daily futures study, inspect sample/cost warnings; continue to plan |
| Plan & journal | What is my risk and reasoning? | Save manual entry/stop/target/costs/budget/thesis; continue to Monitor |
| Monitor | What has changed in prices? | View actual selected instruments and received candles; return to review the plan |
| News & alerts | What requires review? | Sources, report generation, coverage, checklist and alert acknowledgment |
| World markets | Which external cues are available? | India/GIFT, US, Asia-Pacific, Europe, FX/risk context and US technology groups |
| Connections | Why is data missing? | Measured service status and explicit ICICI Breeze onboarding gap |

Selected stock is shared through navigation. Scanner results can open current
stock analysis; historical observations are not silently relabeled live.

## Market and news presentation
All quotes come from existing provider endpoints. Show the observation time,
provider quality/session and missing/stale states. Green/red denotes observed
price movement, never a guarantee of Indian market direction. US technology
companies are NVDA, MSFT, GOOGL, AAPL, AMZN, META and TSLA. Regional groups include
Japan, Korea, Taiwan, China, Hong Kong and other Asia-Pacific catalog instruments;
listing an instrument does not establish live coverage. Session labels must come
from available provider metadata, not guessed market hours.

Home displays the persisted research summary and outstanding alerts, refreshed
from the local service every minute while visible. Old/failed research is marked.
Global quotes retain existing provider caching. News & alerts exposes Indian
watchlist news and international evidence; full publisher coverage is not claimed.

## Current release boundary
This redesign organizes implemented tools; it does not implement missing trading
signals. Upstox remains the working adapter. Breeze has a registration/setup
explanation only: account, credentials and adapter implementation are pending.
No live orders, broker positions, automatic protective exits, validated forecasts,
qualified rankings or complete strategy backtesting are implied by the flow.

## Acceptance
- Default landing page is Trading day, with actionable navigation and real empty/error states.
- Scanner stock selection carries into analysis; chart/backtest/plan/monitor share context.
- Backtest is a dedicated destination rather than the first scanner panel.
- Market groups are directly selectable, including US technology and currencies.
- Mobile layout stacks workflow cards and wraps navigation.
- Verify browser flows, stale responses, absent providers and mobile overflow before client acceptance.

## Next implementation gates
1. Unify stock context when editing symbols inside any tool; persist validated selection.
2. Session VWAP and evidence-qualified directional/confirmation signals.
3. Delivery, sector, events, restrictions and full regime/shortlist pipeline.
4. Extended historical validation and paper outcome tracking.
5. Email delivery, broker account integration, supervised execution and recovery.
