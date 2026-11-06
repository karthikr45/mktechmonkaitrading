"use client";
import { useEffect, useState } from "react";
import FnoPanel from "./FnoPanel";
import FnoTechnicals from "./FnoTechnicals";
import GlobalOutlook from "./GlobalOutlook";
import NewsRiskPanel from "./NewsRiskPanel";
import RealtimePanel from "./RealtimePanel";
import TradeJournal from "./TradeJournal";
import StockWorkspace from "./StockWorkspace";
import DataStatus from "./DataStatus";
const menus = [
  [
    "Stock workspace",
    "Stock workspace",
    "Select a stock once to review its price, futures OI, option chain and technical charts.",
  ],
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
    "Review international market context. Upstox indices and Twelve Data stocks/FX use separate refresh schedules. Timestamps and coverage identify what is available.",
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
  const [tab, setTab] = useState("Stock workspace");
  const [token, setToken] = useState("");
  const [selectedStock, setSelectedStock] = useState<{
    symbol: string;
    key: string;
    future: string;
  } | null>(null);
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
        {selectedStock && (
          <p className="stockContext">
            Selected stock: <strong>{selectedStock.symbol}</strong> ·{" "}
            <button onClick={() => setTab("Stock workspace")}>
              Open stock workspace
            </button>
          </p>
        )}
        <p className="muted">{menu[2]}</p>
        {error && <p role="alert">{error}</p>}
        {!token && !error && (
          <p role="status">Connecting to your research workspace…</p>
        )}
        {token && (
          <>
            {tab === "Stock workspace" && (
              <StockWorkspace
                token={token}
                initialSymbol={selectedStock?.symbol}
                onSelect={setSelectedStock}
              />
            )}
            {tab === "Today" && (
              <GlobalOutlook token={token} compact onNavigate={setTab} />
            )}
            {tab === "Global markets" && (
              <GlobalOutlook token={token} onNavigate={setTab} />
            )}
            {tab === "Market charts" && (
              <FnoTechnicals
                token={token}
                initialSymbol={selectedStock?.symbol}
              />
            )}
            {tab === "Real-time market" && (
              <RealtimePanel
                token={token}
                instrumentNames={
                  selectedStock
                    ? {
                        [selectedStock.key]: `${selectedStock.symbol} · Cash`,
                        [selectedStock.future]: `${selectedStock.symbol} · Futures`,
                      }
                    : undefined
                }
                instrumentKeys={
                  selectedStock
                    ? [selectedStock.key, selectedStock.future]
                    : undefined
                }
              />
            )}
            {tab === "F&O scanner" && (
              <FnoPanel token={token} initialSymbol={selectedStock?.symbol} />
            )}
            {tab === "News & risk" && <NewsRiskPanel token={token} />}
            {tab === "Trade journal" && (
              <TradeJournal
                token={token}
                initialSymbol={selectedStock?.symbol}
              />
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
