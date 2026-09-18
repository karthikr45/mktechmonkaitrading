"use client";
import { useEffect, useState } from "react";
import RealtimePanel from "./RealtimePanel";
import LocalPanels from "./LocalPanels";
import {
  Activity,
  ChartNoAxesCombined,
  ShieldCheck,
  Layers,
  BookOpen,
  Radio,
  Settings,
  FlaskConical,
  ArrowUpRight,
  OctagonPause,
} from "lucide-react";
type Order = {
  id: string;
  instrument: string;
  side: string;
  quantity: number;
  limitPrice: string;
  state: string;
  reasons: string[];
};
type Snapshot = {
  storage: string;
  positions: { instrument: string; quantity: number; cost: string }[];
  funds: string;
  killSwitch: boolean;
  ticks: { price: string; timestamp: string }[];
  orders: Order[];
  audit: { id: string; at: string; action: string }[];
  brokers: { name: string; status: string }[];
};
const tabs = [
  "Overview",
  "Real-time market",
  "Paper terminal",
  "Orders & trades",
  "Risk controls",
  "Audit trail",
  "Connections",
  "Research lab",
  "Positions",
  "Strategy library",
  "Options calculator",
  "Trade journal",
  "Reports",
  "System health",
];
export default function Page() {
  const [tab, setTab] = useState("Overview");
  const [token, setToken] = useState("");
  const [data, setData] = useState<Snapshot>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [light, setLight] = useState(false);
  const [research, setResearch] = useState<{
    returnPct: string;
    maxDrawdownPct: string;
    costs: string;
    trades: { index: number; side: string; price: string; fee: string }[];
    warnings: string[];
  }>();
  async function api(path: string, method = "GET", body?: unknown, t = token) {
    const response = await fetch("/api/" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + t,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        Array.isArray(result.message)
          ? result.message.join(", ")
          : (result.message ?? "Service unavailable"),
      );
    return result;
  }
  async function refresh(t = token) {
    setData(await api("dashboard", "GET", undefined, t));
  }
  useEffect(() => {
    fetch("/api/demo-session", { method: "POST" })
      .then((r) => {
        if (!r.ok) throw new Error("API unavailable. Start pnpm dev.");
        return r.json();
      })
      .then(async (s) => {
        setToken(s.token);
        const r = await fetch("/api/dashboard", {
          headers: { Authorization: "Bearer " + s.token },
        });
        if (!r.ok) throw new Error("Session denied");
        setData(await r.json());
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const ticks = data?.ticks ?? [];
  const price = ticks.at(-1)?.price ?? "0";
  const nums = ticks.map((t) => Number(t.price));
  const lo = Math.min(...nums) - 10;
  const hi = Math.max(...nums) + 10;
  const points = nums
    .map(
      (p, i) =>
        `${(i / (nums.length - 1)) * 900},${220 - ((p - lo) / (hi - lo)) * 190}`,
    )
    .join(" ");
  return (
    <div className={light ? "app light" : "app"}>
      <aside>
        <a className="brand" href="/">
          {" "}
          <div className="brandIcon">
            <ChartNoAxesCombined size={23} />
          </div>
          <span>
            MKTechMonk<small>TRADING INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace">
          M{" "}
          <span>
            MKTechMonk workspace<small>Internal research · India</small>
          </span>
        </div>
        <p className="navlabel">WORKSPACE</p>
        <nav>
          {tabs.map((x, i) => {
            const Icon = [
              Activity,
              Radio,
              ChartNoAxesCombined,
              Layers,
              ShieldCheck,
              BookOpen,
              Radio,
              FlaskConical,
              Layers,
              BookOpen,
              FlaskConical,
              BookOpen,
              Layers,
              Activity,
            ][i];
            return (
              <button
                key={x}
                onClick={() => setTab(x)}
                className={tab === x ? "selected" : ""}
              >
                <Icon size={18} />
                {x}
              </button>
            );
          })}
        </nav>
        <div className="asideBottom">
          <ShieldCheck size={19} />
          <p>
            Paper environment<small>No real capital at risk</small>
          </p>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Workspace <span className="muted"> / {tab}</span>
          </span>
          <div>
            <span className="pill">
              {tab === "Real-time market"
                ? "UPSTOX · PAPER EXECUTION"
                : "● SIMULATION"}
            </span>
            <button onClick={() => setLight(!light)} aria-label="Toggle theme">
              <Settings size={17} />
            </button>
            <span className="avatar">MK</span>
          </div>
        </header>
        <section className="content">
          <div className="heading">
            <div>
              <p className="eyebrow">YOUR MARKET. YOUR EDGE.</p>
              <h1>{tab === "Overview" ? "Market overview" : tab}</h1>
              <p className="muted">
                A clear view of the market, with risk at the centre.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setTab("Paper terminal")}
            >
              New paper order <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="notice">
            <Radio size={16} />
            <span>
              {tab === "Real-time market"
                ? "Upstox market data · Native PostgreSQL · Live quotes require a connected account"
                : "Synthetic replay · Native PostgreSQL · Historical simulation clock · Not live exchange data"}
            </span>
            <span className="right">PAPER ONLY</span>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              <button onClick={() => void action(() => refresh())}>
                Retry
              </button>
            </div>
          )}
          {!data && !error ? (
            <div className="panel">Loading your workspace…</div>
          ) : (
            data && (
              <>
                <div
                  className="stats"
                  hidden={tab === "Real-time market"}
                  style={
                    tab === "Real-time market" ? { display: "none" } : undefined
                  }
                >
                  {[
                    [
                      "Available paper funds",
                      "₹" + Number(data.funds).toLocaleString("en-IN"),
                      "Simulated starting capital",
                    ],
                    [
                      "DEMO NIFTY",
                      Number(price).toLocaleString("en-IN"),
                      "Synthetic index · replay",
                    ],
                    [
                      "Paper orders",
                      String(data.orders.length),
                      `${data.orders.filter((o) => o.state === "filled").length} filled · human approved`,
                    ],
                    [
                      "Risk engine",
                      data.killSwitch ? "HALTED" : "Protected",
                      data.killSwitch
                        ? "Kill switch is active"
                        : "Deterministic checks enabled",
                    ],
                  ].map(([label, value, note]) => (
                    <div className="stat" key={label}>
                      <p>{label}</p>
                      <strong>{value}</strong>
                      <small>{note}</small>
                    </div>
                  ))}
                </div>
                {tab === "Real-time market" && <RealtimePanel token={token} />}
                {tab === "Overview" && (
                  <div className="grid">
                    <div className="panel chart">
                      <div className="panelTitle">
                        <div>
                          <h2>
                            DEMO NIFTY <span className="tag">SYNTHETIC</span>
                          </h2>
                          <span className="muted">
                            Replay price · INR · {ticks.length} observations
                          </span>
                        </div>
                        <span className="positive">Seed 42</span>
                      </div>
                      <div className="chartValue">
                        {price}
                        <small>Historical demonstration</small>
                      </div>
                      <svg
                        viewBox="0 0 900 250"
                        role="img"
                        aria-label="Synthetic replay price history"
                      >
                        <defs>
                          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                            <stop stopColor="#35caa0" stopOpacity=".25" />
                            <stop
                              offset="1"
                              stopColor="#35caa0"
                              stopOpacity="0"
                            />
                          </linearGradient>
                        </defs>
                        {[30, 90, 150, 210].map((y) => (
                          <line
                            key={y}
                            x1="0"
                            x2="900"
                            y1={y}
                            y2={y}
                            stroke="var(--line)"
                          />
                        ))}
                        <polygon
                          points={`0,250 ${points} 900,250`}
                          fill="url(#fill)"
                        />
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#39d5ad"
                          strokeWidth="2.5"
                        />
                      </svg>
                      <div className="chartLabels">
                        <span>09:30 IST</span>
                        <span>09:31:00</span>
                        <span>09:31:59 IST</span>
                      </div>
                      <div className="chartFooter">
                        Feed source: deterministic synthetic generator{" "}
                        <span>Replay dataset v1</span>
                      </div>
                    </div>
                    <div className="panel">
                      <h2>Execution guardrails</h2>
                      <p className="muted">Every order passes risk review.</p>
                      {[
                        "Paper execution enforced",
                        "Order value ≤ ₹5,00,000",
                        "Quantity ≤ 100 units",
                        "Price deviation ≤ 3%",
                        "Approval before execution",
                      ].map((x) => (
                        <div className="guard" key={x}>
                          <ShieldCheck size={17} />
                          {x}
                        </div>
                      ))}
                      <button
                        className="wide"
                        disabled={busy}
                        onClick={() =>
                          void action(() => api("demo-replay", "POST", {}))
                        }
                      >
                        Run replay → strategy → risk
                      </button>
                    </div>
                  </div>
                )}
                {tab === "Paper terminal" && (
                  <div className="grid">
                    <div className="panel">
                      <h2>Create a paper order</h2>
                      <p className="muted">
                        DEMO NIFTY · Buy limit · Instant simulated fill after
                        approval
                      </p>
                      <label>
                        Quantity
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={quantity}
                          onChange={(e) => setQuantity(Number(e.target.value))}
                        />
                      </label>
                      <label>
                        Replay limit price
                        <input readOnly value={price} />
                      </label>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            api("orders", "POST", {
                              instrument: "DEMO-NIFTY",
                              side: "BUY",
                              quantity,
                              limitPrice: price,
                              idempotencyKey: crypto.randomUUID(),
                            }),
                          )
                        }
                      >
                        Submit for risk review
                      </button>
                    </div>
                    <div className="panel">
                      <h2>Before you submit</h2>
                      <p>
                        Orders use synthetic prices and virtual funds. Drafts
                        are evaluated against deterministic risk rules. Approve
                        a passing draft below to simulate its fill.
                      </p>
                      <p className="muted">
                        Orders, cash, and audit history are stored in your local
                        PostgreSQL database and survive application restarts.
                      </p>
                    </div>
                  </div>
                )}
                {tab === "Risk controls" && (
                  <div className="panel">
                    <h2>Global paper kill switch</h2>
                    <p>
                      Blocks new drafts and rechecks pending orders before
                      approval.
                    </p>
                    <button
                      disabled={busy}
                      className="danger"
                      onClick={() =>
                        void action(() =>
                          api("kill-switch", "POST", {
                            enabled: !data.killSwitch,
                          }),
                        )
                      }
                    >
                      <OctagonPause size={17} />
                      {data.killSwitch
                        ? "Resume paper trading"
                        : "Halt paper trading"}
                    </button>
                    <p className="muted">
                      Advanced exposure, Greeks, session calendars, and
                      portfolio risk policies are pending implementation.
                    </p>
                  </div>
                )}
                {tab === "Research lab" && (
                  <div className="panel">
                    <h2>Replay backtest · SMA(5)</h2>
                    <p className="muted">
                      Synthetic data · next-observation fills · 5 bps fees + 2
                      bps slippage · one-unit positions
                    </p>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          setResearch(
                            await api("research/backtests", "POST", {
                              prices: ticks.map((t) => t.price),
                              period: 5,
                            }),
                          );
                        })
                      }
                    >
                      Run reproducible backtest
                    </button>
                    {research && (
                      <>
                        <div className="stats" style={{ marginTop: 24 }}>
                          {[
                            ["Return", research.returnPct + "%"],
                            ["Maximum drawdown", research.maxDrawdownPct + "%"],
                            ["Costs", "₹" + research.costs],
                            ["Executions", String(research.trades.length)],
                          ].map(([k, v]) => (
                            <div className="stat" key={k}>
                              <p>{k}</p>
                              <strong>{v}</strong>
                            </div>
                          ))}
                        </div>
                        <p className="muted">{research.warnings.join(" · ")}</p>
                        <table>
                          <thead>
                            <tr>
                              <th>Observation</th>
                              <th>Side</th>
                              <th>Price</th>
                              <th>Fee</th>
                            </tr>
                          </thead>
                          <tbody>
                            {research.trades.map((t, i) => (
                              <tr key={i}>
                                <td>{t.index}</td>
                                <td>{t.side}</td>
                                <td>{t.price}</td>
                                <td>{t.fee}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </>
                    )}
                  </div>
                )}
                {[
                  "Positions",
                  "Strategy library",
                  "Options calculator",
                  "Trade journal",
                  "Reports",
                  "System health",
                ].includes(tab) && (
                  <LocalPanels
                    view={tab}
                    token={token}
                    positions={data.positions ?? []}
                  />
                )}
                {tab === "Connections" && (
                  <div className="panel">
                    <h2>Providers & integrations</h2>
                    {[
                      ...data.brokers,
                      { name: "AI gateway", status: "unavailable" },
                      { name: "Market replay", status: "mock" },
                    ].map((x) => (
                      <div className="connection" key={x.name}>
                        <span>{x.name}</span>
                        <span className="tag">{x.status}</span>
                      </div>
                    ))}
                    <p className="muted">
                      Real broker adapters are not implemented. Credentials
                      cannot enable live execution in this build.
                    </p>
                  </div>
                )}
                {["Overview", "Paper terminal", "Orders & trades"].includes(
                  tab,
                ) && (
                  <div className="panel">
                    <div className="panelTitle">
                      <h2>Order activity</h2>
                      <span className="muted">{data.orders.length} orders</span>
                    </div>
                    {data.orders.length === 0 ? (
                      <div className="empty">
                        <Layers />
                        <h3>Your paper trading starts here</h3>
                        <p>
                          Create a paper order to see risk checks, approvals and
                          fills.
                        </p>
                        <button onClick={() => setTab("Paper terminal")}>
                          Open paper terminal →
                        </button>
                      </div>
                    ) : (
                      <div className="tableWrap">
                        <table>
                          <thead>
                            <tr>
                              {[
                                "Instrument",
                                "Side",
                                "Qty",
                                "Limit",
                                "Status",
                                "Action",
                              ].map((x) => (
                                <th key={x}>{x}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.orders.map((o) => (
                              <tr key={o.id}>
                                <td>{o.instrument}</td>
                                <td className="positive">{o.side}</td>
                                <td>{o.quantity}</td>
                                <td>₹{o.limitPrice}</td>
                                <td>
                                  <span className="tag">
                                    {o.state.replaceAll("_", " ")}
                                  </span>
                                  {o.reasons.length > 0 && (
                                    <small>{o.reasons.join(", ")}</small>
                                  )}
                                </td>
                                <td>
                                  {o.state === "pending_approval" && (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        void action(() =>
                                          api(
                                            `orders/${o.id}/approve`,
                                            "POST",
                                            {},
                                          ),
                                        )
                                      }
                                    >
                                      Approve paper fill
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
                {tab === "Audit trail" && (
                  <div className="panel">
                    <h2>Audit history</h2>
                    <p className="muted">
                      Hash chained · protected PostgreSQL audit records
                    </p>
                    {data.audit.length === 0 ? (
                      <p>No events yet.</p>
                    ) : (
                      data.audit
                        .slice()
                        .reverse()
                        .map((a) => (
                          <div className="connection" key={a.id}>
                            <span>{a.action}</span>
                            <time>
                              {new Date(a.at).toLocaleString("en-IN", {
                                timeZone: "Asia/Kolkata",
                              })}{" "}
                              IST
                            </time>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </>
            )
          )}
          <footer>
            MKTechMonk AI Trading Platform{" "}
            <span>Research & decision support. No guaranteed returns.</span>
          </footer>
        </section>
      </main>
    </div>
  );
}
