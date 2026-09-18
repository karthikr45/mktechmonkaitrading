"use client";
import { useState, useEffect } from "react";
type Entry = {
  id: string;
  note?: string;
  tags?: string[];
  created_at: string;
  kind?: string;
  definition?: { name: string; quantity: number; entry: { period: number } };
  result?: { returnPct?: string; costs?: string };
};
type Position = { instrument: string; quantity: number; cost: string };
export default function LocalPanels({
  view,
  token,
  positions,
}: {
  view: string;
  token: string;
  positions: Position[];
}) {
  const [rows, setRows] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [name, setName] = useState("My SMA strategy"),
    [period, setPeriod] = useState(20),
    [quantity, setQuantity] = useState(1),
    [note, setNote] = useState(""),
    [spot, setSpot] = useState("22500"),
    [strike, setStrike] = useState("22500"),
    [vol, setVol] = useState(20),
    [days, setDays] = useState(30),
    [option, setOption] = useState<{
      price: number;
      delta: number;
      gamma: number;
      vegaPerOnePercent: number;
      assumptions: string;
    }>(),
    [health, setHealth] = useState<{
      analytics: string;
      database: { status: string; databaseVersion: string };
      ai: string;
      extensions: string;
    }>();
  async function call(path: string, body?: unknown) {
    const r = await fetch("/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.message ?? "Local service unavailable");
    return result;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const route =
      view === "Strategy library"
        ? "strategies"
        : view === "Trade journal"
          ? "journal"
          : view === "Reports"
            ? "research"
            : view === "System health"
              ? "operations"
              : null;
    if (!route) {
      setLoading(false);
      return;
    }
    fetch("/api/" + route, { headers: { Authorization: "Bearer " + token } })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load local data");
        return r.json();
      })
      .then((value) => {
        if (active) {
          if (view === "System health") setHealth(value);
          else setRows(value);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, token]);
  async function act(fn: () => Promise<void>) {
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
  return (
    <div className="panel">
      <h2>{view}</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading local records…</p>
      ) : (
        <>
          {view === "Positions" &&
            (positions.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Quantity</th>
                    <th>Acquisition cost</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.instrument}>
                      <td>{p.instrument}</td>
                      <td>{p.quantity}</td>
                      <td>₹{p.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>
                No paper positions yet. Approve a paper order to create one.
              </p>
            ))}
          {view === "Strategy library" && (
            <>
              <p className="muted">
                Save a versioned SMA rule. Strategies remain research
                definitions and do not enable automated execution.
              </p>
              <div className="formGrid">
                <label>
                  Strategy name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label>
                  SMA period
                  <input
                    type="number"
                    min={2}
                    max={200}
                    value={period}
                    onChange={(e) => setPeriod(Number(e.target.value))}
                  />
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </label>
              </div>
              <p>
                Buy {quantity} DEMO-NIFTY when price exceeds SMA({period}).
                Planned stop 1%, target 2%. Human approval required; stop
                execution is not implemented.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await call("strategies", {
                      version: 1,
                      name,
                      instrument: "DEMO-NIFTY",
                      timeframe: "1m",
                      entry: {
                        indicator: "SMA",
                        period,
                        operator: "price_above",
                      },
                      quantity,
                      stopLossPct: 1,
                      targetPct: 2,
                      enabled: false,
                    });
                    setRows(await call("strategies"));
                  })
                }
              >
                Save strategy
              </button>
              {rows.map((r) => (
                <div className="connection" key={r.id}>
                  <span>
                    {r.definition?.name} · SMA({r.definition?.entry.period}) ·{" "}
                    {r.definition?.quantity} units
                  </span>
                  <span className="tag">Saved v1</span>
                </div>
              ))}
            </>
          )}
          {view === "Trade journal" && (
            <>
              <label>
                Trade thesis or review
                <textarea
                  value={note}
                  maxLength={10000}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Record your reasoning and what you learned…"
                />
              </label>
              <button
                className="primary"
                disabled={busy || !note.trim()}
                onClick={() =>
                  void act(async () => {
                    await call("journal", { note, tags: ["local-research"] });
                    setNote("");
                    setRows(await call("journal"));
                  })
                }
              >
                Save journal note
              </button>
              {rows.length === 0 && (
                <p className="muted">No notes saved yet.</p>
              )}
              {rows.map((r) => (
                <article className="journalNote" key={r.id}>
                  <p>{r.note}</p>
                  <small>
                    {new Date(r.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}{" "}
                    IST
                  </small>
                </article>
              ))}
            </>
          )}
          {view === "Reports" &&
            (rows.length ? (
              rows.map((r) => (
                <div className="connection" key={r.id}>
                  <span>
                    {r.kind} ·{" "}
                    {new Date(r.created_at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                    })}
                  </span>
                  <span>
                    {r.result?.returnPct !== undefined
                      ? "Return " + r.result.returnPct + "%"
                      : "Calculation saved"}
                  </span>
                </div>
              ))
            ) : (
              <p>
                No research runs saved. Run a backtest in Research lab or price
                an option.
              </p>
            ))}
          {view === "Options calculator" && (
            <>
              <p className="muted">
                European call · no dividends · 6% continuously compounded rate.
                Theoretical calculation, not a live quote or trading
                recommendation.
              </p>
              <div className="formGrid">
                <label>
                  Spot price
                  <input
                    value={spot}
                    onChange={(e) => setSpot(e.target.value)}
                  />
                </label>
                <label>
                  Strike price
                  <input
                    value={strike}
                    onChange={(e) => setStrike(e.target.value)}
                  />
                </label>
                <label>
                  Days to expiry
                  <input
                    type="number"
                    min={1}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  />
                </label>
                <label>
                  Volatility %
                  <input
                    type="number"
                    min={1}
                    value={vol}
                    onChange={(e) => setVol(Number(e.target.value))}
                  />
                </label>
              </div>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void act(async () =>
                    setOption(
                      await call("research/options", {
                        spot: Number(spot),
                        strike: Number(strike),
                        years: days / 365,
                        rate: 0.06,
                        volatility: vol / 100,
                        kind: "call",
                      }),
                    ),
                  )
                }
              >
                Calculate option
              </button>
              {option && (
                <>
                  <div className="stats" style={{ marginTop: 20 }}>
                    {[
                      ["Premium", option.price],
                      ["Delta", option.delta],
                      ["Gamma", option.gamma],
                      ["Vega / 1%", option.vegaPerOnePercent],
                    ].map(([k, v]) => (
                      <div className="stat" key={String(k)}>
                        <p>{k}</p>
                        <strong>{Number(v).toFixed(4)}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="muted">{option.assumptions}</p>
                </>
              )}
            </>
          )}
          {view === "System health" && health && (
            <>
              <div className="connection">
                <span>Native PostgreSQL {health.database.databaseVersion}</span>
                <span className="positive">{health.database.status}</span>
              </div>
              <div className="connection">
                <span>Python analytics</span>
                <span>{health.analytics}</span>
              </div>
              <div className="connection">
                <span>AI provider</span>
                <span>{health.ai}</span>
              </div>
              <p className="muted">{health.extensions}</p>
              <p className="muted">
                Real broker feeds, Redis workers, ML registry and external
                notifications are not connected. This status does not imply the
                full proposal is complete.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
