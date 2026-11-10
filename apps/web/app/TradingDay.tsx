"use client";
import { useEffect, useState } from "react";
import GlobalOutlook from "./GlobalOutlook";
type Briefing = {
  coverageOverdue: boolean;
  latest?: {
    created_at: string;
    report: { summary: string; ai?: { result?: { summary: string } } };
  };
  alerts: {
    id: string;
    title: string;
    detail: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
  }[];
  checklist: { id: string; title: string; state: string; due?: string }[];
  worker: { error: boolean; lastCheckedAt?: string };
};
const steps = [
  [
    "01",
    "Prepare",
    "Read market context and news. Check coverage before trusting a cue.",
    "News & risk",
    "Review news & alerts",
  ],
  [
    "02",
    "Investigate",
    "Find a stock, compare its chart and derivatives evidence.",
    "F&O scanner",
    "Find stocks",
  ],
  [
    "03",
    "Validate",
    "Study historical outcomes and sample limits before planning risk.",
    "Backtest",
    "Open backtest",
  ],
  [
    "04",
    "Plan",
    "Record entry, invalidation, target, costs and your loss budget.",
    "Trade journal",
    "Create a trade plan",
  ],
  [
    "05",
    "Monitor & review",
    "Follow actual quotes, then record what happened and what you learned.",
    "Real-time market",
    "Monitor prices",
  ],
];
export default function TradingDay({
  token,
  onNavigate,
}: {
  token: string;
  onNavigate: (tab: string) => void;
}) {
  const [state, setState] = useState<Briefing>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/trader", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok)
          throw Error(
            "Daily briefing could not be loaded. Open Connections to check the local services.",
          );
        const value = await response.json();
        if (!controller.signal.aborted) {
          setState(value);
          setError("");
        }
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Briefing unavailable");
      } finally {
        pending = false;
      }
    };
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [token]);
  const alerts =
    state?.alerts.filter((a) => !a.resolved_at && !a.acknowledged_at) ?? [];
  return (
    <>
      <section className="dayHero">
        <div>
          <p className="eyebrow">YOUR DAILY WORKSPACE</p>
          <h2>Prepare. Investigate. Plan.</h2>
          <p>
            Start with the market, follow the evidence, and define your risk
            before taking a trade.
          </p>
        </div>
        <button
          className="primaryAction"
          onClick={() => onNavigate("Stock workspace")}
        >
          Analyse a stock →
        </button>
      </section>
      <div className="dailySteps">
        {steps.map(([number, title, description, tab, label]) => (
          <article key={number} className="stepCard">
            <span className="stepNumber">{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
            <button onClick={() => onNavigate(tab)}>{label} →</button>
          </article>
        ))}
      </div>
      <div className="dayColumns">
        <section className="panel">
          <p className="eyebrow">RESEARCH BRIEFING</p>
          <h2>What needs your attention</h2>
          {error && (
            <p role="alert">
              {error} Any displayed briefing is the last successfully loaded
              record.
            </p>
          )}
          {!state && !error && (
            <p role="status">Loading your saved briefing…</p>
          )}
          {state && (
            <>
              <p className="muted">
                {state.latest
                  ? `Saved ${new Date(state.latest.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`
                  : "No briefing has been generated yet."}
              </p>
              {state.coverageOverdue && (
                <p className="dataWarning">
                  Briefing overdue or unavailable. Refresh research before
                  relying on it.
                </p>
              )}
              {state.worker.error && (
                <p role="alert">The last background research check failed.</p>
              )}
              <p>
                {state.latest?.report.ai?.result?.summary ??
                  state.latest?.report.summary ??
                  "Open News & alerts to generate a report from available sources."}
              </p>
              <p className="muted">
                AI interpretation of supplied evidence, not a validated daily
                forecast.
              </p>
              {alerts.slice(0, 3).map((a) => (
                <div className="attentionItem" key={a.id}>
                  <strong>{a.title}</strong>
                  <p>{a.detail}</p>
                </div>
              ))}
              <button onClick={() => onNavigate("News & risk")}>
                Review news and alerts
                {alerts.length ? ` (${alerts.length})` : ""} →
              </button>
            </>
          )}
        </section>
        <section className="panel">
          <p className="eyebrow">PRE-TRADE CHECKLIST</p>
          <h2>Your next checks</h2>
          {state?.checklist
            .filter((c) => c.state !== "checked")
            .slice(0, 5)
            .map((c) => (
              <div className="attentionItem" key={c.id}>
                <strong>{c.title}</strong>
                <p className="muted">
                  {c.due ? `${c.due} IST · ` : ""}
                  {c.state}
                </p>
              </div>
            ))}
          {state && !state.checklist.some((c) => c.state !== "checked") && (
            <p>
              Your saved checklist is complete. This records your review, not
              automatic trade approval.
            </p>
          )}
          {!state && (
            <p>Checklist status will appear when the local service responds.</p>
          )}
          <button onClick={() => onNavigate("News & risk")}>
            Open full checklist →
          </button>
          <p className="muted">
            No orders are submitted by this workspace. Live account positions
            and protective exits are not connected.
          </p>
        </section>
      </div>
      <GlobalOutlook token={token} onNavigate={onNavigate} />
    </>
  );
}
