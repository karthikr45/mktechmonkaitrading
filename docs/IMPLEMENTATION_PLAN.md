# Living implementation plan

## Current objective
Complete the client research and trading requirements using actual provider data,
native local PostgreSQL and local Ollama. The complete product is not achieved.

## Current verified checkpoint — 6 November 2026
- Current F&O instruments, stock quotes, option chains, six-frame technical
  charts, streamed provider candles, and source-backed stock research are implemented.
- Four financial statement sections now feed the UI and Ollama evidence.
- Shared selected-stock context, source attribution, and structured cash trade
  plans are implemented. Trade plans do not execute orders.
- 74 unit tests, typecheck, lint, build and F&O persistence/isolation checks pass.
  Live dependency and RELIANCE research checks pass. Local services are running.
- Final browser acceptance is pending after Chrome launch failed in this environment.

## Remaining work
1. Session VWAP and qualified breakout/breakdown rules, full liquidity/spread and
   restriction checks, sector comparison, regime scoring and ranked trade research.
2. Delivery, FII/DII, corporate/economic events and remaining international coverage.
3. Historical derivatives access, rollover and statistically supported thresholds;
   full backtesting with costs, out-of-sample validation and sufficient history.
4. Portfolio, broker reconciliation/execution and full risk controls.
5. Production authentication/permissions, durable monitoring, external alerts,
   operations and complete client acceptance including market-hours endurance.

No static fallback prices or invented missing evidence should be displayed.
Provider credentials alone cannot complete the remaining software requirements.
See CLIENT_ACCEPTANCE.md for dated evidence and limitations, FEATURE_AUDIT.md
for the original proposal audit, and product/MASTER_REQUIREMENTS.md for scope.
