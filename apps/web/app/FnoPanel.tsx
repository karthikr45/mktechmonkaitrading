"use client";
import { useEffect, useState } from "react";
import FnoBacktest from "./FnoBacktest";
import FnoTechnicals from "./FnoTechnicals";
type Filters = {
  priceMove: number;
  oiChange: number;
  optionVolumeIncrease: number;
  deliveryPct: number;
  turnoverCrore: number;
  optionContracts: number;
  horizon: string;
};
type Run = {
  id: string;
  state: string;
  created_at: string;
  progress: {
    phase?: string;
    processed?: number;
    total?: number;
    message?: string;
  };
};
type Stock = {
  key: string;
  symbol: string;
  decision: string;
  reason: string;
  spotPrice?: number;
  spotChangePct?: number;
  asOf?: string;
  futuresStructure?: string;
  futuresOiChangePct?: number | null;
  missing: string[];
  daily?: {
    bars: number;
    asOf: string;
    rsi: number | null;
    ema: Record<string, number | null>;
    fibonacciPivots: {
      pivot: number;
      support: number[];
      resistance: number[];
    } | null;
  };
  optionChain?: {
    expiry: string;
    strikes: number;
    pcr: number | null;
    callWall: number;
    putWall: number;
    callOiChangePct: number | null;
    putOiChangePct: number | null;
    limitation: string;
  };
};
type Report = Run & {
  result?: {
    rows: Stock[];
    limitation: string;
    universe: { publishedAt: string; stocks: unknown[] };
    marketRegime: string;
    marketStrengthScore: null;
  };
};
export default function FnoPanel({ token }: { token: string }) {
  const percent = (value?: number | null) =>
    value !== undefined && value !== null && Number.isFinite(value)
      ? `${value.toFixed(2)}%`
      : "Not verified";
  const [filters, setFilters] = useState<Filters>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [report, setReport] = useState<Report>();
  const [stock, setStock] = useState<Stock>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [explanation, setExplanation] = useState("");
  async function request(path: string, method = "GET", body?: unknown) {
    const r = await fetch("/api/fno" + path, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.message ?? "Scanner unavailable");
    return data;
  }
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/fno", {
          headers: { Authorization: "Bearer " + token },
        });
        if (!r.ok)
          throw Error(
            "Scanner unavailable. Check database migrations and API.",
          );
        const s = await r.json();
        if (active) {
          setRuns(s.runs);
          setFilters((f) => f ?? s.settings.filters);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Scanner unavailable");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const active = runs.find((r) => r.state === "running");
  return (
    <div className="outlook">
      <FnoTechnicals token={token} />
      <FnoBacktest token={token} />
      <section className="panel">
        <h2>F&O research scanner</h2>
        <p>
          Uses the current Upstox NSE stock-derivative instrument file,
          cash/futures quotes, daily history and expiry-specific chains. No
          sample market data.
        </p>
        <p className="muted">
          This build collects price/OI observations. Full trade qualification is
          not enabled: restrictions, delivery/turnover reports, events and
          multi-timeframe confirmation are still missing. Missing data never
          becomes a trade signal.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {filters && (
          <>
            <details>
              <summary>Configure scan filters</summary>
              <label>
                Research horizon
                <select
                  value={filters.horizon}
                  onChange={(e) =>
                    setFilters({ ...filters, horizon: e.target.value })
                  }
                >
                  {["intraday", "swing", "positional"].map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </label>
              <p>
                Horizon is saved for the report; horizon-specific qualification
                is not yet active.
              </p>
              <p>
                These thresholds are user-defined screening rules. Historical
                success rates and out-of-sample validation are not available.
              </p>
              {(
                [
                  ["priceMove", "Absolute price movement %"],
                  ["oiChange", "Absolute futures OI change %"],
                  [
                    "optionVolumeIncrease",
                    "Option volume increase % — awaiting baseline feed",
                  ],
                  [
                    "deliveryPct",
                    "Delivery preference % — awaiting report feed",
                  ],
                  [
                    "turnoverCrore",
                    "Average cash turnover ₹ crore — awaiting report feed",
                  ],
                  [
                    "optionContracts",
                    "Option contracts preference — awaiting verified units",
                  ],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters({ ...filters, [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <button
                disabled={busy || !!active}
                onClick={() =>
                  void action(async () => {
                    await request("/settings", "POST", filters);
                  })
                }
              >
                Save filters
              </button>
            </details>
            <button
              className="primary"
              disabled={busy || !!active}
              onClick={() =>
                void action(async () => {
                  await request("/settings", "POST", filters);
                  await request("/scan", "POST");
                  setReport(undefined);
                  setStock(undefined);
                })
              }
            >
              Start provider scan
            </button>
          </>
        )}
        {active && (
          <p aria-live="polite">
            {active.progress.phase}: {active.progress.processed ?? 0}/
            {active.progress.total ?? "—"}{" "}
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await request("/runs/" + active.id + "/cancel", "POST");
                })
              }
            >
              Cancel scan
            </button>
          </p>
        )}
      </section>
      <section className="panel">
        <h2>Saved runs</h2>
        {!runs.length && <p>No scan has been run.</p>}
        {runs.map((r) => (
          <div className="outlookHeadline" key={r.id}>
            <button
              disabled={busy || r.state === "running"}
              onClick={() =>
                void action(async () => {
                  setReport(await request("/runs/" + r.id));
                  setStock(undefined);
                  setExplanation("");
                })
              }
            >
              {new Date(r.created_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST · {r.state}
            </button>
            <p>
              {r.progress.message ??
                `${r.progress.processed ?? 0}/${r.progress.total ?? "—"} processed`}
            </p>
          </div>
        ))}
      </section>
      {report?.result && (
        <section className="panel">
          <h2>Saved observations</h2>
          <p>{report.result.limitation}</p>
          <p>
            Universe: {report.result.universe.stocks.length} stocks · Published{" "}
            {report.result.universe.publishedAt}. Market regime:{" "}
            {report.result.marketRegime ?? "Unavailable"}; strength score
            unavailable.
          </p>
          <div className="marketTable">
            <table>
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Cash price change %</th>
                  <th>Futures OI change %</th>
                  <th>Total option-chain OI change %</th>
                  <th>Futures structure</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {report.result.rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <button
                        onClick={() => {
                          setStock(r);
                          setExplanation("");
                        }}
                      >
                        {r.symbol}
                      </button>
                    </td>
                    <td>{percent(r.spotChangePct)}</td>
                    <td>{percent(r.futuresOiChangePct)}</td>
                    <td>Not verified</td>
                    <td>{r.futuresStructure ?? "Not evaluated"}</td>
                    <td>{r.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {stock && (
        <section className="panel">
          <h2>{stock.symbol} · saved research</h2>
          <p>{stock.reason}</p>
          <p>
            Observation: {stock.asOf ?? "Unavailable"} · Cash price:{" "}
            {stock.spotPrice ?? "Unavailable"}
          </p>
          <h3>Missing qualification inputs</h3>
          <ul>
            {stock.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          {stock.daily && (
            <>
              <h3>Completed daily bars</h3>
              <p>
                {stock.daily.bars} bars through {stock.daily.asOf}; RSI(14):{" "}
                {stock.daily.rsi?.toFixed(2) ?? "Insufficient history"}
              </p>
              {Object.entries(stock.daily.ema).map(([p, v]) => (
                <p key={p}>
                  EMA {p}: {v?.toFixed(2) ?? "Insufficient history"}
                </p>
              ))}
              {stock.daily.fibonacciPivots && (
                <p>
                  Previous daily Fibonacci pivot:{" "}
                  {stock.daily.fibonacciPivots.pivot.toFixed(2)} · Support:{" "}
                  {stock.daily.fibonacciPivots.support
                    .map((n) => n.toFixed(2))
                    .join(", ")}{" "}
                  · Resistance:{" "}
                  {stock.daily.fibonacciPivots.resistance
                    .map((n) => n.toFixed(2))
                    .join(", ")}
                </p>
              )}
            </>
          )}
          {stock.optionChain && (
            <>
              <h3>Option-chain observations</h3>
              <p>
                Returned strikes only; total-chain completeness is not verified.
                These option OI observations are separate from futures OI.
              </p>
              <p>
                Returned call OI change:{" "}
                {percent(stock.optionChain.callOiChangePct)}
                {" · "}Returned put OI change:{" "}
                {percent(stock.optionChain.putOiChangePct)}. Comparisons use the
                provider’s previous-OI fields.
              </p>
              <p>
                Expiry {stock.optionChain.expiry} · {stock.optionChain.strikes}{" "}
                strikes · OI PCR{" "}
                {stock.optionChain.pcr?.toFixed(2) ?? "Unavailable"}
              </p>
              <p>
                Highest call OI strike {stock.optionChain.callWall}; highest put
                OI strike {stock.optionChain.putWall}.
              </p>
              <p>{stock.optionChain.limitation}</p>
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const a = await request(
                  "/runs/" + report!.id + "/explain",
                  "POST",
                  { key: stock.key },
                );
                setExplanation(a.result?.summary ?? a.detail);
              })
            }
          >
            Explain saved evidence with local AI
          </button>
          {explanation && <p>{explanation}</p>}
        </section>
      )}
    </div>
  );
}
