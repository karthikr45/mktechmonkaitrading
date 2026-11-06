"use client";
import { useEffect, useState } from "react";
import PriceChart, { type ChartBar } from "./PriceChart";
import { SSEParser } from "../lib/sse";
type Quote = {
  candles?: Omit<ChartBar, "ema20" | "ema50" | "rsi">[];
  openInterest?: number;
  averageTradedPrice?: number;
  tradedVolume?: number;
  instrument: string;
  price: string;
  previousClose: string | null;
  timestamp: string;
  receivedAt: string;
  sequence: number;
  source: string;
};
type Status = {
  state: string;
  message: string;
  epoch: string;
  marketStatus: Record<string, string>;
  quotes: Quote[];
};
export default function RealtimePanel({
  token,
  instrumentKeys,
  instrumentNames = {},
}: {
  token: string;
  instrumentKeys?: string[];
  instrumentNames?: Record<string, string>;
}) {
  const [candleHistory, setCandleHistory] = useState<
    Record<string, ChartBar[]>
  >({});
  const [history, setHistory] = useState<Record<string, Quote[]>>({});
  const [status, setStatus] = useState<Status>();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [transport, setTransport] = useState("Connecting to local API…");
  const [accessToken, setAccessToken] = useState("");
  const [keys, setKeys] = useState(
    instrumentKeys?.join("\n") ?? "NSE_INDEX|Nifty 50\nNSE_INDEX|Nifty Bank",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const selectedKeys = instrumentKeys?.join("\n") ?? "";
  useEffect(() => {
    if (!selectedKeys) return;
    const controller = new AbortController();
    setKeys(selectedKeys);
    setQuotes({});
    setHistory({});
    setCandleHistory({});
    setBusy(true);
    setError("");
    fetch("/api/brokers/upstox/connect", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ instrumentKeys: selectedKeys.split("\n") }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw Error(body.message ?? "Selected stock subscription failed");
        if (!controller.signal.aborted) setStatus(body);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Subscription unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [selectedKeys, token]);
  const requestedKeys = selectedKeys ? new Set(selectedKeys.split("\n")) : null;
  const visibleQuotes = Object.values(quotes).filter(
    (q) => !requestedKeys || requestedKeys.has(q.instrument),
  );

  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let failures = 0;
    let epoch = "";
    let lastReceived = Date.now();
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - lastReceived > 10000)
        setTransport("Local stream stalled; reconnecting…");
    }, 1000);
    async function connect() {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const attempt = new AbortController();
      const abort = () => attempt.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      const watchdog = setInterval(() => {
        if (Date.now() - lastReceived > 12000) attempt.abort();
      }, 1000);
      lastReceived = Date.now();
      try {
        const response = await fetch("/api/market/stream", {
          headers: { Authorization: `Bearer ${token}` },
          signal: attempt.signal,
        });
        if (response.status === 401) {
          setTransport("Local session expired. Reload the page.");
          return;
        }
        if (!response.ok || !response.body)
          throw new Error("Stream unavailable");
        reader = response.body.getReader();
        const parser = new SSEParser();
        const decoder = new TextDecoder();
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          lastReceived = Date.now();
          failures = 0;
          setTransport("Local stream connected");
          for (const frame of parser.push(
            decoder.decode(value, { stream: true }),
          )) {
            if (frame.event === "session-expired") {
              setTransport("Local session expired. Reload the page.");
              return;
            }
            if (frame.event === "status") {
              const next = frame.data as Status;
              setStatus(next);
              if (epoch !== next.epoch) {
                epoch = next.epoch;
                setHistory({});
                setCandleHistory({});
              }
              setQuotes(
                Object.fromEntries(next.quotes.map((q) => [q.instrument, q])),
              );
            }
            if (frame.event === "tick") {
              const quote = frame.data as Quote;
              setHistory((old) => {
                const series = old[quote.instrument] ?? [];
                if (series.at(-1)?.sequence === quote.sequence) return old;
                return {
                  ...old,
                  [quote.instrument]: [...series, quote].slice(-200),
                };
              });
              setQuotes((old) =>
                old[quote.instrument]?.sequence >= quote.sequence
                  ? old
                  : { ...old, [quote.instrument]: quote },
              );
            }
          }
        }
      } catch {
        /* User-visible reconnect status below; never log credential-bearing requests. */
      } finally {
        clearInterval(watchdog);
        controller.signal.removeEventListener("abort", abort);
        await reader?.cancel().catch(() => {});
        attempt.abort();
      }
      if (!controller.signal.aborted) {
        setTransport("Local stream disconnected; reconnecting…");
        retry = setTimeout(
          () => void connect(),
          Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)),
        );
      }
    }
    void connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      clearInterval(timer);
    };
  }, [token]);
  useEffect(() => {
    setCandleHistory((old) => {
      const next = { ...old };
      for (const q of Object.values(quotes)) {
        if (!q.candles?.length) continue;
        const bars = new Map((old[q.instrument] ?? []).map((b) => [b.time, b]));
        for (const bar of q.candles)
          bars.set(bar.time, { ...bar, ema20: null, ema50: null, rsi: null });
        next[q.instrument] = [...bars.values()]
          .sort((a, b) => a.time.localeCompare(b.time))
          .slice(-120);
      }
      return next;
    });
  }, [quotes]);
  async function action(connect: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/brokers/upstox/${connect ? "connect" : "disconnect"}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            connect
              ? {
                  ...(accessToken.trim()
                    ? { accessToken: accessToken.trim() }
                    : {}),
                  instrumentKeys: keys
                    .split(/[\n,]/)
                    .map((k) => k.trim())
                    .filter(Boolean),
                }
              : {},
          ),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? "Connection request failed");
      setAccessToken("");
      setStatus(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <div className="panelTitle">
        <h2>Upstox real-time market feed</h2>
        <span className="tag">{status?.state ?? "Loading"}</span>
      </div>
      <p role="status">{status?.message ?? "Checking connection…"}</p>
      <small>{transport} · Market data only · No orders placed</small>
      <p>
        Connect using the credentials already configured on your local server.
        Prices update when Upstox sends a new quote; a connected socket alone
        does not mean the market is open.
      </p>
      <div>
        <button disabled={busy} onClick={() => void action(true)}>
          Connect live prices
        </button>{" "}
        <button disabled={busy} onClick={() => void action(false)}>
          Disconnect
        </button>
      </div>
      <details>
        <summary>Connection settings & instruments</summary>
        <div
          style={{ display: "grid", gap: 12, maxWidth: 620, margin: "20px 0" }}
        >
          <label>
            Upstox access token
            <input
              aria-label="Upstox access token"
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </label>
          <label>
            Instrument keys (one per line, up to 50)
            <textarea
              aria-label="Instrument keys"
              rows={3}
              value={keys}
              onChange={(e) => setKeys(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>
          <div>
            <button disabled={busy} onClick={() => void action(true)}>
              Connect Upstox
            </button>{" "}
            <button disabled={busy} onClick={() => void action(false)}>
              Disconnect
            </button>
          </div>
        </div>
      </details>
      {error && <p role="alert">{error}</p>}
      {Object.entries(history)
        .filter(
          ([instrument]) => !requestedKeys || requestedKeys.has(instrument),
        )
        .map(([instrument, series]) => {
          if (series.length < 2)
            return (
              <p key={instrument}>
                {instrumentNames[instrument] ?? instrument}: waiting for a
                second provider tick to draw the price graph.
              </p>
            );
          const prices = series.map((q) => Number(q.price));
          const lo = Math.min(...prices),
            hi = Math.max(...prices);
          const points = prices
            .map(
              (v, i) =>
                `${20 + (i / (prices.length - 1)) * 760},${180 - ((v - lo) / (hi - lo || 1)) * 150}`,
            )
            .join(" ");
          return (
            <figure key={instrument}>
              <figcaption>
                {instrumentNames[instrument] ?? instrument} · Received tick
                prices · {series.length} observations
              </figcaption>
              <svg
                viewBox="0 0 800 210"
                role="img"
                aria-label={`${instrument} received tick price chart`}
                style={{ width: "100%", maxWidth: 900 }}
              >
                <polyline
                  points={points}
                  fill="none"
                  stroke="#45d8b3"
                  strokeWidth="2"
                />
                <text x="20" y="205" fill="currentColor">
                  {lo.toFixed(2)} – {hi.toFixed(2)}
                </text>
              </svg>
              <small>
                {new Date(series[0].timestamp).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                })}{" "}
                –{" "}
                {new Date(series.at(-1)!.timestamp).toLocaleTimeString(
                  "en-IN",
                  {
                    timeZone: "Asia/Kolkata",
                  },
                )}{" "}
                IST · Equal spacing per received tick, not time bars. History
                starts when this view opens.
              </small>
            </figure>
          );
        })}
      {Object.entries(candleHistory)
        .filter(
          ([instrument]) => !requestedKeys || requestedKeys.has(instrument),
        )
        .map(([instrument, bars]) => (
          <div key={instrument}>
            <p>
              Source: Upstox WebSocket ·{" "}
              {now - Date.parse(bars.at(-1)!.time) > 120000
                ? "Older candle / closed or inactive session. "
                : ""}
              {status?.state === "connected"
                ? "Connected; check candle times and market status"
                : "Disconnected; retained candles are historical"}
            </p>
            <PriceChart
              key={instrument}
              streaming
              symbol={instrumentNames[instrument] ?? instrument}
              frames={[{ frame: "1m", chart: bars }]}
            />
          </div>
        ))}
      {!visibleQuotes.length ? (
        <p>
          No quotes received for the requested instruments. Check subscription
          status and provider access.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>LTP</th>
                <th>Previous close</th>
                <th>OI</th>
                <th>Average traded price</th>
                <th>Traded volume</th>
                <th>Last trade (IST)</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {visibleQuotes.map((q) => (
                <tr key={q.instrument}>
                  <td>{instrumentNames[q.instrument] ?? q.instrument}</td>
                  <td>{q.price}</td>
                  <td>{q.previousClose ?? "—"}</td>
                  <td>{q.openInterest ?? "—"}</td>
                  <td>{q.averageTradedPrice ?? "—"}</td>
                  <td>{q.tradedVolume ?? "—"}</td>
                  <td>
                    {new Date(q.timestamp).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </td>
                  <td>
                    {status?.state !== "connected" ||
                    now - Date.parse(q.timestamp) > 30000 ||
                    now - Date.parse(q.receivedAt) > 30000
                      ? "STALE / inactive"
                      : "Recent trade"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        Market segments:{" "}
        {Object.entries(status?.marketStatus ?? {})
          .map(([segment, state]) => `${segment}: ${state}`)
          .join(" · ") || "Awaiting Upstox market status"}
      </p>
      <small>
        Last-trade age can increase while markets are closed or an instrument is
        inactive. Reconnects fetch a fresh snapshot; missed ticks are not
        replayed.
      </small>
    </div>
  );
}
