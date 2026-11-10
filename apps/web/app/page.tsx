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
import TradingDay from "./TradingDay";
import FnoBacktest from "./FnoBacktest";
const menus = [
  [
    "Today",
    "Trading day",
    "Your daily starting point: market context, news, attention items and the next step.",
  ],
  [
    "F&O scanner",
    "Find stocks",
    "Scan current F&O stocks for price and OI observations. Results are not qualified trade recommendations.",
  ],
  [
    "Stock workspace",
    "Stock analysis",
    "Choose a stock and review price, derivatives, financial statements and source-linked AI research.",
  ],
  [
    "Market charts",
    "Charts & indicators",
    "Inspect six timeframes and completed-candle indicators for your selected stock.",
  ],
  [
    "Backtest",
    "Backtest",
    "Evaluate fixed price/OI rules on available daily futures history. Review costs and sample limits.",
  ],
  [
    "Trade journal",
    "Plan & journal",
    "Define your entry, invalidation, target and loss budget. Save your reasoning and review notes.",
  ],
  [
    "Real-time market",
    "Monitor",
    "Watch provider prices and candles. This is market monitoring, not a broker positions screen.",
  ],
  [
    "News & risk",
    "News & alerts",
    "Read Indian and world news, review source coverage and manage your daily checklist.",
  ],
  [
    "Global markets",
    "World markets",
    "Compare India, US, Asia-Pacific, Europe, currencies and the seven US technology stocks.",
  ],
  [
    "Data status",
    "Connections",
    "Check Upstox, global data and local AI. Review ICICI Direct onboarding requirements.",
  ],
];
const nextSteps: Record<string, [string, string]> = {
  "F&O scanner": ["Stock workspace", "Next: investigate a stock"],
  "Stock workspace": ["Market charts", "Next: inspect the chart"],
  "Market charts": ["Backtest", "Next: test historical rules"],
  Backtest: ["Trade journal", "Next: write a risk plan"],
  "Trade journal": ["Real-time market", "Next: monitor prices"],
  "Real-time market": ["Trade journal", "Review your plan & journal"],
  "News & risk": ["Stock workspace", "Next: investigate a stock"],
};
export default function Page() {
  const [tab, setTab] = useState("Today");
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
        <p className="muted">Your trading day, step by step</p>
        <nav aria-label="Daily trading workflow">
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
        <div className="pageHeading">
          <h1>{menu[1]}</h1>
          {nextSteps[tab] && (
            <button onClick={() => setTab(nextSteps[tab][0])}>
              {nextSteps[tab][1]} →
            </button>
          )}
        </div>
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
              <TradingDay token={token} onNavigate={setTab} />
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
              <FnoPanel
                token={token}
                onInvestigate={(stock) => {
                  setSelectedStock(stock);
                  setTab("Stock workspace");
                }}
              />
            )}
            {tab === "Backtest" && (
              <FnoBacktest
                token={token}
                initialSymbol={selectedStock?.symbol}
              />
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
