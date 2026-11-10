"use client";
import { useEffect, useState } from "react";
type Status = {
  checkedAt: string;
  database: { status: string };
  analytics: string;
  ai: string;
  marketFeed: { state: string; message: string; quotes: unknown[] };
  globalMarkets: {
    quotes: { id: string; state: string; price?: number | string | null }[];
  };
};
export default function DataStatus({ token }: { token: string }) {
  const [data, setData] = useState<Status>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/operations", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Could not check services");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  return (
    <section className="panel">
      <h2>Broker & data connections</h2>
      <div className="brokerSetup">
        <h3>ICICI Direct · Breeze</h3>
        <p>
          Not connected. An ICICI Direct trading account, registered Breeze app
          and authenticated session are required. The Breeze adapter is not
          implemented; entering a key will not activate it yet.
        </p>
        <a
          href="https://api.icicidirect.com/apiuser/home"
          target="_blank"
          rel="noreferrer"
        >
          Open official Breeze registration ↗
        </a>
        <p className="muted">
          Keep credentials in your local .env. Upstox remains the active
          integration. Neither connection currently submits live orders from
          this application.
        </p>
      </div>
      <h3>Measured service status</h3>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p>Checking services…</p>}
      {data && (
        <>
          <p>
            Checked{" "}
            {new Date(data.checkedAt).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST. Reopen this menu to check again.
          </p>
          <div className="connection">
            <span>PostgreSQL</span>
            <span>{data.database.status}</span>
          </div>
          <div className="connection">
            <span>Analytics service</span>
            <span>{data.analytics}</span>
          </div>
          <div className="connection">
            <span>Local AI</span>
            <span>{data.ai}</span>
          </div>
          <p>
            Ollama explains supplied market and news evidence. It is not a price
            feed. Review News & AI research for the latest report and source
            coverage.
          </p>
          <div className="connection">
            <span>Upstox streaming</span>
            <span>
              {data.marketFeed.state} · {data.marketFeed.quotes.length}{" "}
              instruments received
            </span>
          </div>
          <p>{data.marketFeed.message}</p>
          <p>
            Use Live prices to connect the configured Upstox credentials. Charts
            and F&O research separately request provider snapshots.
          </p>
          <h3>Global instrument coverage</h3>
          <p>
            {
              data.globalMarkets.quotes.filter((q) => q.state === "available")
                .length
            }{" "}
            / {data.globalMarkets.quotes.length} instruments currently
            available.{" "}
            {
              data.globalMarkets.quotes.filter((q) => q.state === "stale")
                .length
            }{" "}
            stale.
          </p>
          <p>
            Global markets shows timestamps, freshness and unavailable coverage
            for each instrument. Upstox indices use a one-minute cache and
            Twelve Data stocks a 15-minute cache.
          </p>
          <p>
            Historical backtests use available provider history and disclose
            sample limits. Delivery, complete historical option chains and full
            international exchange coverage are not yet verified.
          </p>
        </>
      )}
    </section>
  );
}
