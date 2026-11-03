"use client";
import { useEffect, useState } from "react";
import FnoPanel from "./FnoPanel";
import FnoTechnicals from "./FnoTechnicals";
import GlobalOutlook from "./GlobalOutlook";
import NewsRiskPanel from "./NewsRiskPanel";
import RealtimePanel from "./RealtimePanel";
import LocalPanels from "./LocalPanels";
import DataStatus from "./DataStatus";
const menus = [
  [
    "Today",
    "Today",
    "Start with market context, check news and risks, then investigate a stock.",
  ],
  [
    "Market charts",
    "Charts & indicators",
    "Study provider candles across six timeframes with EMA, RSI, MACD, ADX and volume. Completed candles refresh on request or every minute when enabled.",
  ],
  [
    "Real-time market",
    "Live prices",
    "Connect to Upstox for streaming prices. Check the last-trade time and exchange status before acting.",
  ],
  [
    "F&O scanner",
    "F&O research & backtests",
    "Compare price, futures OI and option-chain evidence, then test fixed rules on available historical futures data.",
  ],
  [
    "News & risk",
    "News & AI research",
    "Read sourced news, coverage warnings and evidence-linked Ollama analysis. Missing evidence is shown explicitly.",
  ],
  [
    "Global markets",
    "Global markets",
    "Review international market context. Quotes are cached snapshots; timestamps and coverage identify what is available.",
  ],
  [
    "Trade journal",
    "Trade journal",
    "Save your thesis, risk plan and review notes in your local database.",
  ],
  [
    "Data status",
    "Data & AI status",
    "Check actual service availability. Connected services do not guarantee complete exchange coverage or a successful research report.",
  ],
];
export default function Page() {
  const [tab, setTab] = useState("Today");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [light, setLight] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/demo-session", { method: "POST", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok)
          throw Error(
            "Cannot connect to the local API. Check that the server and PostgreSQL are running.",
          );
        return r.json();
      })
      .then((s) => setToken(s.token))
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);
  const menu = menus.find((m) => m[0] === tab) ?? menus[0];
  return (
    <div className={light ? "app light" : "app"}>
      <aside>
        <a className="brand" href="/">
          MKTechMonk
        </a>
        <p className="muted">Market research & decision support</p>
        <nav aria-label="Research tools">
          {menus.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "selected" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="asideBottom">
          <p>
            Local research workspace<small>No order execution</small>
          </p>
        </div>
      </aside>
      <main>
        <header>
          <span>{menu[1]}</span>
          <button onClick={() => setLight(!light)}>
            {light ? "Dark" : "Light"} theme
          </button>
        </header>
        <h1>{menu[1]}</h1>
        <p className="muted">{menu[2]}</p>
        {error && <p role="alert">{error}</p>}
        {!token && !error && (
          <p role="status">Connecting to your research workspace…</p>
        )}
        {token && (
          <>
            {tab === "Today" && (
              <GlobalOutlook token={token} compact onNavigate={setTab} />
            )}
            {tab === "Global markets" && (
              <GlobalOutlook token={token} onNavigate={setTab} />
            )}
            {tab === "Market charts" && <FnoTechnicals token={token} />}
            {tab === "Real-time market" && <RealtimePanel token={token} />}
            {tab === "F&O scanner" && <FnoPanel token={token} />}
            {tab === "News & risk" && <NewsRiskPanel token={token} />}
            {tab === "Trade journal" && (
              <LocalPanels view="Trade journal" token={token} positions={[]} />
            )}
            {tab === "Data status" && <DataStatus token={token} />}
          </>
        )}
        <p className="muted">
          Research supports your decisions; it does not guarantee returns.
          Unavailable data is never replaced with sample market values.
        </p>
      </main>
    </div>
  );
}
