# End-to-end completion checklist

This is the acceptance scope, not a claim that these features are complete.
No sample prices, seed balances or demonstration trades count as live evidence.
Static instrument names/configuration are allowed; market values must come from providers.

| Requirement | Acceptance evidence | Current dependency |
| --- | --- | --- |
| US close and market status | Source/exchange/session date, previous close, percent change and trading calendar verified | Global credentials, symbols and calendars |
| Japan, Korea, Taiwan, China, Hong Kong, Singapore, Australia | Verified index identities and per-exchange timestamps/delays | Entitled global provider |
| Europe overall plus UK/Germany/France | Broad regional index plus country indices, no country substitution | Entitled global provider |
| FX | Verified currency pair direction, source timestamp and continuous updates | FX provider access; streaming integration |
| GIFT Nifty | Licensed NSE IX contract with expiry, rollover and matched comparison baseline | Confirmed vendor; dedicated contract handling |
| Seven US companies | NVDA/MSFT/GOOGL/AAPL/AMZN/META/TSLA session quotes; earnings and after-hours labelled separately | US data entitlements; earnings/extended sessions |
| Indian live market | OAuth login, instrument lookup, quote stream, stale/reconnect/expiry behavior verified | Working Upstox authorization |
| Actual account | Broker funds, positions, holdings and order reconciliation; no paper substitution | Upstox account integration |
| News and fundamentals | Source citations, publication/financial-period dates, watchlist mapping | Broader licensed sources; financial-statement integration |
| Events | Economic/results calendars in IST, holidays, actual/forecast release updates | Calendar credentials/integration |
| AI | News + eligible observed quotes + missing coverage passed to local Ollama; stored citations; invalid output fails visibly | Local model present; full coverage awaits feeds |
| Colours | Observed direction separate from forecast; stale/missing grey; independent risk/uncertainty | Broad quote coverage and exchange calendars |
| Daily/intraday alerts | Persisted triggers, freshness loss, dedupe, restart recovery, delivery receipts | External delivery credentials/integration |
| Full live execution, if enabled later | Broker acknowledgements, fills, cancellations, exits, idempotency and reconciliation tested | Separate execution implementation; remains disabled |

The current global adapter polls with a 15-minute cache. It is not a real-time streaming
implementation. Subscription coverage and quotas must be validated before implementing
and acceptance-testing the streaming path. Do not purchase based on the catalog alone.
The Magnificent Seven are contextual evidence, not a rule that markets must rise together.

## Access handoff

Provide provider name/plan and public coverage documentation. Keep API credentials in the
ignored .env, never in chat or Git. For Twelve Data the existing keys are
TWELVE_DATA_API_KEY and GLOBAL_MARKET_SYMBOLS. The latter requires verified provider
symbols. Do not use guessed index names or silently substitute ETFs for indices.

## Local AI verification

Run `pnpm --filter @mk/api exec tsx src/check-ai-local.ts` from the repository root.
This uses actual retrieved news and configured provider observations, not fixture market
values. Success validates local model generation and citation IDs, not the truth of each
inference. Allow up to 180 seconds per generation on local hardware.

## Indian F&O scanner extension

The detailed daily/opening/intraday scanner requirements, DOCX stock-analysis requirements,
calculation conventions and acceptance gates are captured in [FNO_RESEARCH_DESIGN.md](FNO_RESEARCH_DESIGN.md).
This remains implementation scope, not a completed scanner or authorization for live orders.
