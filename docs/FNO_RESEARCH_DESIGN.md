# Indian F&O research and decision-support design

Status: accepted product requirements and proposed implementation design, not implemented
scanner functionality. This extends REALTIME_ACCEPTANCE.md. Existing news/quote AI research
is a foundation; it does not satisfy the full F&O scan described here.

Source requirements: user message dated 12 October 2026 and the user-supplied
“different prompt for AI.docx”. The document's prompts are research requirements, not
instructions to execute trades or generate current recommendations without data.
The pasted prompt ends at “CALL WALL …”; further sections were not supplied and must not
be assumed to have been reviewed.

## User outcome

Every trading day, prepare a market-first assessment followed by a coverage-qualified
scan of the currently eligible NSE stock F&O universe. Separate intraday, 1–5 trading-day
swing and 1–3 week positional research. The user decides whether to act. No automatic
execution is authorized by this design. An empty shortlist is a valid result.
The broader long-term expert/fundamental view is context, not another intraday signal.

## Dashboard and research journey

1. Today: current session, data health, market regime, upcoming events and urgent risks.
2. F&O scanner: horizon tabs; eligible/scanned/excluded/missing counts; filters and snapshot
   time; sortable shortlist with reasons. Never label a partial universe scan complete.
3. Stock research: price/volume and timeframe matrix, derivatives/chain, sector/global
   context, fundamentals, news, rollover and attributed external views in separate tabs.
4. Decision card: candidate / wait for confirmation / avoid under current rules /
   insufficient data. Show direction, horizon, supporting/conflicting evidence,
   invalidation conditions, spread/liquidity, events and last verified time. Do not force
   a buy/sell answer. Distinguish stock setup direction from an options strategy decision.
5. Alerts and journal: actionable changes, deduplication, acknowledgement and saved evidence.

Primary screens must not contain generated demonstration prices, seeded account balances
or sample trades. Existing paper fixtures must remain isolated and explicitly identified.
Unknown data is null/unavailable, never zero. Static labels and editable default filters
are configuration, not fabricated market data.

## Editable filters and calculation conventions

Store each saved configuration with tenant, version, author and effective time. Persist
that exact version with every scan. Separate hard exclusions from preferred conditions.

| Parameter | User default | Convention / interpretation |
| --- | --- | --- |
| Bullish price move | >= +1.8% | Cash CMP versus previous official adjusted close; show baseline date |
| Bearish price move | <= -1.8% | Same baseline; never substitute open-to-current silently |
| Futures OI change | >= +10% or <= -10% | Same contract against previous session final OI; aggregate expiry metrics separately |
| Option OI change | >= +10% or <= -10% | Same underlying, expiry, strike and side; separate aggregate chain view |
| Option volume increase | >= +20% | Prior full session comparison labelled as such; same-time comparison requires historical intraday data |
| Delivery preference | >= 50% | Latest published cash delivery quantity / traded quantity; show report date |
| Average cash turnover | >= INR 100 crore | Proposed configurable 20 completed-session mean, not today's partial turnover |
| Option liquidity preference | >= 100,000 contracts | Proposed last completed session across the stock's option contracts; show expiry scope and units |
| RSI | >70 overbought; 60–70 strong; 45–<60 neutral/bullish; 30–<45 weak; <30 oversold | Proposed Wilder RSI(14); endpoint rules make categories non-overlapping |
| EMAs | 10,20,50,100,200 | On the selected timeframe; DOCX specifically requests daily EMAs |
| Timeframes | 5m,15m,1h,daily,weekly,monthly | Daily + weekly primary; 15m + 5m intraday confirmation |

The turnover lookback, RSI period and option-volume aggregation are proposed defaults,
not numbers specified in the supplied prompt. Make them visible and configurable.
Spread limit, minimum depth, slippage allowance, risk budget, maximum candidates and alert
cadence need explicit configuration; do not invent a universal risk tolerance.
OI percent = 100*(current-baseline)/baseline; a missing or zero denominator is unavailable.
Store OI source units (contracts versus underlying units) and effective lot-size history.
Do not compare rolling contract symbols across expiry without a documented methodology.

## Market regime before stocks

Required context: Nifty 50, Bank Nifty, Nifty Financial Services, Nifty Midcap 100,
India VIX, USD/INR, Brent, gold, US close, Asian markets, Europe, GIFT Nifty,
published FII/DII cash activity, overnight events and the seven US technology companies.
Do not confuse participant derivatives positions with cash FII/DII flows.

Requested labels: Strong Bullish, Mild Bullish, Neutral, Mild Bearish, Strong Bearish.
Add Insufficient evidence when required feeds are missing or stale. Neutral is not a
fallback for failed data. Price direction and volatility/risk must be separate displays.
The Magnificent Seven rising is evidence of those stocks rising, not proof India must rise.

A /100 score must be calculated deterministically from a versioned, inspectable model:
trend, breadth, sector participation, derivatives confirmation and global context, with
volatility/event penalties. Show each contribution, source and timestamp. Numeric weights,
regime cutoffs and critical minimum coverage are not yet validated: do not enable a
production strength score until documented and evaluated with point-in-time historical
walk-forward tests. Coverage percentage is separate from market strength and predictive
probability. No fabricated “confidence” percentage. Missing required inputs suppress score.
Strong bearish regimes gate aggressive long candidates; explicit exceptions must have
separate countertrend labels and tighter user-configured risk review.

## Universe and quality gates

Ingest official/current eligible F&O securities, instrument identifiers, contracts,
expiries, lot sizes, sectors, trading calendars and restrictions with effective dates.
Universe is not a fixed list or limited to Nifty 50. Refresh per exchange publication and
retain historical membership for backtests without survivorship bias.
Exclude or quarantine missing/stale/unreliable prices, missing baselines, insufficient
history, excessive spreads, insufficient depth and applicable trading restrictions.
Read current ban/restriction publications; never hardcode a security's status or assume
all restriction types have identical consequences. Report every exclusion reason.

## Derivatives structures

Compute the requested conventional price/OI classifications using futures-contract price
and same-contract OI changes. Show cash-price filter separately to avoid confusing spot
moves with a futures roll/basis change:
- Long build-up: price >= +1.8%, OI >= +10%.
- Short build-up: price <= -1.8%, OI >= +10%.
- Short covering: price >= +1.8%, OI <= -10%.
- Long unwinding: price <= -1.8%, OI <= -10%.
- Otherwise: no threshold-qualified structure / insufficient evidence.
These are descriptive heuristics, not proof of trader intent or future direction.
Option OI increase alone does not establish bullishness or identify writing versus buying.
Any options writing/unwinding inference needs premium/underlying movement and liquidity
context and must be labelled an inference; OI alone cannot establish trade aggressor.

## Option-chain research

Choose current monthly expiry from instrument metadata; fallback to nearest eligible active
expiry only with a displayed reason. Show expiry, lot size, observation time and chain
coverage. Do not mix expiries in PCR, wall or max-pain calculations.
Provide strike/side OI, OI change, volume, IV, bid/ask/depth, OI PCR and volume PCR separately,
PCR change with matching prior snapshot, highest call/put OI and OI-change rankings,
call/put walls and potential support/resistance zones.
Max pain is the strike minimizing expiry intrinsic payout across the observed chain using
consistent contract units. It is a descriptive theoretical statistic, not a target or
pinning guarantee; incomplete chain suppresses it. Include liquidity near the proposed
contract, not just stock-wide volume. Unknown IV is not zero.

## Technical analysis

Calculate indicators in deterministic analytics code from verified OHLCV; Ollama explains
results and conflicts. Separate completed bars from developing live bars. Aggregate session
bars with exchange timezone and partial-hour handling. Never claim a monthly signal from
insufficient history. Record adjusted/unadjusted policy and corporate-action corrections.

Display CMP relative to EMA10/20/50/100/200, which averages bracket price, distances and
alignment across requested timeframes. Session VWAP resets at the actual session boundary.
Daily/weekly/monthly Fibonacci pivots use previous completed period H/L/C:
P=(H+L+C)/3; R/S1=P +/-0.382*(H-L); R/S2=P +/-0.618*(H-L);
R/S3=P +/-1.000*(H-L). Keep these distinct from swing-anchored Fibonacci retracements,
which require visible anchor selection and must not be silently substituted.
Breakout/breakdown candidates require a defined level, completed-bar confirmation,
volume/liquidity and invalidation conditions. RSI overbought alone is not a sell instruction.

## Rollover, fundamentals and external views

Rollover percentage: document chosen convention; proposed (next+far futures OI)/sum of
near+next+far OI *100. Compare identical days-to-expiry with prior month and the prior
three comparable monthly observations; do not compare mid-month with expiry-day values.
Track comparable contract spreads for rollover cost. Show absolute and percentage basis,
reference contract, spot if used, time and optional annualization convention. Costs must
include spread/slippage assumptions when modelling execution, rather than presenting the
quoted basis as a guaranteed executable cost. Missing history disables comparisons.

Fundamentals: 3–5 fiscal years plus latest quarter with reporting date, filing source,
consolidated/standalone basis and restatements. Include revenue/profit/cash flow, leverage,
margins, return ratios, valuation context and material corporate actions. Reconcile fiscal
periods and units; distinguish financial-period date from download date.

External expert opinions require named source, publication date, horizon, accessible
citation and attribution. Do not fabricate expert consensus or present Ollama as an expert
source. Near/short/medium/long horizons must be labelled explicitly; stale views remain
historical. News correlation with price does not prove causation.

## Session workflow and alerts

Pre-market: prior completed-session derivatives/delivery + overnight/global data + event
calendar. No claim of today's completed delivery or options volume.
Opening: provisional gaps and opening range; wait for specified completed 5m/15m bars.
Intraday: update quotes/chain with provider limits, recalculate completed bars, revalidate
liquidity and regime, alert only material state changes. End-of-day: reconcile final data,
refresh swing/positional candidates and save an immutable scan/report version.
Schedule by exchange calendar, not every calendar day. IST display throughout; store UTC.

Persist alerts for newly qualified structures, confirmation/invalidation, regime changes,
earnings/restrictions, abnormal spread, lost feed and stale data. Avoid repeated alerts for
unchanged states. External delivery needs channel credentials, retries and delivery state.
No fully automated trade action is implied by an alert.

## Architecture and data contracts

Provider adapters -> validated, timestamped raw observations -> normalized market storage
-> deterministic analytics -> rule filters/quality gates -> ranked research candidates
-> evidence packet for Ollama -> schema/citation validation -> saved report -> UI/alerts.
Ollama cannot fill missing financial fields, choose invented levels or calculate an
unexplained score. Preserve numerical inputs and sources alongside AI narrative.

Proposed persistence entities: universe versions; instrument/expiry/lot metadata;
corporate actions; OHLCV bars; quote/chain snapshots; futures baselines; delivery reports;
sector/market observations; dated fundamentals; economic/results events; filter profiles;
scan runs/results/exclusions; report evidence; alert delivery records.
Every observation requires source, instrument identity, observation/publish/retrieval times,
session date, unit, adjustment policy, quality and entitlement/delay label where applicable.
Tenant-owned settings/scans/reports retain RLS. Credentials stay server-side and out of logs.
Endpoints proposed: scanner configuration, scan status/results, stock research by horizon,
coverage/universe health and report history. Long full-universe scans are background jobs
with bounded provider concurrency, progress, cancellation and resumable status.

## Implementation order and acceptance

1. Verify entitled data access with representative stocks, chains, histories and restrictions;
   confirm universe-wide quotas before promising a daily full scan.
2. Ingest universe/contracts/baselines/history with source freshness and unit validation.
3. Build deterministic technical, OI, chain, rollover and quality calculations with boundary tests.
4. Add versioned filters, background scanner and complete coverage/exclusion accounting.
5. Evaluate regime/shortlist methodology using historical point-in-time data; expose limitations.
6. Add stock-detail evidence panels, local AI explanation, saved reports and session alerts.
7. Acceptance during real market sessions: pre-open/open/intraday/close, token expiry,
   disconnect/recovery, holiday, missing chain strikes, zero baseline, expiry rollover,
   corporate action, provider rate limits and restricted stocks.

Each displayed figure must trace to a provider observation or reproducible calculation.
Completion requires actual subscribed-provider acceptance testing; fixture tests alone
cannot certify the live F&O workflow. The existing global adapter does not supply this
Indian derivatives dataset simply because it has a key.

## Reference sources reviewed

NSE current eligibility: https://www.nseindia.com/static/products-services/equity-derivatives-selection-criteria
NSE reports (delivery, derivatives and restrictions): https://www.nseindia.com/all-reports
NSE derivatives reports: https://www.nseindia.com/all-reports-derivatives
NSE current ban publication: https://www.nseindia.com/static/products-services/equity-derivatives-risk-management-sec-ban
Use the latest effective exchange notices during implementation; do not freeze today's rules.
