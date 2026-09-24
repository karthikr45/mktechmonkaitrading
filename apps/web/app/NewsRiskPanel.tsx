"use client";
import { useEffect, useState } from "react";
type Article = {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  source: string;
  instruments: string[];
};
type Settings = {
  enabled: boolean;
  watchlist: { key: string; name: string; aliases: string[] }[];
  briefingTime: string;
  cutoffTime: string;
  refreshMinutes: number;
  repeatMinutes: number;
};
type State = {
  settings: Settings;
  day: string;
  coverageOverdue: boolean;
  running: boolean;
  limitation: string;
  worker: { lastCheckedAt: string | null; error: boolean };
  checklist: {
    id: string;
    title: string;
    stage: string;
    state: string;
    due: string | null;
    note: string;
  }[];
  alerts: {
    id: string;
    severity: string;
    title: string;
    detail: string;
    created_at: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
    evidence: { url: string; source: string }[];
  }[];
  articles: { article: Article }[];
  history: { id: string; created_at: string; kind: string }[];
  latest?: {
    created_at: string;
    report: {
      evidence?: Article[];
      summary: string;
      coverage: {
        name: string;
        state: string;
        detail: string;
        checkedAt: string;
      }[];
      fundamentals: {
        instrument: string;
        retrievedAt: string;
        ratios: { name: string; company_value: string; sector_value: string }[];
      }[];
      ai: {
        state: string;
        detail: string;
        model?: string;
        result?: {
          summary: string;
          findings: {
            observation: string;
            whyItMatters: string;
            review: string;
            evidenceIds: string[];
            uncertainty: string;
          }[];
        };
      };
    };
  };
};
function when(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}
export default function NewsRiskPanel({ token }: { token: string }) {
  const [data, setData] = useState<State>(),
    [settings, setSettings] = useState<Settings>(),
    [watchlist, setWatchlist] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [showAll, setShowAll] = useState(false);
  const [plan, setPlan] = useState({
    side: "BUY",
    entry: "",
    stop: "",
    target: "",
    quantity: 1,
    riskBudget: "",
    estimatedCosts: "0",
    adverseSlippage: "0",
  });
  const [selectedBriefing, setSelectedBriefing] = useState<State["latest"]>();
  const [projection, setProjection] =
    useState<Record<string, string | boolean>>();
  async function api(path: string, body?: unknown) {
    const r = await fetch(`/api/trader${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const result = await r.json();
    if (!r.ok)
      throw new Error(result.message ?? "Research service unavailable");
    return result;
  }
  async function load() {
    const next: State = await api("");
    setData(next);
    return next;
  }
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const next: State = await api("");
        if (mounted) {
          setData(next);
          setSettings((old) => old ?? next.settings);
          setWatchlist(
            (old) =>
              old ||
              next.settings.watchlist
                .map((w) => [w.key, w.name, ...w.aliases].join(";"))
                .join("\n"),
          );
        }
      } catch {
        if (mounted)
          setError("Research service unavailable. Check API/database health.");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [token]);
  async function action(fn: () => Promise<unknown>) {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }
  if (!data || !settings)
    return (
      <div className="panel" role="status">
        {error || "Loading News & Risk Centre…"}
      </div>
    );
  const alerts = data.alerts.filter(
    (a) => showAll || (!a.acknowledged_at && !a.resolved_at),
  );
  const briefing = selectedBriefing ?? data.latest;
  const report = briefing?.report;
  return (
    <div className="researchCentre">
      <div className="panel">
        <div className="panelTitle">
          <h2>News & Risk Centre</h2>
          <button
            disabled={busy || data.running}
            onClick={() => void action(() => api("/refresh", {}))}
          >
            {busy || data.running ? "Checking…" : "Refresh research"}
          </button>
        </div>
        <p>{data.limitation}</p>
        <p role="status">
          {data.settings.enabled
            ? "Automatic local monitoring enabled"
            : "Automatic monitoring paused"}{" "}
          · Last worker check:{" "}
          {data.worker.lastCheckedAt
            ? when(data.worker.lastCheckedAt)
            : "Not yet run"}
        </p>
        {data.worker.error && (
          <p role="alert">
            Background check failed. Monitoring coverage is incomplete.
          </p>
        )}
        {data.coverageOverdue && (
          <p role="alert">
            Research coverage is overdue or has never run. No all-clear is
            available.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <details>
          <summary>Watchlist & daily schedule</summary>
          <p>
            One instrument per line: Upstox key;company name;optional alias.
            Maximum 30. These are research subscriptions; live quote
            subscriptions are configured in Real-time market.
          </p>
          <label>
            Research watchlist
            <textarea
              aria-label="Research watchlist"
              rows={5}
              value={watchlist}
              placeholder="NSE_EQ|INE002A01018;Reliance Industries;RELIANCE"
              onChange={(e) => setWatchlist(e.target.value)}
            />
          </label>
          <div className="researchFields">
            <label>
              Daily briefing (IST)
              <input
                type="time"
                value={settings.briefingTime}
                onChange={(e) =>
                  setSettings({ ...settings, briefingTime: e.target.value })
                }
              />
            </label>
            <label>
              Your verified broker cutoff (IST)
              <input
                type="time"
                value={settings.cutoffTime}
                onChange={(e) =>
                  setSettings({ ...settings, cutoffTime: e.target.value })
                }
              />
            </label>
            <label>
              Research interval (minutes)
              <input
                type="number"
                min={5}
                max={120}
                value={settings.refreshMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    refreshMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Unacknowledged reminder age (minutes)
              <input
                type="number"
                min={5}
                max={240}
                value={settings.repeatMinutes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    repeatMinutes: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
            />{" "}
            Enable automatic local checks
          </label>
          <p>
            Personal reminders run daily, including holidays. Exchange calendars
            and broker cutoffs are not automatically verified. Critical alerts
            persist until acknowledged; acknowledgement does not resolve the
            risk.
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void action(() =>
                api("/settings", {
                  ...settings,
                  watchlist: watchlist
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((line) => {
                      const [key, name, ...aliases] = line
                        .split(";")
                        .map((s) => s.trim());
                      return { key, name, aliases };
                    }),
                }),
              )
            }
          >
            Save watchlist & schedule
          </button>
        </details>
      </div>
      <div className="panel">
        <h2>Alert inbox</h2>
        <label>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />{" "}
          Include acknowledged / resolved alerts
        </label>
        {!alerts.length && (
          <p>
            No outstanding stored alerts. Check coverage below; this is not a
            market all-clear.
          </p>
        )}
        {alerts.map((a) => (
          <article className="researchCard" key={a.id}>
            <strong>
              {a.severity.toUpperCase()} · {a.title}
            </strong>
            <p>{a.detail}</p>
            <small>
              {when(a.created_at)} ·{" "}
              {a.resolved_at
                ? "Resolved"
                : a.acknowledged_at
                  ? "Acknowledged — risk may remain"
                  : "Needs acknowledgement"}
              {!a.acknowledged_at &&
              !a.resolved_at &&
              Date.now() - Date.parse(a.created_at) >
                data.settings.repeatMinutes * 60000
                ? " · Reminder overdue"
                : ""}
            </small>
            <div>
              {a.evidence.map((e, i) => (
                <a href={e.url} target="_blank" rel="noreferrer" key={i}>
                  {e.source}
                </a>
              ))}
            </div>
            {!a.acknowledged_at && !a.resolved_at && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(() => api(`/alerts/${a.id}/acknowledge`, {}))
                }
              >
                Acknowledge
              </button>
            )}
          </article>
        ))}
      </div>
      <div className="panel">
        <h2>
          {selectedBriefing
            ? "Saved briefing & coverage"
            : "Latest briefing & coverage"}
        </h2>
        {selectedBriefing && (
          <button onClick={() => setSelectedBriefing(undefined)}>
            Return to latest briefing
          </button>
        )}
        <p>{report?.summary ?? "No briefing saved yet."}</p>
        <small>
          {data.latest ? `Retrieved ${when(data.latest.created_at)} IST` : ""}
        </small>
        {report?.coverage.map((c) => (
          <article className="researchCard" key={c.name}>
            <strong>
              {c.name} · {c.state.toUpperCase()}
            </strong>
            <p>{c.detail}</p>
            <small>Checked {when(c.checkedAt)}</small>
          </article>
        ))}
        <h3>AI research</h3>
        <p>{report?.ai.detail ?? "Awaiting source evidence."}</p>
        {report?.ai.result && (
          <>
            <small>
              Model: {report.ai.model} · AI interpretation, not verified facts
            </small>
            <p>{report.ai.result.summary}</p>
            {report.ai.result.findings.map((f, i) => (
              <article key={i} className="researchCard">
                <strong>{f.observation}</strong>
                <p>{f.whyItMatters}</p>
                <p>Review: {f.review}</p>
                <p>Uncertainty: {f.uncertainty}</p>
                {f.evidenceIds.map((id) => {
                  const a =
                    report.evidence?.find((a) => a.id === id) ??
                    data.articles.find((a) => a.article.id === id)?.article;
                  return a ? (
                    <p key={id}>
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.title}
                      </a>
                    </p>
                  ) : (
                    <p key={id}>
                      Evidence retained in report; not in current article
                      window.
                    </p>
                  );
                })}
              </article>
            ))}
          </>
        )}
        <details>
          <summary>Recent briefing history ({data.history.length})</summary>
          {data.history.map((h) => (
            <p key={h.id}>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () =>
                    setSelectedBriefing(await api(`/briefings/${h.id}`)),
                  )
                }
              >
                {when(h.created_at)} · {h.kind}
              </button>
            </p>
          ))}
        </details>
      </div>
      <div className="panel">
        <h2>Today's checklist · {data.day} IST</h2>
        <p>
          Manual review does not change automated source coverage. Checks reset
          each calendar day.
        </p>
        {data.checklist.map((c) => (
          <article className="researchCard" key={c.id}>
            <strong>
              {c.stage} · {c.title}
            </strong>
            <p>
              {c.state.toUpperCase()} ·{" "}
              {c.due ? `Due ${c.due} IST` : "Configure a verified cutoff"}
            </p>
            {c.state === "checked" ? (
              <p>{c.note}</p>
            ) : (
              <>
                <input
                  aria-label={`Review note: ${c.title}`}
                  placeholder="Record what you checked (required)"
                  value={notes[c.id] ?? ""}
                  onChange={(e) =>
                    setNotes({ ...notes, [c.id]: e.target.value })
                  }
                />
                <button
                  disabled={busy || (notes[c.id]?.trim().length ?? 0) < 5}
                  onClick={() =>
                    void action(() =>
                      api("/checklist", { item: c.id, note: notes[c.id] }),
                    )
                  }
                >
                  Record review
                </button>
              </>
            )}
          </article>
        ))}
      </div>
      <div className="panel">
        <h2>Equity trade risk worksheet</h2>
        <p>
          Manual scenario calculation. It does not place an order or verify
          available margin. Costs are your total round-trip estimate; slippage
          is adverse price movement per share.
        </p>
        <div className="researchFields">
          <label>
            Side
            <select
              value={plan.side}
              onChange={(e) => (
                setProjection(undefined),
                setPlan({ ...plan, side: e.target.value })
              )}
            >
              <option>BUY</option>
              <option>SELL</option>
            </select>
          </label>
          {(
            [
              "entry",
              "stop",
              "target",
              "quantity",
              "riskBudget",
              "estimatedCosts",
              "adverseSlippage",
            ] as const
          ).map((key) => (
            <label key={key}>
              {
                {
                  entry: "Entry price",
                  stop: "Stop price",
                  target: "Target price",
                  quantity: "Quantity",
                  riskBudget: "Risk budget ₹",
                  estimatedCosts: "Estimated costs ₹",
                  adverseSlippage: "Adverse slippage / share ₹",
                }[key]
              }
              <input
                type="number"
                min={0}
                step={key === "quantity" ? 1 : "0.01"}
                value={plan[key]}
                onChange={(e) => {
                  setProjection(undefined);
                  setPlan({
                    ...plan,
                    [key]:
                      key === "quantity"
                        ? Number(e.target.value)
                        : e.target.value,
                  });
                }}
              />
            </label>
          ))}
        </div>
        <button
          disabled={busy}
          onClick={() =>
            void action(async () =>
              setProjection(await api("/risk-plan", plan)),
            )
          }
        >
          Calculate risk
        </button>
        {projection && (
          <div className="researchCard">
            <p>
              Estimated stop loss: ₹{projection.estimatedStopLoss} · Estimated
              net reward: ₹{projection.estimatedNetReward}
            </p>
            <p>
              Reward/risk: {projection.rewardRiskRatio} · Maximum quantity by
              risk: {projection.maximumQuantityByRisk}
            </p>
            <strong>
              {projection.exceedsBudget
                ? "Exceeds your risk budget"
                : "Within entered risk budget only"}
            </strong>
            <p>{projection.assumptions}</p>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>Company ratios</h2>
        <p>
          Retrieval time is shown; the provider does not supply an
          accounting-period timestamp in this endpoint. These ratios are not a
          complete fundamental analysis.
        </p>
        {!report?.fundamentals.length && <p>No company ratios available.</p>}
        {report?.fundamentals.map((f) => (
          <article className="researchCard" key={f.instrument}>
            <h3>{f.instrument}</h3>
            <small>Upstox · Retrieved {when(f.retrievedAt)}</small>
            <table>
              <thead>
                <tr>
                  <th>Ratio</th>
                  <th>Company</th>
                  <th>Sector</th>
                </tr>
              </thead>
              <tbody>
                {f.ratios.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.company_value}</td>
                    <td>{r.sector_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
      <div className="panel">
        <h2>Source news</h2>
        {!data.articles.length && (
          <p>
            No articles ingested. Configure your watchlist and Upstox access.
          </p>
        )}
        {data.articles.map(({ article: a }) => (
          <article className="researchCard" key={a.id}>
            <a href={a.url} target="_blank" rel="noreferrer">
              {a.title}
            </a>
            <p>{a.summary}</p>
            <small>
              {a.source} · Published{" "}
              {a.publishedAt ? when(a.publishedAt) : "time unavailable"} ·{" "}
              {a.instruments.join(", ") || "General / unmatched"}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}
