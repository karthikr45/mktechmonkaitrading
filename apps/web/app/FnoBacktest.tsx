"use client";
import { useEffect, useState } from "react";
type Segment = {
  bars: number;
  tradeCount: number;
  winRatePct: number | null;
  meanNetReturnPct: number | null;
  sampleAssessment: string;
  winRate95IntervalPct: number[] | null;
  trades: {
    signalAt: string;
    entryAt: string;
    exitAt: string;
    direction: string;
    netPct: number;
  }[];
};
type Study = {
  id: string;
  result: {
    stock: { symbol: string; future: string; expiry: string };
    source: string;
    retrievedAt: string;
    dataHash: string;
    earlierPeriod: Segment;
    laterPeriod: Segment;
    assumptions: string[];
  };
};
export default function FnoBacktest({ token }: { token: string }) {
  const [form, setForm] = useState({
    symbol: "",
    priceMove: 1.8,
    oiChange: 10,
    holdBars: 1,
    costBps: 10,
    slippageBps: 5,
  });
  const [studies, setStudies] = useState<Study[]>([]),
    [selected, setSelected] = useState<Study>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/fno/backtests", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Historical studies unavailable");
        return r.json();
      })
      .then((data) => {
        if (active) setStudies(data);
      })
      .catch(() => {
        if (active) setError("Could not load saved historical studies");
      });
    return () => {
      active = false;
    };
  }, [token]);
  async function run() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/fno/backtests", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.message || "Historical study failed");
      setSelected(data);
      setStudies((s) => [data, ...s].slice(0, 10));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Study failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Historical futures price/OI study</h2>
      <p>
        Real provider daily candles for the selected stock’s current nearest
        futures contract. This tests fixed price/OI rules; it is not yet an
        intraday or full portfolio backtest.
      </p>
      <label>
        Current NSE F&O stock symbol
        <input
          value={form.symbol}
          placeholder="Enter exchange symbol"
          onChange={(e) =>
            setForm({ ...form, symbol: e.target.value.toUpperCase() })
          }
        />
      </label>
      {(
        [
          ["priceMove", "Absolute futures price move %"],
          ["oiChange", "Absolute futures OI change %"],
          ["holdBars", "Holding sessions (1–10)"],
          ["costBps", "Assumed costs per side (basis points)"],
          ["slippageBps", "Assumed adverse slippage per side (basis points)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            type="number"
            min="0"
            step="any"
            value={form[key]}
            onChange={(e) =>
              setForm({ ...form, [key]: Number(e.target.value) })
            }
          />
        </label>
      ))}
      <button disabled={busy || !form.symbol.trim()} onClick={() => void run()}>
        {busy ? "Fetching and testing history…" : "Run historical study"}
      </button>
      {error && <p role="alert">{error}</p>}
      <h3>Saved studies</h3>
      {!studies.length && <p>No historical studies yet.</p>}
      {studies.map((s) => (
        <button key={s.id} onClick={() => setSelected(s)}>
          {s.result.stock.symbol} ·{" "}
          {new Date(s.result.retrievedAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST
        </button>
      ))}
      {selected && (
        <>
          <h3>
            {selected.result.stock.symbol} · expiry{" "}
            {selected.result.stock.expiry}
          </h3>
          <p>
            {selected.result.source} · {selected.result.stock.future}
          </p>
          <div className="marketTable">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Bars</th>
                  <th>Trades</th>
                  <th>Net win rate</th>
                  <th>95% sampling interval</th>
                  <th>Mean net return / trade</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Earlier 70%", selected.result.earlierPeriod],
                    ["Later 30%", selected.result.laterPeriod],
                  ] as const
                ).map(([label, s]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{s.bars}</td>
                    <td>{s.tradeCount}</td>
                    <td>
                      {s.winRatePct === null
                        ? "Unavailable"
                        : s.winRatePct.toFixed(2) + "%"}
                    </td>
                    <td>
                      {s.winRate95IntervalPct
                        ?.map((n) => n.toFixed(1) + "%")
                        .join(" – ") ?? "Unavailable"}
                    </td>
                    <td>
                      {s.meanNetReturnPct === null
                        ? "Unavailable"
                        : s.meanNetReturnPct.toFixed(2) + "%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {selected.result.laterPeriod.sampleAssessment}. Results do not
            establish future success.
          </p>
          <details>
            <summary>Execution ledger</summary>
            <div className="marketTable">
              <table>
                <thead>
                  <tr>
                    <th>Signal date</th>
                    <th>Entry date</th>
                    <th>Exit date</th>
                    <th>Direction</th>
                    <th>Net return</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...selected.result.earlierPeriod.trades,
                    ...selected.result.laterPeriod.trades,
                  ].map((t) => (
                    <tr key={t.signalAt}>
                      <td>{t.signalAt.slice(0, 10)}</td>
                      <td>{t.entryAt.slice(0, 10)}</td>
                      <td>{t.exitAt.slice(0, 10)}</td>
                      <td>{t.direction}</td>
                      <td>{t.netPct.toFixed(3)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Assumptions and reproducibility</summary>
            <ul>
              {selected.result.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
            <p>Data SHA-256: {selected.result.dataHash}</p>
          </details>
        </>
      )}
    </section>
  );
}
