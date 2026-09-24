# News & Risk Centre

Implemented September 24, 2026 for the local paper workspace. This module does not complete the entire trading platform or certify that every trading risk is covered.

## Use locally

Run `pnpm db:migrate`, then `pnpm build && pnpm start` (or `pnpm dev` for development). Open http://127.0.0.1:3200 and select **News & risk**. The native PostgreSQL service remains the database; no Docker database is required.

Open **Watchlist & daily schedule**. Enter one instrument per line as `Upstox instrument key;company name;optional alias`. Use accurate company names/aliases for RSS matching; substring matching can produce false positives. Save your settings. The watchlist is separate from live quote subscriptions in **Real-time market**. No sample watchlist is silently treated as your actual portfolio.

Default monitoring is enabled for the local `mk-demo` workspace. The API checks once a minute; research runs every 15 minutes by default. Configure the daily briefing time, refresh interval (5–120 minutes), reminder age and your manually verified broker cutoff. Reminders run every calendar day, including holidays; an exchange calendar is not integrated. The API and computer must stay awake. Restart runs an overdue check and reports gaps; it cannot reconstruct all missed events. Pausing monitoring stops background checks; manual refresh remains available.

## Sources and freshness

- NSE announcements RSS is enabled by default. Only the first 300 feed entries are parsed per run, with explicit partial-coverage status.
- Moneycontrol business RSS is enabled but freshness-checked. On September 24, 2026, HTTP retrieval succeeded but the newest returned article was April 23, 2024. This feed is marked unavailable/stale and excluded from current research; successful HTTP does not imply live news.
- An RSS source with no dated entries or no publication within 72 hours is excluded. This conservative rule is not an exchange holiday calendar.
- Upstox news supports up to 30 configured keys, its seven-day window, and at most three pages per run. More pages are explicitly partial coverage. Matching articles carry provider instrument mappings. Access requires a valid Upstox token from the connection screen or `UPSTOX_ACCESS_TOKEN` in local `.env`.
- Upstox key ratios are fetched for up to 10 equity ISINs per run. Retrieval times and company/sector comparisons are shown. Full financial statements, accounting-period timestamps, results calendar, shareholding and corporate-action analysis remain missing.
- Duplicate URLs are grouped, with fragment/tracking parameters excluded from the ID. Article and retrieval timestamps are retained. RSS matches use names/aliases, not independently verified instrument mapping.

RSS defaults can be overridden with `NEWS_RSS_URLS` (maximum five comma-separated HTTPS URLs, restricted to supported NSE/BSE/Moneycontrol hosts). An explicitly empty value disables RSS. Redirects, DTDs and XML entities are rejected. Remote bodies are size-limited and requests have deadlines. Only headlines and source summaries are ingested; there is no paywall bypass or full-article crawler.

## Local AI research

The gateway supports an already-running local Ollama model. In your locally maintained `.env`, set `AI_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434`, and `OLLAMA_MODEL` to an installed model name. No model is installed/downloaded automatically. With `AI_PROVIDER=disabled`, deterministic alerts continue and AI coverage is explicitly unavailable.

The model receives up to 15 matched source headlines/summaries, no broker credentials, and no execution tools. It returns a schema-validated summary with evidence references, implications, review points and uncertainty. Unknown citation IDs fail validation. Evidence snapshots are stored with each report. Validation does not establish factual accuracy; generated prose remains labeled AI interpretation. Timeout/invalid output never suppresses deterministic risk alerts. Configured AI execution has not been verified against an actual installed model on this machine.

## Alerts and daily checklist

PostgreSQL stores settings, article records, briefings, alerts and daily notes under forced tenant RLS. Refreshes use a database advisory lock to prevent concurrent duplicate work. Alerts have stable dedupe keys; acknowledgements survive refresh/restart. Acknowledgement does not mean a risk is resolved. A resolved alert reopens without its old acknowledgement when the risk recurs.

The application-wide alert counter links to the inbox. Unacknowledged alerts remain visible, with an overdue-reminder label after the configured age. Alerts cover source failures, missed refreshes, watchlist quote freshness, unresolved local paper orders, and paper positions lacking managed exits. Daily checklist reminders cover preparation, calendars, trade plans, sizing, liquidity/exposure, order review, discipline, cutoff, reconciliation and journal review. Notes are manual attestations; they never mark unavailable source coverage as checked. Daily boundaries use Asia/Kolkata.

The trade worksheet calculates equity-unit stop-loss estimates, adverse-slippage allowance, total costs, reward/risk and maximum quantity by a user-entered risk budget using decimal arithmetic. It is not an options/futures model, a margin validator, an executable stop, a prediction or a guarantee against gaps.

## Limits

No live portfolio/margin reconciliation, automatic protective orders, economic/results calendar, full financial-statement analysis, comprehensive market scanner, external Telegram/email delivery, or continuously running OS service is provided by this change. Background monitoring is inside the running API process. Real Upstox account integration still requires credential-based acceptance testing. Local demo identity is shared `mk-demo`, not production user authentication.

## Validation

`pnpm test` covers provider parsing, stale-feed rejection, RSS safety, pagination, source ID validation, IST rollover and risk math, plus existing trading/stream tests. `pnpm test:research` checks persistence, concurrent-refresh dedupe, acknowledgement/reopening, daily notes and RLS using isolated fixture tenants. `pnpm --filter @mk/api exec tsx src/check-news-sources.ts` reads public source feeds without credentials and reports item/timestamp metadata. CI runs migrations and research integration checks.

Sources: https://upstox.com/developer/api-documentation/get-news/ ; https://upstox.com/developer/api-documentation/get-key-ratios/ ; https://www.nseindia.com/static/rss-feed ; https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx
