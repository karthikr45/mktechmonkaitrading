"use client";
import { useEffect, useState } from "react";
import { SSEParser } from "../lib/sse";
type Quote = {
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
export default function RealtimePanel({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [transport, setTransport] = useState("Connecting to local API…");
  const [accessToken, setAccessToken] = useState("");
  const [keys, setKeys] = useState("NSE_INDEX|Nifty 50\nNSE_INDEX|Nifty Bank");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    let failures = 0;
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
              setQuotes(
                Object.fromEntries(next.quotes.map((q) => [q.instrument, q])),
              );
            }
            if (frame.event === "tick") {
              const quote = frame.data as Quote;
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
      <small>{transport} · Market data only · Execution remains paper</small>
      <p>
        Enter your Upstox access token, or leave it blank to use the local
        server configuration. Tokens entered here stay in server memory until
        disconnect or restart.
      </p>
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
      {error && <p role="alert">{error}</p>}
      {!Object.keys(quotes).length ? (
        <p>
          No Upstox quotes received. Connect with a valid token to subscribe.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>LTP</th>
                <th>Previous close</th>
                <th>Last trade (IST)</th>
                <th>Freshness</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(quotes).map((q) => (
                <tr key={q.instrument}>
                  <td>{q.instrument}</td>
                  <td>{q.price}</td>
                  <td>{q.previousClose ?? "—"}</td>
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
