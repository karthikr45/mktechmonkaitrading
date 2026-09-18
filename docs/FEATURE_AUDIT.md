# MKTechMonk feature audit and local readiness

Assessment date: 18 September 2026.

**The complete proposal has not been achieved.** The current application is a locally runnable, PostgreSQL-backed paper-trading and research foundation. It is not a complete AI trading platform, a live-market terminal, or a production-approved execution system.

The source proposal is `MKTechMonk_Complete_AI_Trading_Proposal_Cloud.docx`, dated 17 September 2026. Its functional sections are compared below with inspected code and observed local tests. The user's latest instruction selects local operation and native PostgreSQL; the cloud and commercial statements in the document were treated as reference content, not new execution instructions.

## Local application now working

- Web: http://127.0.0.1:3200
- API: http://127.0.0.1:4200/api-docs
- Analytics: http://127.0.0.1:8200/docs
- Database: `mktechmonk_local` on the existing PostgreSQL 14.19 server at loopback port 5432.
- Application role: `mktechmonk_app`, without superuser or RLS-bypass privileges. Credentials are in the repository's ignored `.env`, mode 600.
- No PostgreSQL Docker container is required or configured. The working paper/research path requires no Docker service.
- PostgreSQL orders, balances, executions, cash ledger, kill switch, audit, local sessions, strategies, journals and research records survive service restarts.
- Existing unrelated databases were not modified. Automated checks create labeled test tenants only in the new application database. A separately named restore-verification database contains the tested backup.

## Proposal comparison

“Working locally” applies only to the specific row, not to the entire proposal section. “Partial” means significant behavior remains missing. “Missing” includes code that has not been implemented, not just missing credentials. No completion percentage is claimed.

| Proposal section | Requirement | Status | Evidence or remaining work |
|---|---|---|---|
| 2.1 | ICICI Breeze authentication, feeds, account and order operations | Missing | Unavailable adapter only; official broker implementation and contract tests remain. |
| 2.1 | Angel SmartAPI authentication, feeds and account/order operations | Missing | Unavailable adapter only. |
| 2.1 | FYERS authentication, market/order sockets and execution | Missing | Unavailable adapter only. |
| 2.1 | Unified broker abstraction | Partial | Working paper interface; full capability and renewal methods absent. |
| 2.1 | Broker health, expiry warnings and reconnect | Missing | Static unavailable status for real brokers; no live session renewal. |
| 2.1 | Broker positions/orders reconciliation | Missing | Paper positions are derived from persisted fills; no broker reconciliation. |
| 2.1 | Idempotency | Working locally | Tenant-scoped unique order keys and serialized PostgreSQL transactions; concurrent paper approvals tested. |
| 2.1 | Order/authentication audit | Partial | Protected database audit for local sessions, draft/risk/approval/fill; real broker lifecycle absent. |
| 2.2 | Entitled NSE/BSE instruments and segments | Missing | Only clearly labeled synthetic DEMO-NIFTY buy orders execute. |
| 2.2 | WebSocket ticks, OHLCV, volume, depth, OI, option chain | Missing | Seeded synthetic price replay exists; no live ingestion or complete candles/options dataset. |
| 2.2 | VIX, sectors, announcements, events and institutional data | Missing | No official/entitled provider integrations. |
| 2.2 | Retention and Parquet archive | Missing | No archive worker, retention jobs or MinIO/S3 integration. |
| 2.2 | Historical import, corporate actions and quality reports | Missing | No licensed file importer or adjustment engine. |
| 2.3 | Market overview and connection status | Partial | Synthetic dashboard and honest unavailable provider labels. |
| 2.3 | Watchlists and saved screens | Missing | Not implemented. |
| 2.3 | Candlestick/volume/multitimeframe charts | Missing | Current chart is a synthetic price line. |
| 2.3 | SMA and EMA | Working locally | Versioned Python calculations with golden tests; endpoints accessible through research API. |
| 2.3 | VWAP, RSI, MACD, ATR, Bollinger, Supertrend, ADX, stochastic, pivots/support | Missing | Not implemented. |
| 2.3 | Price/volume/volatility/gap/momentum/breakout screeners | Partial | One deterministic SMA comparison in replay; no configurable screener engine. |
| 2.3 | Breadth, sector performance, gainers/losers | Missing | Not implemented. |
| 2.3 | TradingView webhook and licensed charts | Missing | Not implemented; no TradingView integration implied. |
| 2.4 | Live option chain, volume and OI changes | Missing | No option-chain provider. |
| 2.4 | Option pricing and Greeks | Partial | European call/put, Delta/Gamma/Vega API and call calculator UI. Theta, IV inversion and full Greeks suite absent. |
| 2.4 | PCR, IV skew, max pain and build-up classification | Missing | Not implemented. |
| 2.4 | Multi-leg expiry payoff | Partial | Decimal payoff endpoint and vertical-spread golden test; full builder, plots and margin absent. |
| 2.4 | Named option templates and custom strategy builder | Missing | No complete template/builder UX. |
| 2.4 | Probability of profit and adjustments | Missing | Not implemented. |
| 2.5 | Rule-based strategy definitions | Partial | Validated SMA JSON schema and persisted v1 definitions; full DSL/editor absent. |
| 2.5 | Backtesting with costs and slippage | Partial | Working one-unit SMA research backtest with next-observation fills and basis-point costs; Indian tax schedule and broad execution models absent. |
| 2.5 | Walk-forward and out-of-sample evaluation | Missing | Not implemented. |
| 2.5 | Paper trading with live data | Missing | Working paper trading uses synthetic replay only. |
| 2.5 | Performance reports | Partial | Return, drawdown, costs, equity array and trade list; Sharpe/Sortino, expectancy, profit factor and full reports absent. |
| 2.5 | Versioning, comparison and export | Partial | Immutable v1 strategy/research records; editing/version promotion, comparison and CSV/PDF export absent. |
| 2.5 | Overfitting/data warnings | Partial | Insufficient-sample/research warnings; statistical overfitting and dataset-quality analysis absent. |
| 2.6 | Funds, quantity, order value, price deviation and duplicate validation | Working locally | Deterministic paper checks with approval-time revalidation; durable cash, fills and ledger. |
| 2.6 | Margin, market hours, live staleness, loss and exposure validation | Partial | Some policy functions exist but portfolio/loss/calendar inputs are not fully implemented; not production eligible. |
| 2.6 | Stops, targets, trailing/time exits and position sizing | Missing | Strategy descriptions include planned stop/target; those rules do not execute. |
| 2.6 | Options premium, defined-loss, Greeks, hedges and expiry risk | Missing | Not implemented. |
| 2.6 | Execution modes | Partial | Manual paper draft and approval only. AI drafts, live orders and supervised automation absent. |
| 2.6 | Kill switch and emergency controls | Partial | Durable global paper kill switch tested across connections; strategy/broker-disconnect emergency workflows absent. |
| 2.7 | Licensed news/fundamental/social providers | Missing | No Reuters/LSEG, permitted RSS, announcements, fundamentals, X or Meta adapters are connected. |
| 2.7 | News deduplication/mapping/recency/confidence | Missing | Not implemented. |
| 2.8 | Browser/email/messaging alerts | Missing | No connected delivery adapters or alert lifecycle. |
| 2.8 | Trade journal | Partial | Persistent notes/tags and optional API order link; attachments, emotions and AI review absent. |
| 2.8 | P&L/risk/strategy/periodic reports | Partial | Saved research history and paper positions; periodic generation and full P&L analytics absent. |
| 2.8 | AI summaries and CSV/PDF exports | Missing | Not implemented. |
| 3 | OpenAI/Ollama gateway and embeddings/RAG | Missing | Explicitly unavailable; no provider calls, retrieval or AI execution authority. |
| 3 | Logistic regression, XGBoost and LightGBM | Missing | No training/evaluation pipeline. |
| 3 | Calibration, regime classification, Isolation Forest, FinBERT, SHAP | Missing | Not implemented. |
| 3 | MLflow registry, drift and production gating | Missing | Infrastructure config/documented lifecycle only; no running integrated ML system. |
| 3 | QuantLib validation and pgvector | Missing | Options reference tests exist; QuantLib absent. Local server has no pgvector extension. |
| 3.1–3.2 | Structured AI evidence, confidence, approvals and model reports | Missing | No AI or model outputs are activated. |
| 4 | Next.js/NestJS/FastAPI and PostgreSQL | Working locally | All three application services run natively. TypeORM transactions use the existing PostgreSQL 14.19 server. |
| 4 | WebSockets, Redis Streams and scheduled workers | Missing | No connected durable event workers or streaming browser transport. |
| 4 | S3/MinIO archive and integrated monitoring stack | Missing | Optional Docker definitions only; not operational application integrations. |
| 8 | Production identity, MFA, roles and approved devices | Missing | Hashed expiring/revocable local sessions are operational, but local session creation is not production sign-in. |
| 8 | Database tenant isolation and audit protection | Working locally | Non-superuser application role, forced RLS on trading/research tables, parameterized queries and append-only triggers; verified tests. |
| 8 | TLS, encryption at rest, cloud secret manager and WAF | Missing | Local loopback application; no cloud controls or encryption-at-rest claim. |
| 8 | Rate limits/input validation/secret handling | Partial | Local request budgets, Zod/Pydantic, ignored mode-600 .env; production hardening still needed. |
| 8 | Backup, restoration and restart | Working locally | Native pg_dump, isolated pg_restore count/cash verification, and reconnect persistence tested. |
| 8 | Health monitoring and circuit breakers | Partial | Database/analytics health UI and request timeout; complete queue/model/feed monitoring and breakers absent. |
| 9 | Unit and integration checks | Partial | 13 TypeScript and 7 Python tests plus database/API checks; full proposal acceptance suites absent. |
| 9 | Broker/reconnect/endurance/performance/security/UAT tests | Missing | Not delivered. Standalone Chromium test launch previously blocked by local sandbox. |
| 9 | Production acceptance | Not complete | No broker account UAT, live-feed acceptance, calibrated model reports or signed production acceptance. |
| 10–16 | Cloud delivery, commercials and approvals | Deferred / not an action | User explicitly requested local operation. Document commercial/legal terms do not authorize cloud spending, account changes or acceptance. |

## Verification

Passed: lint, TypeScript checks, web/API production compilation, 13 TypeScript tests, 7 Python tests, native PostgreSQL persistence tests, API smoke checks, local service health, backup and isolated restore verification. Database checks cover concurrent approval exactly once, restart/reconnection recovery, idempotency, cross-tenant RLS denial, immutable audit, cross-process kill switch, transaction rollback, canonical audit hashes and session revocation.

Browser verification covers strategy saving, options pricing and journal saving; the paper flow and research backtests are also exercised through the local API. Full automated browser acceptance remains separate from these checks. The complete local service stack was stopped and restarted; the same session, exact cash balance, filled order, strategy, linked journal and research history remained accessible. Database recovery is demonstrated for this local paper implementation, not for a complete live broker system.

## Remaining implementation order

1. Production-grade identity, roles/MFA and full session/device administration.
2. Complete instrument/data ingestion, streaming transport, replayable candles, calendars and licensed broker adapters with mock contract suites.
3. Complete portfolio/margin/exposure/loss risk, exits, partial-fill orchestration and reconciliation.
4. Full scanners, charts, options builder and strategy/backtest research features.
5. ML training/evaluation/calibration/explainability and authorized AI gateway/RAG.
6. News/fundamentals/social adapters, notifications, exports and operational monitoring.
7. Endurance/security/recovery/UAT acceptance against every proposal criterion before live execution.

Real market and news verification will require the relevant accounts and data entitlements after the adapter code is built. No real broker credentials were consumed and no live order was transmitted.

## September 18 update: Upstox first broker

User selected Upstox as the first live market-data provider. Added authenticated market-stream UI and a V3 LTPC adapter with official Protobuf decoding, subscriptions, shared upstream socket, stale-data labels, market status, reconnect/resubscribe, token rejection handling and disconnect. Broker credentials stay server-side. Status: **implemented with mocked protocol verification; actual Upstox account verification pending credentials**. This does not complete broker execution, OAuth, tick persistence, instrument search, full market-data coverage or the overall platform. See `UPSTOX_LOCAL.md`.
