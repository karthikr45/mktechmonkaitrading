# Live data and production release requirements

Status: local research application; NOT a production-certified trading platform.
Existing PostgreSQL persistence, tenant-scoped transactions, immutable audit,
paper approvals and local recovery checks remain available. See FEATURE_AUDIT.md
for the broader feature comparison. Real broker execution adapters, full risk/exits
and reconciliation remain unimplemented; local sessions must not be exposed publicly.
Local Ollama is the selected AI provider. Real market observations must come from
licensed data feeds; a model cannot replace prices, OI, timestamps or historical evidence.

## Inputs required from the owner

| Input                                               | Where / purpose                                                                                                                                                                  | Current application setting                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Upstox account and authenticated access token       | https://upstox.com/developer/api-documentation/authentication/ — Indian quotes, derivatives and historical data                                                                  | `UPSTOX_ACCESS_TOKEN`                                                                |
| Global data account with verified exchange coverage | https://twelvedata.com/docs — confirm exact indices, FX, futures, Magnificent Seven, latency and display rights before purchase                                                  | `TWELVE_DATA_API_KEY`, `GLOBAL_MARKET_SYMBOLS`                                       |
| Local Ollama and installed model                    | Existing local installation, no cloud AI key required                                                                                                                            | `AI_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen2.5:7b` |
| Native PostgreSQL                                   | Dedicated non-superuser/non-BYPASSRLS application role; admin credentials used only by setup                                                                                     | `DATABASE_URL`, `PG_ADMIN_URL`                                                       |
| Historical derivatives dataset                      | Timestamped futures and option-contract OI, prices, volume, expiry, corporate-action adjustments and historical eligibility; enough history for training and held-out validation | Provider selection and integration pending; do not add invented keys                 |
| Exchange reference/EOD data                         | Trading calendar, eligibility, bans/restrictions, delivery, exact turnover and FII/DII reports                                                                                   | Source/access agreement and integration pending                                      |
| Fundamentals and events                             | 3–5 years of financial statements, latest quarters, results calendar, corporate actions and attributed news                                                                      | Coverage/access agreement and integration pending                                    |
| Deployment decision                                 | Local single-user demo or hosted multi-client product; hosting region, domain, user roles and expected concurrent users                                                          | Required before external deployment                                                  |
| Notification preference                             | In-app first; email/Telegram/SMS only after recipient/channel authorization                                                                                                      | External delivery not implemented                                                    |

Keep all actual credentials in ignored local `.env`. Do not put secrets in screenshots,
chat, Git or browser-side configuration. A working key does not establish exchange
entitlement or permission to display data to multiple clients. GIFT and all requested
international indices must be individually verified; do not substitute ETFs silently.

## Repeatable dependency check

Run `pnpm check:live` from the repository. It validates PostgreSQL schema/role,
Upstox market-data authentication using a Nifty quote (supports analytics tokens), global symbol configuration,
one explicitly configured global quote, and an actual local Ollama JSON inference.
It does not print secret values, account profile data, raw provider errors or generated text.
It exits nonzero if any dependency check is blocked. The single global request can
consume provider quota. No orders are sent. This check does not prove live stream
freshness, full exchange coverage, historical accuracy or production readiness.

Then run credential-backed market-session acceptance: connect Upstox, observe
timestamped streaming prices, run the F&O scanner, verify same-contract OI baselines,
open saved reports, restart and reload them, and request an evidence-linked explanation.
When markets are closed, show last-session data as closed/EOD, never as live.

## Release gates still open

- Replace shared local demo sessions with authenticated users, role authorization,
  isolated broker credentials, session lifecycle and tested tenant provisioning.
- Complete broker OAuth with registered redirect URI, state validation and encrypted
  credential storage/rotation; current access-token entry is a local workflow.
- Implement intraday 5m/15m/1h history and confirmation, full chain coverage checks,
  delivery/turnover, sector/regime, rollover, fundamentals and event integrations.
- Implement and validate historical threshold research using chronological held-out
  periods, costs/slippage, minimum samples and uncertainty; no invented win rates.
  The 1.8% price / 10% futures OI defaults are hypotheses, not proven thresholds.
- Keep cash price %, futures price %, futures OI %, individual option OI %, and
  verified total-expiry option-chain OI % separate with source and baseline timestamps.
- Finish the requested scoring/ranking/entry/stop/target workflow. Missing evidence
  must yield an unavailable decision, not a fabricated score or recommendation.
- Global adapter currently caches snapshots for 15 minutes: it is not a streaming
  global feed. Entitled low-latency streaming and coverage monitoring remain work.
- Add durable scheduled jobs, provider quota/retry controls, recovery and freshness
  monitoring, operational alerting, backup restore verification and load testing.
- Complete deployment TLS, secret management, security review and acceptance tests
  before exposing the application outside localhost.

Execution remains paper-only. Enabling real orders is a separate implementation and
acceptance scope. Ollama explanations summarize verified evidence; numerical signals
and historical statistics must come from tested calculations, not generated text.

### Verified access and remaining gates (2026-11-03)

Stock workspace now verifies provider cash/futures/chain snapshots and full-feed
OI/average price/volume, with local evidence-linked stock analysis and watchlist
news monitoring. Global Upstox indices supplement Twelve Data stock/FX snapshots.
See CLIENT_ACCEPTANCE.md for observed results and honest coverage limits.
Expired-contract API access is blocked by UDAPI1149 (Upstox Plus required).
Twelve Data quota is eight credits/minute; `TWELVE_DATA_CREDITS_PER_MINUTE`
controls bounded queued quote batches. Neither integration is full production
acceptance; open-session continuity, complete trade qualification, reporting and
backtesting gates remain outstanding.
