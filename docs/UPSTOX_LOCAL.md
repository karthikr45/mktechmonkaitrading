# Upstox local market feed

Implemented September 18, 2026. Market-data integration only; broker order placement is not implemented.

1. Run `pnpm dev` from the repository. PostgreSQL continues to use the native local service.
2. Open http://127.0.0.1:3200 and select **Real-time market**.
3. Obtain a valid Upstox access token through your Upstox developer account. See [Upstox authentication](https://upstox.com/developer/api-documentation/authentication/). OAuth sign-in inside this application is not implemented yet.
4. Enter the token in the password field. Alternatively, set `UPSTOX_ACCESS_TOKEN` in the ignored local `.env` and restart the API. Do not commit or paste credentials into documentation.
5. Keep the default Nifty 50 / Nifty Bank keys, or enter your Upstox instrument keys, one per line. Select **Connect Upstox**.

The server authorizes a V3 WebSocket, subscribes in binary LTPC mode, decodes the official Protobuf schema, and streams quotes to authenticated browser clients using SSE. One upstream connection is shared across tabs in the same local workspace. The application limits each subscription to 50 instruments and five downstream streams. Market status, exchange last-trade time and stale quotes are shown separately from local connection health.

Browser-entered broker tokens are held only in server memory and cleared on disconnect, logout, authorization failure, or process restart. An environment token remains in `.env` until removed. Tokens are never returned by status endpoints or included in audit records. Local demo sessions still all share the `mk-demo` workspace; this is not multi-user production identity.

Reconnects reauthorize and resubscribe with exponential backoff, jitter and a retry limit. A fresh snapshot replaces the current view. Upstox LTPC has no exchange sequence in this schema: local sequence numbers are delivery ordering only, and missed ticks cannot be reconstructed. Duplicate and out-of-order last-trade updates are suppressed. A 45-second upstream inactivity watchdog reconnects dead sockets. Browser heartbeats detect stalled local connections. Expired local sessions close their streams.

Limits: no tick/candle database retention yet, no instrument-master search, no full depth/options feed, no OAuth callback or automatic token renewal, no Upstox orders/portfolio integration. Live credentials and a real exchange feed are required for end-to-end acceptance. Mocked tests verify binary decode, subscriptions, rejection handling, reconnect/resubscribe and lifecycle races; they do not certify an actual Upstox account connection.

Sources: [V3 market feed](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/), [authorized feed URL](https://upstox.com/developer/api-documentation/get-market-data-feed-authorize-v3/). The official schema is vendored at `apps/api/src/upstox/MarketDataFeed.proto`, downloaded from https://assets.upstox.com/feed/market-data-feed/v3/MarketDataFeed.proto on September 18, 2026. Runtime local builds retain this source asset.
