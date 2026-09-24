# MKTechMonk AI Trading Platform

Local PostgreSQL-backed paper trading and research under development. **The full proposal is not complete. No live broker or AI model is enabled.**

```bash
pnpm setup:local
pnpm dev
# Or pnpm build && pnpm start
```

Open http://127.0.0.1:3200. The launcher starts Next.js, NestJS and FastAPI. Your native PostgreSQL server supplies persistence; Docker is not required. The dedicated database is `mktechmonk_local`.

Working locally: synthetic replay, paper risk review/approval/fill, exact decimal cash ledger, positions, kill switch, protected audit, strategy definitions, journal notes, stored backtests/options calculations and service health. Data persists across restarts. Tests cover RLS, concurrent order idempotency, rollback and restore verification.

Local session creation is for a private personal development environment, not production authentication. Real brokers, live data, full risk/exits, ML, AI/RAG, alerts and many advanced analytics remain unimplemented.

Read [local setup](docs/LOCAL_SETUP.md), [feature audit](docs/FEATURE_AUDIT.md), [implementation plan](docs/IMPLEMENTATION_PLAN.md) and [production readiness](docs/PRODUCTION_READINESS.md).

## News & Risk Centre

The local **News & risk** screen now contains a persistent alert inbox, daily review checklist, research watchlist, source coverage, briefing history and an equity risk worksheet. The API runs periodic checks while the computer/application remain running. NSE/Moneycontrol RSS are freshness-checked; stale feeds never imply current coverage. Upstox news and key ratios require account access; optional local Ollama research requires a configured model. See [setup and limitations](docs/NEWS_RISK_CENTRE.md). Maintain credentials in your own `.env`; supported configuration keys are documented in `.env.example`.
