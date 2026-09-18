# Local API contracts

REST v1 uses hashed bearer local sessions. POST demo-session creates a private local owner session; POST logout revokes it. GET dashboard returns durable paper state. POST demo-replay, orders, orders/:id/approve and kill-switch enter the PostgreSQL transaction boundary. GET/POST strategies and journal persist tenant-scoped records. POST research/:kind supports backtests, indicators, options and payoff through the local Python gateway; GET research lists saved results. GET operations checks PostgreSQL and analytics. GET health is public readiness; GET metrics emits paper mode/storage metrics.

Swagger is at /api-docs. Shared order validation is Zod. Money is a decimal string. Invalid inputs return 400, missing sessions return 401, unavailable dependencies return 503. Versioned domain event types remain planned contracts; there is no durable Redis publication or WebSocket service yet. No live order endpoint exists.
