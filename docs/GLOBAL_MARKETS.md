# Global outlook and dashboard

The default Today screen prioritizes regional coverage, daily preparation and international
headlines. Synthetic prices and funds appear in the paper workspace, not the daily market
brief. Five primary navigation entries are visible; existing paper tools, reports and system
health are accessible through “Show paper trading & tools”. No existing records are deleted.

## Enable quotes

No subscription was purchased and no credentials were added. The server adapter uses the
Twelve Data `/quote` endpoint. Verify your account's exact symbol identity, exchange and
entitlements before configuring any instrument. Index marketing pages are not proof of
usable API coverage. GIFT Nifty in particular may require another licensed adapter.

1. Put `TWELVE_DATA_API_KEY` in your ignored local `.env`.
2. Set `GLOBAL_MARKET_SYMBOLS` to a JSON object mapping catalog IDs to verified provider symbols.
   For example `{"NVDA":"NVDA","MSFT":"MSFT"}` enables just those two instruments.
3. Restart `pnpm dev`. Open Global markets and inspect each row's timestamp, session and status.
4. Start small: batch requests can charge a credit per symbol. Up to 40 catalog instruments
   are requested at most once per 15 minutes while the panel is being viewed or a scheduled news briefing runs. Background briefings run only while the local API is running. Failed fetches are also cached to limit retries.

Catalog IDs:
- US: sp500, nasdaq (Nasdaq 100), dow, russell
- Asia-Pacific: nikkei, topix, kospi, kosdaq, taiwan, shanghai, csi300, hangseng, hangsengtech, asx, sti
- Europe: stoxx600, eurostoxx, dax, cac, ftse
- India: nifty, sensex, banknifty, gift
- FX: usdinr, usdjpy, eurusd, usdcnh, dxy
- Risk context: indiavix, brent, gold, us10y
- US technology: NVDA, MSFT, GOOGL, AAPL, AMZN, META, TSLA

An unsupported mapping produces unavailable data, never synthetic prices. Matching the
returned symbol is required; exchange-level identity must be checked during setup. No
unofficial proxy, ETF substitution or inferred futures contract is used. Only the configured
public symbols and provider key are sent to Twelve Data; no portfolio or database credentials.

## Interpretation

Percentage change is computed from the provider's previous close. Regional breadth uses
only its named index group, with all members required for a colour summary. At least 70%
above +0.1% means mostly rising; at least 70% below -0.1% means mostly falling. Otherwise mixed.
This descriptive heuristic is not backtested, a buy/sell signal or an India prediction.
Magnificent Seven prices are shown separately and never double-counted in index breadth.
Open quotes older than 20 minutes and closed quotes older than 96 hours are stale. These
conservative time thresholds do not replace exchange holidays or independent latency checks.
Every quote shows its own timestamp. Closed-session and open-session observations can differ
in date. A futures-to-spot opening-gap calculation is deliberately absent.

BBC Business headlines are fetched from the fixed public RSS endpoint, limited to eight
items from the last 72 hours, with original links and publication times. Headlines are not
AI-generated research, complete international news coverage, or used to assign sentiment.
No full-article copying or paywall bypass. Feed failure is shown explicitly.

## Remaining dependencies and limits

The credentials-free state is verified locally; provider-authenticated quotes require an
actual subscribed account and acceptance testing. No economic-event calendar, FII/DII feed,
advance/decline feed, after-hours prices, earnings dates or cross-market forecasting is
implemented here. Global snapshots are cached in memory and retained with saved News & risk briefings.
Up to five international headlines join up to ten watchlist articles as evidence for the
existing local AI summarizer when configured. Up to 40 eligible timestamped quotes also enter AI evidence; stale or invalid observations are excluded. AI explains the supplied observations and missing coverage, without inventing forecasts or assuming US technology determines India.
Coverage gaps use the existing persistent alert inbox; external notifications are not implemented.

Sources: https://twelvedata.com/docs ; https://support.twelvedata.com/en/articles/5620513-how-to-find-all-available-symbols-at-twelve-data
