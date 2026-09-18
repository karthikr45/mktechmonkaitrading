# Codex Master Prompt for MKTechMonk AI Trading Platform

Copy the complete prompt below into Codex at the root of a new repository.

---

## Role and product objective

You are the principal architect and lead engineer responsible for building an end-to-end product named **MKTechMonk AI Trading Platform**.

Build a professional, modular, multi-tenant-capable trading intelligence, strategy research, backtesting, risk-management, paper-trading and supervised broker-execution platform. The initial deployment is for MKTechMonk product development and internal demonstration. It must be capable of becoming a commercial SaaS product later without rewriting the core architecture.

This is not a guaranteed-profit system and must never represent predictions as certain. Language models must not directly bypass risk controls or place orders. All critical trading decisions must pass deterministic validation and an auditable order state machine.

## Working rules

1. Inspect the repository before making changes. If it is empty, create the project from scratch.
2. Maintain a living implementation plan in `docs/IMPLEMENTATION_PLAN.md` with completed, active and pending work.
3. Work in small, testable vertical slices, but implement one coherent product rather than disconnected demos.
4. Do not leave silent placeholders. Clearly label integrations requiring credentials as `mock`, `sandbox`, `configured` or `unavailable`.
5. Never scrape paid or restricted websites. Use only official APIs, permitted RSS feeds, licensed files or adapters with mock implementations.
6. Never commit secrets. Create `.env.example` files and use secret-provider interfaces.
7. Use UTC internally and display the user's configured timezone, defaulting to `Asia/Kolkata`.
8. Use decimal-safe financial calculations. Do not use floating-point arithmetic for money where precision matters.
9. Add tests as each module is implemented. Do not defer all tests until the end.
10. After every major feature, run linting, type checks, tests and the production build. Fix all failures before continuing.
11. Preserve an audit trail for authentication, data ingestion, strategy changes, model versions, risk decisions, approvals and orders.
12. Create meaningful seed data and a simulation mode so the full product can be demonstrated without paid services.

## Zero-cost initial development requirement

The product must run locally without paid cloud services or paid APIs.

Use the following free local stack:

- Docker Compose
- PostgreSQL 16
- TimescaleDB extension when available, with partitioned PostgreSQL fallback
- pgvector
- Redis
- MinIO as an S3-compatible local object store
- Mailpit for local email testing
- Prometheus and Grafana
- OpenTelemetry
- MLflow
- Ollama as an optional local language-model provider
- TradingView Lightweight Charts or another permissively licensed chart library
- Synthetic and replayable market-data providers

The application must remain runnable when Ollama is unavailable. AI features should display an unavailable status while deterministic analytics, risk, backtesting and paper trading continue operating.

Create adapters so AWS, OpenAI, licensed market-data providers and commercial notification services can be added later through configuration.

## Required technology stack

Create a `pnpm` and Turborepo monorepo.

### Applications

- `apps/web`: Next.js, React and TypeScript
- `apps/api`: NestJS and TypeScript for identity, tenancy, configuration, brokers, orders, portfolios, notifications and audit
- `apps/analytics`: Python FastAPI for indicators, options analytics, backtesting, machine learning, sentiment and model explanations
- `apps/worker`: Python or TypeScript workers for ingestion, feature computation, alerts, reports and scheduled jobs

### Shared packages

- `packages/ui`: shared accessible UI components
- `packages/contracts`: OpenAPI-generated or shared API types, schemas and events
- `packages/config`: validated environment configuration
- `packages/eslint-config`
- `packages/tsconfig`
- `packages/broker-sdk`: unified broker interfaces and adapters
- `packages/market-data-sdk`: market-data interfaces and adapters
- `packages/risk-engine`: deterministic risk policies and reusable validators
- `packages/strategy-dsl`: strategy schema, parser and validation
- `packages/testing`: fixtures, factories and test utilities

### Core libraries

- Prisma or TypeORM for application data
- Pydantic and SQLAlchemy for Python services where appropriate
- Redis Streams for event delivery
- WebSockets for live browser updates
- Zod for frontend and shared runtime validation
- TanStack Query and TanStack Table
- React Hook Form
- NumPy, Polars, Pandas and SciPy
- scikit-learn, XGBoost and LightGBM
- SHAP
- Optuna
- VectorBT or a validated custom backtesting engine
- QuantLib where appropriate for options validation
- FinBERT behind a replaceable sentiment interface

## Repository requirements

Create:

```text
apps/
packages/
infra/
  docker/
  local/
  aws/
docs/
  architecture/
  api/
  operations/
  security/
  product/
scripts/
fixtures/
```

Also create:

- Root `README.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `docs/LOCAL_SETUP.md`
- `docs/ARCHITECTURE.md`
- `docs/DATA_DICTIONARY.md`
- `docs/BROKER_INTEGRATION_GUIDE.md`
- `docs/MODEL_GOVERNANCE.md`
- `docs/RISK_CONTROLS.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/THIRD_PARTY_DEPENDENCIES.md`
- Architecture decision records under `docs/architecture/adr`

## Product roles and tenancy

Implement the product as tenant-aware even when initially used by one MKTechMonk tenant.

Roles:

- Platform Super Admin
- Tenant Owner
- Trader
- Strategy Author
- Risk Approver
- Read Only Analyst
- Support Operator with restricted access

Implement:

- Tenant isolation
- User invitation
- Role-based permissions
- MFA-ready authentication
- Session management
- Device/session list and revocation
- Audit of permission and configuration changes
- Per-tenant timezone, market, currency, broker and notification configuration

## Main navigation and screens

Build a responsive professional trading interface with light and dark themes.

### Public and access screens

- Product landing page
- Sign in
- Forgot/reset password
- MFA challenge
- Invitation acceptance
- Terms, privacy and risk disclosure

### Authenticated application

- Home market dashboard
- Watchlists
- Instrument search
- Advanced chart workspace
- Market scanners
- Option chain
- Options strategy builder
- Strategy library
- Visual strategy editor
- Backtest configuration
- Backtest results
- Paper-trading terminal
- Live supervised trading terminal
- Orders and trades
- Positions and holdings
- Funds and margins
- Portfolio analytics
- Risk dashboard
- News and sentiment
- Fundamentals
- AI trading assistant
- Trade journal
- Reports and exports
- Alert centre
- Broker connections
- Data-source connections
- Model registry and model health
- Audit log
- User and role administration
- Tenant settings
- System health and operations

Every screen must implement loading, empty, error, stale-data and permission-denied states.

## Broker integration architecture

Define a common `BrokerAdapter` interface supporting:

- Authorisation URL
- OAuth or session exchange
- Token refresh or daily-session renewal
- Profile
- Funds and margins
- Holdings
- Positions
- Orders
- Trades
- Quotes
- Historical candles where supported
- Market-data WebSocket
- Order/trade WebSocket
- Place order
- Modify order
- Cancel order
- Product and segment capabilities
- Rate-limit metadata
- Health check

Implement adapters for:

1. ICICI Direct Breeze
2. Angel One SmartAPI
3. FYERS API
4. Paper Broker
5. Mock Broker

Real broker adapters must be disabled unless credentials are configured. Provide contract tests using mocked HTTP and WebSocket responses. Never send a live order in automated tests.

## Market data platform

Create a provider-neutral ingestion system for:

- Broker WebSocket ticks
- Quotes
- OHLCV candles
- Market depth when supplied
- Open interest
- Option chain
- Indices
- India VIX
- Corporate actions
- Corporate announcements
- Results calendar
- FII and DII data
- Bulk and block deals
- Economic calendar
- Global indices, FX, commodities and yields through optional providers

Create:

- Normalized instrument master
- Broker-symbol mappings
- Exchange calendar
- Trading-session calendar
- Tick schema
- Candle aggregation service
- Sequence and duplicate handling
- Heartbeats
- Reconnection with backoff
- Stale-data detection
- Gap detection
- Data-quality scores
- Corporate-action adjustments
- Retention policies
- S3/MinIO Parquet archive
- Historical replay provider
- Synthetic market generator

Do not claim broker WebSocket data is direct exchange tick-by-tick data. Label the feed source, timestamp, latency and entitlement in the UI.

## Charts and technical analytics

Implement:

- Candlestick, line and Heikin-Ashi views
- Volume
- Multi-timeframe selection
- Compare instruments
- Drawing tools where supported by the chart library
- Strategy entry, exit, stop and adjustment markers
- VWAP
- SMA and EMA
- RSI
- MACD
- ATR
- Bollinger Bands
- Supertrend
- ADX
- Stochastic oscillator
- Pivot points
- Support and resistance
- Fibonacci levels
- Open-interest overlay
- Price/volume breakout display

Indicators must be computed server-side with versioned definitions. Add golden-data tests for representative calculations.

## Scanner engine

Build configurable scanners for:

- Price breakout and breakdown
- Volume expansion
- Gap up and gap down
- Relative strength
- Momentum
- Volatility expansion and contraction
- VWAP crossover
- Moving-average crossover
- RSI states and divergence-ready data
- Support/resistance proximity
- Futures open-interest build-up
- Option-chain activity
- Unusual volume and anomaly score

Allow users to save scanner definitions, run on demand, schedule them, display results and generate alerts.

## Options analytics

Implement:

- Expiry selection
- Strike filtering
- Calls and puts
- Bid, ask, LTP, volume and open interest
- Open-interest change
- Implied volatility
- Delta, Gamma, Theta, Vega and Rho
- Put-call ratio
- Max pain with documented assumptions
- IV skew and term structure
- Long/short build-up classification
- Intrinsic and time value
- Premium reasonableness indicators
- Payoff chart
- Break-even points
- Maximum profit and loss
- Estimated margin through broker adapter where available
- Probability-of-profit estimate with assumptions
- Greeks exposure for a position or strategy

Support templates:

- Long call and put
- Covered call
- Protective put
- Bull and bear vertical spreads
- Straddle and strangle
- Iron condor and iron butterfly
- Calendar spread
- Ratio spread
- Custom multi-leg strategy

Do not copy proprietary implementations from Opstra, Sensibull or StockMock. Build original calculations and UX using documented financial methods.

## Strategy definition system

Create a versioned JSON strategy DSL and visual editor supporting:

- Instrument universe
- Segment
- Timeframe
- Trading session
- Indicators and parameters
- Entry conditions
- Exit conditions
- Stop-loss
- Trailing stop
- Profit target
- Time exit
- Position sizing
- Maximum concurrent positions
- Maximum trades per day
- Daily loss limit
- Cool-down period
- Market-regime filter
- News-event filter
- Option expiry and strike rules
- Multi-leg definition
- Hedge and adjustment rules

Validate strategy definitions and show plain-language explanations before saving or enabling them.

## Backtesting engine

Build an event-driven backtesting system with:

- Historical replay
- Candle-based execution model
- Configurable order fill rules
- Slippage
- Brokerage and Indian market transaction-cost configuration
- Corporate-action adjustment
- Position sizing
- Stops and targets
- Multi-leg options support where data is available
- Walk-forward testing
- In-sample and out-of-sample splits
- Parameter sweeps
- Monte Carlo trade-sequence analysis
- Strategy comparison
- Reproducible random seed
- Complete run manifest containing data version, strategy version and code version

Report:

- Total and annualized return
- Equity curve
- Maximum drawdown
- Win rate
- Profit factor
- Expectancy
- Average win and loss
- Sharpe and Sortino ratios
- Consecutive wins and losses
- Exposure time
- Turnover
- Costs and slippage
- Monthly and yearly returns
- Trade list
- Overfitting and insufficient-sample warnings

## Paper trading and execution

Create an order state machine covering draft, risk review, pending approval, submitted, acknowledged, partially filled, filled, rejected, cancelled and unknown/reconciliation-required states.

Support:

- Paper trading
- Manual orders
- AI-assisted order draft
- One-click confirmed execution
- Supervised deterministic automation
- Automatic exits only under approved deterministic rules
- Basket and multi-leg order orchestration with partial-fill handling
- Broker reconciliation
- Idempotency keys
- Retry rules that never duplicate orders
- Global and strategy kill switches

Default the system to paper trading. Live trading must require explicit configuration, disclosure acceptance, broker capability and a production feature flag.

## Deterministic risk engine

Implement hard controls for:

- Available funds and margin
- Maximum order value
- Maximum quantity
- Maximum open positions
- Maximum risk per trade
- Daily loss limit
- Weekly drawdown limit
- Portfolio exposure
- Sector exposure
- Single-instrument exposure
- Options premium limit
- Greeks exposure
- Defined-loss requirement
- Hedge requirement
- Stale or missing market data
- Price-deviation band
- Trading hours
- Duplicate order
- Broker session health
- Strategy enabled state
- Cool-down after consecutive losses

Risk rules must return machine-readable reason codes and user-friendly explanations. Denials must be immutable in the audit log.

## AI gateway and assistants

Create a provider-neutral AI gateway with adapters for:

- Ollama
- OpenAI-compatible API
- Disabled/mock provider

AI uses:

- Explain indicators and model signals
- Summarize permitted news and announcements
- Compare strategies
- Explain options payoff and Greeks
- Review risk
- Analyse the trade journal
- Convert a natural-language strategy draft into the strategy DSL, requiring user validation
- Answer questions using tenant-authorized documents and market context
- Produce structured decision-support cards

Every AI response used in trading context must include:

- Instrument and timestamp
- Data sources
- Data freshness
- Strategy/model version
- Confidence or uncertainty
- Risk warnings
- Explicit statement that the output is decision support, not guaranteed advice

Use RAG with pgvector. Enforce tenant filters during retrieval. Store prompt templates and versions. Redact secrets and broker tokens. Add timeouts, token budgets, retries, circuit breakers and cost counters even for local models.

The LLM must never invoke the broker directly. It may create an order draft that enters deterministic validation and human approval.

## Machine learning system

Implement a research and production-gating framework using:

- Logistic regression baseline
- XGBoost
- LightGBM
- Probability calibration using Platt scaling or isotonic regression
- Market-regime classification
- Isolation Forest anomaly detection
- FinBERT-compatible sentiment adapter
- SHAP explanations
- MLflow registry
- Drift and data-quality monitoring

Features may include:

- Returns and momentum
- Volatility and ATR
- Volume and relative volume
- VWAP distance
- Trend indicators
- Support/resistance distance
- Open interest and option-chain features
- Implied volatility and skew
- Market breadth
- Sector relative strength
- News sentiment when licensed
- Existing portfolio and risk state

Use chronological splits only. Prevent look-ahead leakage. Include transaction costs and class imbalance handling. Evaluate precision, recall, F1, ROC-AUC where appropriate, Brier score, calibration, false-alert rate, stability by regime, drawdown and strategy impact after costs.

No model is activated merely because training performance is high. Implement approval status: experimental, evaluated, approved, active, retired and rejected.

## News fundamentals and social adapters

Create provider interfaces for:

- Licensed Reuters/LSEG
- Economic Times permitted feed
- Moneycontrol permitted feed
- NSE/BSE announcements
- SEBI and RBI announcements
- Fundamental-data provider
- X API
- Meta Graph API
- Generic RSS
- File upload
- Mock provider

Implement deduplication, source identity, published and received timestamps, company mapping, instrument mapping, relevance, recency, sentiment and reliability labels.

For unavailable providers, show setup instructions and never imply that data is being collected.

## Alerts and notifications

Implement:

- In-app alerts
- Browser notifications
- Email
- Webhook
- Telegram-compatible adapter
- SMS/WhatsApp provider interface without requiring a paid provider locally

Alert types:

- Price and indicator
- Scanner match
- Strategy entry/exit
- Risk threshold
- Model probability threshold
- News/sentiment event
- Broker disconnect
- Stale feed
- Order rejection
- Position mismatch
- System health

Add throttling, deduplication, quiet hours, severity, acknowledgment and escalation.

## Trade journal and performance

Implement:

- Automatic linkage of orders, trades and positions
- Manual notes and tags
- Trade thesis
- Planned entry, stop and target
- Actual execution
- Strategy and model version
- Emotions and rule-adherence fields
- Attachments in MinIO/S3
- AI-assisted post-trade review
- Mistake categories
- Performance by strategy, instrument, time, day, regime and direction
- Export to CSV and PDF

## Admin operations and observability

Build operational screens for:

- Service health
- Data-feed health
- Broker health
- Queue lag
- WebSocket clients
- Database and storage status
- Scheduled jobs
- Failed jobs and replay
- Model health and drift
- AI-provider status and usage
- Notification status
- Audit search

Expose Prometheus metrics and structured JSON logs with correlation IDs. Do not log secrets, access tokens or sensitive prompts by default.

## Database design

Create normalized schemas and migrations for at least:

- tenants
- users
- roles and permissions
- sessions and MFA methods
- broker connections and capabilities
- instruments and symbol mappings
- watchlists
- ticks, candles and market snapshots
- option chains and option metrics
- news, fundamentals and sentiment
- strategies and strategy versions
- backtest runs, metrics and trades
- model definitions, versions, evaluations and predictions
- alerts and notification deliveries
- portfolios, holdings, positions and cash ledgers
- orders, order events, executions and reconciliations
- risk policies, decisions and breaches
- journals, notes and attachments
- AI conversations, prompt versions and evidence references
- audit events
- jobs and system incidents

Add tenant IDs, timestamps, source identifiers, version fields and appropriate unique constraints and indexes.

## API and event contracts

Use versioned REST APIs and WebSockets. Publish OpenAPI documentation.

Define typed events for:

- market.tick.received
- market.candle.closed
- market.feed.stale
- scanner.match
- strategy.signal.created
- risk.decision.created
- order.approval.requested
- order.submitted
- order.updated
- position.updated
- model.prediction.created
- alert.created
- notification.sent
- broker.connection.changed

Event consumers must be idempotent. Add dead-letter handling and replay tooling.

## Security requirements

Implement:

- Secure password hashing
- MFA-ready design
- RBAC and tenant authorization checks
- CSRF protection where relevant
- Secure cookies
- Content Security Policy
- Rate limiting
- Input validation
- Parameterized database access
- Secret redaction
- Encryption-provider abstraction
- Audit logging
- Dependency scanning configuration
- Container non-root users
- Backup and restore scripts
- Data export and deletion workflow
- Session and API-key revocation

Create a threat model covering account takeover, broker-token theft, order tampering, duplicate orders, prompt injection, malicious documents, data poisoning, tenant leakage and denial of service.

## Local development environment

Create `docker-compose.yml` to start:

- PostgreSQL with pgvector and time-series support
- Redis
- MinIO
- Mailpit
- MLflow
- Prometheus
- Grafana
- Optional Ollama profile

Create commands:

- `pnpm setup`
- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm seed`
- `pnpm replay:market`
- `pnpm backup:local`
- `pnpm restore:local`

Provide a single demo command that loads seed data, starts a replay feed, runs scanners, triggers a strategy, passes it through risk checks, creates a paper order and shows the result in the dashboard.

## Cloud-ready architecture

Do not require cloud deployment initially, but create deployment documentation and infrastructure placeholders for:

- AWS VPC
- ECS or EC2 services
- RDS PostgreSQL
- ElastiCache Redis
- S3
- Application Load Balancer
- WAF
- Secrets Manager and KMS
- CloudWatch
- Route 53
- Backups

Keep infrastructure-as-code under `infra/aws`. It must not provision anything unless explicitly invoked with valid credentials.

## Testing requirements

Implement:

- Unit tests
- Integration tests
- API contract tests
- Broker adapter tests using mocks
- WebSocket reconnection tests
- Indicator golden tests
- Backtest reproducibility tests
- Risk-engine allow and deny tests
- Duplicate-order tests
- Tenant isolation tests
- Permission tests
- AI structured-output and prompt-injection tests
- Model leakage and chronological-split checks
- Playwright end-to-end tests
- Backup and restore verification script

No test may place a live broker order.

## Seed and demonstration data

Create realistic but clearly synthetic data for:

- NIFTY and BANKNIFTY-like indices using non-misleading demo labels
- A set of sample equities
- Futures and option chains
- Historical candles
- News and sentiment
- Corporate events
- Broker accounts
- Orders, trades and positions
- Strategies
- Backtest results
- Model predictions
- Risk approvals and denials
- Trade-journal entries

Label synthetic data visibly in the UI.

## Product quality requirements

- Responsive desktop-first interface
- Accessible keyboard navigation
- Consistent design system
- No broken navigation
- No unhandled promise errors
- No secrets in logs
- Useful empty and error states
- Freshness indicators on market and news data
- Risk disclosure on predictive and AI screens
- Confirmation before any destructive or live-trading action
- Fast dashboard rendering with virtualization where required

## Definition of done

The product is considered complete only when:

1. The entire application runs locally through documented commands.
2. Demo data provides an end-to-end experience without paid subscriptions.
3. Three real broker adapters exist behind disabled configuration plus working paper and mock brokers.
4. Market replay drives charts, scanners, strategy signals, risk decisions and paper orders.
5. Options analytics and strategy payoff calculations are tested.
6. Backtests are reproducible and include costs, slippage and data versions.
7. Predictive models have evaluation, calibration and explainability reports.
8. AI services use the gateway, authorized retrieval and structured responses.
9. AI cannot directly transmit a broker order.
10. Risk rules, approvals, idempotency and kill switches are tested.
11. Tenant and role isolation tests pass.
12. Monitoring, audit search, backup and restoration workflows operate.
13. `pnpm lint`, `pnpm typecheck`, tests and production builds pass.
14. Setup, architecture, API, security, model governance and operations documentation are complete.

## Execution instruction

Start by producing:

1. Repository assessment
2. Architecture decision summary
3. Complete directory tree
4. Database and event-contract plan
5. Implementation backlog ordered by technical dependency
6. Initial monorepo scaffold and local Docker environment

Then implement the product continuously, updating `docs/IMPLEMENTATION_PLAN.md` after each completed vertical slice. Do not stop after generating only documentation or UI mockups. Build working code, tests, seed data and the end-to-end local demonstration.

---

End of Codex prompt.
