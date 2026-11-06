"use client";
import { useEffect, useState } from "react";
import PriceChart, { type ChartBar } from "./PriceChart";
type Frame = {
  chart?: ChartBar[];
  frame: string;
  status: string;
  reason?: string;
  intradayAccess?: string;
  bars?: number;
  asOf?: string;
  rsi?: number | null;
  rsiBand?: string;
  emaAlignment?: string;
  ema50x200?: string;
  macdCrossover?: string;
  adx14?: number | null;
  atr14?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  macdHistogram?: number | null;
  volumeVsPrevious20?: number | null;
  ema?: Record<string, number | null>;
  emaPosition?: Record<string, string>;
  classicPivots?: {
    pivot: number;
    support: number[];
    resistance: number[];
  } | null;
  fibonacciPivots?: {
    pivot: number;
    support: number[];
    resistance: number[];
  } | null;
  camarilla?: { support: number[]; resistance: number[] } | null;
};
export default function FnoTechnicals({
  token,
  initialSymbol = "",
}: {
  token: string;
  initialSymbol?: string;
}) {
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [symbol, setSymbol] = useState(initialSymbol),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [report, setReport] = useState<{
    frames: Frame[];
    retrievedAt: string;
    limitation: string;
    stock: { symbol: string };
  }>();
  const trackedSymbol = report?.stock.symbol;
  useEffect(() => {
    if (!autoRefresh || !trackedSymbol) return;
    const controller = new AbortController();
    let active = true,
      inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      setBusy(true);
      try {
        const r = await fetch("/api/fno/technicals", {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ symbol: trackedSymbol }),
        });
        const d = await r.json();
        if (!r.ok) throw Error();
        if (active) {
          setReport(d.result);
          setError("");
        }
      } catch {
        if (active)
          setError(
            "Automatic update failed. Displayed chart is the last successful snapshot; check its timestamp.",
          );
      } finally {
        inFlight = false;
        if (active) setBusy(false);
      }
    }, 60000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [autoRefresh, trackedSymbol, token]);
  const n = (v?: number | null) =>
    typeof v === "number" ? v.toFixed(2) : "Unavailable";
  async function run() {
    setAutoRefresh(false);
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/fno/technicals", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message || "Analysis unavailable");
      setReport(d.result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Stock technical analysis · six timeframes</h2>
      <p>
        Fetch current provider candles on demand. No sample data or generated
        indicator values.
      </p>
      <label>
        NSE F&O stock symbol
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
      </label>
      <button disabled={busy || !symbol.trim()} onClick={() => void run()}>
        {busy ? "Fetching six timeframes…" : "Analyse stock"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />{" "}
            Refresh this stock every 60 seconds while this tab is visible
          </label>
          <p>
            Updates use completed candles, not every market tick. Developing
            candles are excluded. Closed-market data remains the last completed
            session.
          </p>
          <h3>{report.stock.symbol}</h3>
          <PriceChart frames={report.frames} symbol={report.stock.symbol} />
          <p>
            Retrieved {report.retrievedAt}. {report.limitation}
          </p>
          <div className="marketTable">
            <table>
              <thead>
                <tr>
                  <th>Frame</th>
                  <th>Last completed bar</th>
                  <th>Bars</th>
                  <th>RSI</th>
                  <th>ADX</th>
                  <th>ATR</th>
                  <th>MACD</th>
                  <th>Signal</th>
                  <th>Histogram</th>
                  <th>Volume / prior 20 bars</th>
                </tr>
              </thead>
              <tbody>
                {report.frames.map((f) => (
                  <tr key={f.frame}>
                    <td>{f.frame}</td>
                    <td>{f.asOf ?? f.reason ?? "Unavailable"}</td>
                    <td>{f.bars ?? 0}</td>
                    <td>{n(f.rsi)}</td>
                    <td>{n(f.adx14)}</td>
                    <td>{n(f.atr14)}</td>
                    <td>{n(f.macd)}</td>
                    <td>{n(f.macdSignal)}</td>
                    <td>{n(f.macdHistogram)}</td>
                    <td>{n(f.volumeVsPrevious20)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Trend confirmations from completed candles</h3>
          <p>
            Crossovers compare the last two completed candles. They are
            observations, not entry recommendations; liquidity, news and market
            context still need confirmation.
          </p>
          <div className="marketTable">
            <table>
              <thead>
                <tr>
                  <th>Frame</th>
                  <th>EMA 10/20/50/100/200</th>
                  <th>EMA 50 / 200 cross</th>
                  <th>MACD / signal cross</th>
                </tr>
              </thead>
              <tbody>
                {report.frames
                  .filter((f) => f.status === "available")
                  .map((f) => (
                    <tr key={f.frame}>
                      <td>{f.frame}</td>
                      <td>{f.emaAlignment ?? "Unavailable"}</td>
                      <td>{f.ema50x200 ?? "Unavailable"}</td>
                      <td>{f.macdCrossover ?? "Unavailable"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {report.frames
            .filter((f) => f.status === "available")
            .map((f) => (
              <details key={f.frame}>
                <summary>
                  {f.frame} · EMA and support/resistance details
                </summary>
                <p>
                  {f.intradayAccess} · RSI classification: {f.rsiBand}
                </p>
                {Object.entries(f.ema ?? {}).map(([period, value]) => (
                  <p key={period}>
                    EMA {period}: {n(value)} · last completed close{" "}
                    {f.emaPosition?.[period]?.toLowerCase()}
                  </p>
                ))}
                {(
                  [
                    ["Classic", f.classicPivots],
                    ["Fibonacci", f.fibonacciPivots],
                    ["Camarilla", f.camarilla],
                  ] as const
                ).map(
                  ([name, levels]) =>
                    levels && (
                      <p key={name}>
                        {name} support:{" "}
                        {levels.support.map((v) => n(v)).join(", ")} ·
                        resistance:{" "}
                        {levels.resistance.map((v) => n(v)).join(", ")}
                      </p>
                    ),
                )}
              </details>
            ))}
        </>
      )}
    </section>
  );
}
