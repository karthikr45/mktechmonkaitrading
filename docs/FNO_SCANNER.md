# F&O scanner implementation status

The F&O scanner is accessible from the main navigation. This release provides an
end-to-end *observation* workflow, not the complete trade-qualification design.

Implemented: versioned persisted filters, background run with progress/cancellation,
PostgreSQL advisory lock against duplicate runs, restart interruption recovery, saved
runs and stock details, tenant RLS, dynamically downloaded Upstox NSE stock-derivative
universe, batched authenticated cash/futures quotes, daily history, EMA10/20/50/100/200,
Wilder RSI14, previous daily Fibonacci pivots, conventional futures price/OI classification,
expiry-specific OI PCR/changes and highest call/put OI strikes. Saved observations can be
explained by the existing local Ollama adapter and explanation records are persisted.

Run `pnpm db:migrate`, then `pnpm build && pnpm start` or `pnpm dev`. Supply a valid Upstox
access token in the existing environment field or connect through Real-time market. No
new credential field is introduced. Use F&O scanner → Configure scan filters → Start
provider scan. Observe progress, open a completed/partial saved run, select a stock,
and optionally request an AI explanation. The scan does not place orders.

The public BOD instrument file is downloaded dynamically, size-bounded and checked against
its Last-Modified time (96-hour limit). This is a broker-provided universe, not an independent
verification of today's official exchange eligibility/ban status. The actual universe
count is retained in each report; it is never a fixed list.

Only absolute price movement and futures OI thresholds are evaluated. Other requested
filters are saved but explicitly marked as awaiting their source data. All three horizons
are selectable and saved, but horizon-specific multi-timeframe qualification is not built.
No /100 regime score or qualified trade shortlist is generated from incomplete inputs.
The summary explicitly distinguishes processed observations from qualified candidates.

Missing/pending: exchange restrictions and calendars, delivery and exact turnover reports,
previous option-volume baselines and unit verification, chain completeness for max pain,
5m/15m/1h/weekly/monthly confirmation, sector/regime validation, rollover history/cost,
financial statements/events, full scanner-driven notification delivery and scheduled scans.
Global provider integration/latency and broker-account integration remain separate work.

Quotes older than five minutes are not used for current-session decisions; closed-market
scans can therefore show missing/stale rather than recycle a prior close as live. Completed
daily bars exclude the current IST date. Daily turnover is not approximated by close×volume.
Futures baseline OI must share the cash history's last completed session date and be within
96 hours; a proper exchange calendar is still required. Call/put writing is not inferred
from OI alone. Option-chain retrieval time is not a per-strike observation timestamp.
Max pain is suppressed until chain completeness and OI units are confirmed.

Validation: `pnpm test`, `pnpm --filter @mk/api exec tsx src/check-fno.ts`, typecheck, lint,
build, API authentication and local UI checks. Fixtures are isolated under test tenants;
they are never shown as the user's market data. Credential-backed market-session
acceptance testing remains required. No claim of a fully functioning live scanner yet.
