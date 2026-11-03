"use client";
import { useEffect, useState } from "react";
import StockResearch from "./StockResearch";
import FnoTechnicals from "./FnoTechnicals";
import RealtimePanel from "./RealtimePanel";
type Side = {
  instrument_key: string;
  market_data: {
    oi: number;
    prev_oi: number;
    volume: number;
    bid_price: number;
    ask_price: number;
    ltp: number;
  };
  option_greeks?: { iv: number };
};
type Stock = { symbol: string; key: string; future: string; expiry: string };
type Snapshot = {
  stock: Stock;
  retrievedAt: string;
  quoteFreshness: string;
  spot: { last_price: number; timestamp: string } | null;
  future: { last_price: number; oi?: number; timestamp: string } | null;
  spotChangePct: number | null;
  futuresPriceChangePct: number | null;
  futuresOiChangePct: number | null;
  baselineDate: string | null;
  futuresStructure: string;
  failures: string[];
  limitation: string;
  optionChain: {
    expiry: string;
    completeness?: string;
    maxPain: number | null;
    maxPainNote: string;
    strikes: number;
    callOi: number;
    putOi: number;
    totalOiChangePct: number | null;
    callOiChangePct: number | null;
    putOiChangePct: number | null;
    pcr: number | null;
    pcrChange: number | null;
    callWall: number;
    putWall: number;
    limitation: string;
    rows: { strike: number; call: Side; put: Side }[];
  } | null;
};
const number = (n?: number | null) =>
  n == null
    ? "Unavailable"
    : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const percent = (n?: number | null) =>
  n == null ? "Unavailable" : `${n.toFixed(2)}%`;
export default function StockWorkspace({ token }: { token: string }) {
  const [watchMessage, setWatchMessage] = useState("");
  const [watchBusy, setWatchBusy] = useState(false);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState("");
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fno/symbols", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Current F&O universe could not be loaded");
        return r.json();
      })
      .then((d) => setStocks(d.stocks))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    if (!symbol) return;
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setBusy(true);
      try {
        const r = await fetch("/api/fno/stock", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol }),
          signal: controller.signal,
        });
        const body = await r.json();
        if (!r.ok) throw Error(body.message ?? "Stock data unavailable");
        if (!controller.signal.aborted) {
          setData(body);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            (e instanceof Error ? e.message : "Request failed") +
              ". Any displayed values are the last successful snapshot.",
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void load();
    const timer = setInterval(() => {
      if (refresh && !document.hidden) void load();
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [token, symbol, refresh, revision]);
  async function watch() {
    setWatchBusy(true);
    setWatchMessage("");
    try {
      const r = await fetch("/api/fno/stock/watch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message ?? "Could not save watchlist");
      setWatchMessage(
        `${d.symbol} added to news monitoring. ${d.enabled ? `Checks run about every ${d.refreshMinutes} minutes while the local server is running.` : "Monitoring is disabled; enable it in News & AI research."} Review alerts in News & AI research.`,
      );
    } catch (e) {
      setWatchMessage(e instanceof Error ? e.message : "Watchlist save failed");
    } finally {
      setWatchBusy(false);
    }
  }
  const chain = data?.optionChain;
  return (
    <div className="outlook">
      <section className="panel">
        <h2>Research one stock</h2>
        <p>
          Select from the current provider F&O universe. This view separates
          cash movement, futures OI and option-chain OI so they cannot be
          confused.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = input.trim().toUpperCase();
            if (!stocks.some((s) => s.symbol.toUpperCase() === next)) {
              setError("Select a symbol from the current F&O universe");
              return;
            }
            if (next !== symbol) {
              setData(undefined);
              setWatchMessage("");
            }
            setSymbol(next);
            setRevision((r) => r + 1);
          }}
        >
          <label>
            Stock symbol
            <input
              list="fno-stock-symbols"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
            />
          </label>
          <datalist id="fno-stock-symbols">
            {stocks.map((s) => (
              <option key={s.key} value={s.symbol} />
            ))}
          </datalist>
          <button disabled={busy || !input.trim() || !stocks.length}>
            {busy ? "Fetching provider data…" : "Open stock"}
          </button>
        </form>
        <p>
          {stocks.length
            ? `${stocks.length} current stock symbols available`
            : "Loading current instrument list…"}
        </p>
        <label>
          <input
            type="checkbox"
            checked={refresh}
            onChange={(e) => setRefresh(e.target.checked)}
          />{" "}
          Refresh quote and chain snapshots every 30 seconds while visible
        </label>
        {error && <p role="alert">{error}</p>}
      </section>
      {data && (
        <>
          <section className="panel">
            <h2>{data.stock.symbol} · price and derivatives</h2>
            <button disabled={watchBusy} onClick={() => void watch()}>
              Watch this stock for news alerts
            </button>
            {watchMessage && <p role="status">{watchMessage}</p>}
            <p>{data.quoteFreshness}</p>
            <p>
              Retrieved{" "}
              {new Date(data.retrievedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST · Source: Upstox
            </p>
            <div className="stats">
              {[
                ["Cash price", number(data.spot?.last_price)],
                ["Cash price change", percent(data.spotChangePct)],
                ["Futures price change", percent(data.futuresPriceChangePct)],
                ["Futures OI change", percent(data.futuresOiChangePct)],
                [
                  "Returned option-chain OI change",
                  percent(chain?.totalOiChangePct),
                ],
                ["Futures structure", data.futuresStructure],
              ].map(([label, value]) => (
                <div className="stat" key={label}>
                  <p>{label}</p>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p>
              Futures expiry {data.stock.expiry}; previous-session OI baseline{" "}
              {data.baselineDate ?? "unavailable"}. Structures are observations
              under your configured thresholds, not recommendations.
            </p>
            {data.failures.map((f) => (
              <p role="alert" key={f}>
                {f}
              </p>
            ))}
            <p>{data.limitation}</p>
          </section>
          <RealtimePanel
            key={symbol}
            token={token}
            instrumentKeys={[data.stock.key, data.stock.future]}
          />
          <section className="panel">
            <h2>Option chain · {data.stock.expiry}</h2>
            {!chain ? (
              <p>
                Provider option chain unavailable. No sample strikes are shown.
              </p>
            ) : (
              <>
                <p>
                  {chain.strikes} returned strikes · PCR {number(chain.pcr)} ·
                  Change in PCR {number(chain.pcrChange)} · Call OI{" "}
                  {number(chain.callOi)} ({percent(chain.callOiChangePct)}) ·
                  Put OI {number(chain.putOi)} ({percent(chain.putOiChangePct)})
                </p>
                <p>
                  Highest call OI strike {number(chain.callWall)} · Highest put
                  OI strike {number(chain.putWall)}. These are concentrations,
                  not guaranteed resistance/support.
                </p>
                <p>
                  {chain.completeness ??
                    "Contract-list completeness not verified"}
                  . Max pain: {number(chain.maxPain)}. {chain.maxPainNote}
                </p>
                <p>{chain.limitation}</p>
                <details>
                  <summary>Inspect all {chain.strikes} option strikes</summary>
                  <div className="marketTable">
                    <table>
                      <thead>
                        <tr>
                          <th>Call OI</th>
                          <th>Call OI Δ%</th>
                          <th>Call volume*</th>
                          <th>Call IV</th>
                          <th>Call bid / ask</th>
                          <th>Strike</th>
                          <th>Put bid / ask</th>
                          <th>Put IV</th>
                          <th>Put volume*</th>
                          <th>Put OI Δ%</th>
                          <th>Put OI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...chain.rows]
                          .sort((a, b) => a.strike - b.strike)
                          .map((r) => (
                            <tr key={r.strike}>
                              <td>{number(r.call.market_data.oi)}</td>
                              <td>
                                {percent(
                                  r.call.market_data.prev_oi > 0
                                    ? (100 *
                                        (r.call.market_data.oi -
                                          r.call.market_data.prev_oi)) /
                                        r.call.market_data.prev_oi
                                    : null,
                                )}
                              </td>
                              <td>{number(r.call.market_data.volume)}</td>
                              <td>{number(r.call.option_greeks?.iv)}</td>
                              <td>
                                {number(r.call.market_data.bid_price)} /{" "}
                                {number(r.call.market_data.ask_price)}
                              </td>
                              <td>{number(r.strike)}</td>
                              <td>
                                {number(r.put.market_data.bid_price)} /{" "}
                                {number(r.put.market_data.ask_price)}
                              </td>
                              <td>{number(r.put.option_greeks?.iv)}</td>
                              <td>{number(r.put.market_data.volume)}</td>
                              <td>
                                {percent(
                                  r.put.market_data.prev_oi > 0
                                    ? (100 *
                                        (r.put.market_data.oi -
                                          r.put.market_data.prev_oi)) /
                                        r.put.market_data.prev_oi
                                    : null,
                                )}
                              </td>
                              <td>{number(r.put.market_data.oi)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <small>
                  *Raw provider units; not asserted to be contract counts. Zero
                  bid/ask is not executable liquidity.
                </small>
              </>
            )}
          </section>
          <StockResearch
            key={`research-${symbol}`}
            token={token}
            symbol={symbol}
          />
          <FnoTechnicals
            key={`technical-${symbol}`}
            token={token}
            initialSymbol={symbol}
          />
        </>
      )}
    </div>
  );
}
