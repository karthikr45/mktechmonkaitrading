"use client";
import { useEffect, useRef, useState } from "react";
type Financials = {
  source: string;
  basis: string;
  units: string;
  retrievedAt: string;
  limitation: string;
  sections: {
    id: string;
    name: string;
    state: string;
    reason?: string;
    rows: {
      name: string;
      history: { period: string; value: number; change?: string }[];
    }[];
  }[];
};
type Report = {
  financials?: Financials;
  retrievedAt: string;
  ai: {
    state: string;
    detail: string;
    result?: {
      summary: string;
      findings: {
        observation: string;
        whyItMatters: string;
        review: string;
        uncertainty: string;
        evidenceIds: string[];
      }[];
    };
  };
  news: { id: string; title: string; url: string; publishedAt: string }[];
  fundamentals: { name: string; company_value: string; sector_value: string }[];
  coverage: string[];
};
export default function StockResearch({
  token,
  symbol,
}: {
  token: string;
  symbol: string;
}) {
  const [report, setReport] = useState<Report>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function run() {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/fno/stock/research", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symbol }),
        signal: abort.signal,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.message ?? "Research failed");
      setReport(d);
    } catch (e) {
      if (!abort.signal.aborted)
        setError(e instanceof Error ? e.message : "Research unavailable");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>{symbol} · news, fundamentals & local AI</h2>
      <p>
        Fetch provider news, dated financial statements and available ratios.
        Ollama explains the timestamped evidence; it cannot supply missing
        market facts.
      </p>
      <button disabled={busy} onClick={() => void run()}>
        {busy
          ? "Fetching evidence and generating local analysis…"
          : "Research this stock with Ollama"}
      </button>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <p>
            Generated request completed {report.retrievedAt}. {report.ai.detail}
          </p>
          {report.ai.result && (
            <>
              <h3>Evidence summary</h3>
              <p>{report.ai.result.summary}</p>
              {report.ai.result.findings.map((f, i) => (
                <article key={i}>
                  <h4>{f.observation}</h4>
                  <p>{f.whyItMatters}</p>
                  <p>Review: {f.review}</p>
                  <p>Uncertainty: {f.uncertainty}</p>
                  <div aria-label="Supporting evidence">
                    {f.evidenceIds.map((id) => {
                      const article = report.news.find((n) => n.id === id);
                      return article ? (
                        <p key={id}>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {article.title}
                          </a>
                        </p>
                      ) : (
                        <p key={id}>
                          {id.startsWith("stock:")
                            ? `${symbol} price and derivatives snapshot`
                            : id.startsWith("financial:")
                              ? "Provider financial statement below; check its reporting period"
                              : "Source reference unavailable"}
                        </p>
                      );
                    })}
                  </div>
                </article>
              ))}
            </>
          )}
          <h3>Recent stock news</h3>
          {!report.news.length && (
            <p>
              No recent articles returned. This does not establish that the
              stock has no news or event risk.
            </p>
          )}
          {report.news.map((n) => (
            <article key={n.id}>
              <a href={n.url} target="_blank" rel="noreferrer">
                {n.title}
              </a>
              <p>{n.publishedAt} · Upstox News</p>
            </article>
          ))}
          {report.financials && (
            <section>
              <h3>Financial history and latest returned quarters</h3>
              <p>
                {report.financials.source} · {report.financials.basis} · All
                values in {report.financials.units}
              </p>
              <p>{report.financials.limitation}</p>
              {report.financials.sections.map((section) => {
                const periods = [
                  ...new Set(
                    section.rows.flatMap((row) =>
                      row.history.map((h) => h.period),
                    ),
                  ),
                ].sort((a, b) => Date.parse(`1 ${b}`) - Date.parse(`1 ${a}`));
                return (
                  <details key={section.id} open>
                    <summary>
                      {section.name} · {section.state} · {periods.length}{" "}
                      periods
                    </summary>
                    {section.reason && <p>{section.reason}</p>}
                    {!!periods.length && (
                      <div className="marketTable">
                        <table>
                          <thead>
                            <tr>
                              <th>Measure (₹ crore)</th>
                              {periods.map((p) => (
                                <th key={p}>{p}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row) => (
                              <tr key={row.name}>
                                <th>{row.name}</th>
                                {periods.map((p) => {
                                  const value = row.history.find(
                                    (h) => h.period === p,
                                  )?.value;
                                  return (
                                    <td key={p}>
                                      {value === undefined
                                        ? "Unavailable"
                                        : value.toLocaleString("en-IN", {
                                            maximumFractionDigits: 2,
                                          })}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </details>
                );
              })}
            </section>
          )}
          <h3>Company / sector ratios</h3>
          <p>
            Source reporting periods are not provided. These ratios cannot
            establish current financial health alone.
          </p>
          {!report.fundamentals.length ? (
            <p>Ratios unavailable.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ratio</th>
                  <th>Company</th>
                  <th>Sector</th>
                </tr>
              </thead>
              <tbody>
                {report.fundamentals.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.company_value}</td>
                    <td>{r.sector_value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.coverage.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </>
      )}
    </section>
  );
}
