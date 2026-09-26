"use client";
import { useEffect, useState } from "react";
type Quote = {
  id: string;
  name: string;
  group: string;
  state: string;
  price?: number;
  changePct?: number;
  asOf?: string;
  session?: string;
  reason?: string;
  currency?: string;
};
type Outlook = {
  checkedAt: string;
  configured: boolean;
  quotes: Quote[];
  regions: {
    group: string;
    status: string;
    available: number;
    total: number;
  }[];
  news: {
    id: string;
    title: string;
    url: string;
    publishedAt: string | null;
  }[];
  newsStatus: string;
  interpretation: string;
  limitations: string[];
};
export default function GlobalOutlook({
  token,
  compact = false,
  onNavigate,
}: {
  token: string;
  compact?: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [data, setData] = useState<Outlook>();
  const [error, setError] = useState("");
  const [group, setGroup] = useState("US");
  const [tasks, setTasks] = useState<{ title: string; state: string }[]>([]);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/global-markets", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw Error();
        const value = await r.json();
        if (active) {
          setData(value);
          setError("");
        }
      } catch {
        if (active)
          setError("Global outlook unavailable. Check System health.");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  useEffect(() => {
    if (!compact) return;
    let active = true;
    void fetch("/api/trader", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v) => {
        if (active)
          setTasks(
            v.checklist
              .filter((t: { state: string }) => t.state !== "checked")
              .slice(0, 3),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [compact, token]);
  if (error)
    return (
      <div className="panel" role="alert">
        {error}
      </div>
    );
  if (!data)
    return <div className="panel">Checking global market coverage…</div>;
  const checkedAge = Date.now() - Date.parse(data.checkedAt);
  const overdue = checkedAge > 20 * 60000;
  return (
    <div className="outlook">
      <section className="panel">
        <p className="eyebrow">
          {compact ? "START HERE" : "GLOBAL & INDIA CONTEXT"}
        </p>
        <h2>
          {!data.configured
            ? "Market outlook awaits data setup"
            : overdue
              ? "Market snapshot needs refreshing"
              : "Your market context"}
        </h2>
        <p>{data.interpretation}</p>
        <p className="muted">
          Snapshot checked{" "}
          {new Date(data.checkedAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST · Refresh every 15 minutes ·{" "}
          {overdue ? "Stale snapshot" : "Not a live tick feed"}
        </p>
        {!data.configured && (
          <p>
            No global provider key is configured. Prices and directional signals
            remain unavailable. International headlines can still load.
          </p>
        )}
        <div className="outlookRegions">
          {data.regions.map((r) => (
            <div
              className={
                "outlookRegion " +
                (!overdue && r.status === "Mostly rising"
                  ? "cueUp"
                  : !overdue && r.status === "Mostly falling"
                    ? "cueDown"
                    : "")
              }
              key={r.group}
            >
              <strong>{r.group}</strong>
              <p>{overdue ? "Stale snapshot" : r.status}</p>
              <small>
                {r.available}/{r.total} instruments available
              </small>
            </div>
          ))}
        </div>
        {compact && (
          <button onClick={() => onNavigate("Global markets")}>
            Explore markets & data setup →
          </button>
        )}
      </section>
      {compact ? (
        <section className="panel">
          <h2>Before your next trade</h2>
          <p>
            Review your alerts, prepare your plan, then use the paper workspace
            to practise.
          </p>
          {tasks.map((t) => (
            <p key={t.title}>
              ○ {t.title} <span className="muted">· {t.state}</span>
            </p>
          ))}
          <div className="outlookActions">
            <button onClick={() => onNavigate("News & risk")}>
              Review news & checklist
            </button>
            <button onClick={() => onNavigate("Real-time market")}>
              Check Indian live quotes
            </button>
            <button onClick={() => onNavigate("Trade journal")}>
              Open journal
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>Market board</h2>
          <p className="muted">
            Changes compare the quote with its provider-reported previous close.
            Green means price up; it does not mean favourable for India. FX,
            yields and volatility require separate interpretation.
          </p>
          <label>
            Region or asset group{" "}
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              {[...new Set(data.quotes.map((q) => q.group))].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className="marketTable">
            <table>
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Last price</th>
                  <th>Change</th>
                  <th>Session / quality</th>
                  <th>Quote time (IST)</th>
                </tr>
              </thead>
              <tbody>
                {data.quotes
                  .filter((q) => q.group === group)
                  .map((q) => (
                    <tr key={q.id}>
                      <td>{q.name}</td>
                      <td>
                        {q.price?.toLocaleString("en-IN", {
                          maximumFractionDigits: 4,
                        }) ?? "—"}{" "}
                        {q.currency}
                      </td>
                      <td
                        className={
                          q.state === "available" && !overdue
                            ? q.changePct! > 0
                              ? "cueUp"
                              : q.changePct! < 0
                                ? "cueDown"
                                : ""
                            : ""
                        }
                      >
                        {q.changePct === undefined
                          ? "—"
                          : `${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}%`}
                      </td>
                      <td>
                        {q.reason ?? q.session}{" "}
                        {q.state === "stale" ? "· Stale" : ""}
                      </td>
                      <td>
                        {q.asOf
                          ? new Date(q.asOf).toLocaleString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {group === "US technology" && (
            <p>
              NVDA · NVIDIA, MSFT · Microsoft, GOOGL · Alphabet, AAPL · Apple,
              AMZN · Amazon, META · Meta, TSLA · Tesla. These stocks do not
              determine the whole market. Regular-session snapshots only;
              after-hours and earnings feeds are not connected.
            </p>
          )}
        </section>
      )}
      <section className="panel">
        <h2>International headlines</h2>
        <p className="muted">
          BBC Business · {data.newsStatus} · Source headlines, not AI analysis
        </p>
        {!data.news.length && <p>No verified recent headlines available.</p>}
        {data.news.slice(0, compact ? 3 : 8).map((n) => (
          <article className="outlookHeadline" key={n.id}>
            <a href={n.url} target="_blank" rel="noreferrer">
              {n.title}
            </a>
            <small>
              {n.publishedAt
                ? new Date(n.publishedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  }) + " IST"
                : ""}
            </small>
          </article>
        ))}
      </section>
      {!compact && (
        <details className="panel">
          <summary>Data setup & coverage limits</summary>
          <p>
            Add TWELVE_DATA_API_KEY and GLOBAL_MARKET_SYMBOLS to your local
            .env, then restart. Select symbols only after verifying their
            exchange, instrument identity and entitlement with the provider. The
            subscription may not cover indices or GIFT Nifty.
          </p>
          <p>
            Example mapping for the seven US stocks:{" "}
            <code>
              {JSON.stringify(
                Object.fromEntries(
                  ["NVDA", "MSFT", "GOOGL", "AAPL", "AMZN", "META", "TSLA"].map(
                    (s) => [s, s],
                  ),
                ),
              )}
            </code>
          </p>
          <p>
            Requests are cached for 15 minutes. Each mapped symbol can consume a
            provider credit; confirm your quota. Never put credentials in the
            browser.
          </p>
          <a
            href="https://twelvedata.com/docs"
            target="_blank"
            rel="noreferrer"
          >
            Provider documentation
          </a>
          {data.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            Configure keys listed below using the verified provider symbols:
          </p>
          <code>{data.quotes.map((q) => q.id).join(", ")}</code>
        </details>
      )}
    </div>
  );
}
