# Architecture

Next.js uses a same-origin API proxy to NestJS. NestJS derives tenant identity from hashed local sessions, invokes the deterministic paper engine inside a TypeORM PostgreSQL transaction, and stores normalized orders, fills, cash and audit. Tenant advisory locks serialize mutation across processes. Forced row-level security applies to trading, strategy, research and journal tables. The API rejects superuser and RLS-bypass database roles.

FastAPI provides stateless quantitative calculations. The NestJS research gateway supplies a timeout, stores results and appends audit records. Language AI and real brokers remain unavailable. The paper broker has no remote financial side effects, allowing the transaction to commit the simulated execution and cash debit atomically. This design must be extended with an outbox/reconciliation state machine before any remote broker execution.

Local PostgreSQL 14.19 is used as requested; the original PostgreSQL 16/pgvector/Timescale target is not installed. The active migration lives under infra/local/migrations. The older standalone schema is retained as an inactive architectural draft.

Financial settlement values use decimal strings and Decimal.js/Python Decimal. Audit hashes use canonical JSON and millisecond-preserving UTC timestamps. Options theoretical estimates use numerical floats, not settlement values. Display timezone defaults to Asia/Kolkata.

Identity is a private local-session mode. Full roles, MFA and production login remain future work. Redis/worker/archive/ML/AI/cloud layers remain planned boundaries, not functioning integrations.
