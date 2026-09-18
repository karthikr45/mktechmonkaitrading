# Active local data dictionary

Schema: infra/local/migrations/001-persistent-paper.sql. Tenants use text identities. Orders use tenant/UUID identity and per-tenant idempotency keys. Quantity is positive integer. Price and cash use numeric(24,4); API values are decimal strings. Timestamps are timestamptz and normalized ISO UTC.

local_tenants: workspace configuration. paper_accounts: cash and kill switch. paper_orders: draft/state/fill fields. paper_executions: one paper fill per order. cash_ledger: signed execution cash movements. paper_audit: tenant hash chain, action/payload and UTC timestamp. local_sessions: hashed token, tenant, expiry and revocation. saved_strategies: immutable v1 definitions. research_runs: immutable request/result records. journal_entries: notes/tags with optional composite tenant/order reference. schema_migrations: applied migration versions.

Trading/research/journal tables enforce tenant RLS. Audit, execution, cash, strategy and research tables reject UPDATE/DELETE via triggers. Derived positions aggregate filled buy orders; no broker reconciliation or full lot accounting is claimed.
