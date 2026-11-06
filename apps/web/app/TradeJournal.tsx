"use client";
import { useEffect, useState } from "react";
type PlanRecord = {
  id: string;
  created_at?: string;
  result: {
    input: {
      symbol: string;
      side: string;
      horizon: string;
      entry: string;
      stop: string;
      target: string;
      quantity: number;
      thesis: string;
    };
    risk: {
      notional: string;
      estimatedStopLoss: string;
      estimatedNetReward: string;
      rewardRiskRatio: string;
      maximumQuantityByRisk: string;
      exceedsBudget: boolean;
    };
    warnings: string[];
    source: {
      provider: string;
      retrievedAt: string;
      quoteFreshness: string;
      spot: { last_price: number; timestamp: string } | null;
      failures: string[];
    };
  };
};
type Note = { id: string; note: string; created_at: string };
const fields = [
  ["entry", "Planned entry ₹"],
  ["stop", "Technical stop ₹"],
  ["target", "Planned target ₹"],
  ["quantity", "Cash shares"],
  ["riskBudget", "Maximum loss budget ₹"],
  ["estimatedCosts", "Total estimated round-trip costs ₹"],
  ["adverseSlippage", "Adverse slippage per share ₹"],
] as const;
export default function TradeJournal({
  token,
  initialSymbol = "",
}: {
  token: string;
  initialSymbol?: string;
}) {
  const [plans, setPlans] = useState<PlanRecord[]>([]),
    [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState({
    symbol: initialSymbol,
    side: "BUY",
    horizon: "intraday",
    entry: "",
    stop: "",
    target: "",
    quantity: "",
    riskBudget: "",
    estimatedCosts: "",
    adverseSlippage: "",
    thesis: "",
  });
  const [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function request(path: string, body?: unknown) {
    const r = await fetch(`/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.message ?? "Journal request failed");
    return data;
  }
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(
      ["fno/plans", "journal"].map(async (path) => {
        const r = await fetch(`/api/${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!r.ok) throw Error("Saved journal could not be loaded");
        return r.json();
      }),
    )
      .then(([p, n]) => {
        if (!controller.signal.aborted) {
          setPlans(p);
          setNotes(n);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [token]);
  async function savePlan() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const p = await request("fno/plans", {
        ...form,
        quantity: Number(form.quantity),
      });
      setPlans((old) => [p, ...old]);
      setMessage(
        "Plan saved with a provider snapshot and calculated risk. No order was placed.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan could not be saved");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="outlook">
      <section className="panel">
        <h2>Plan a cash-equity trade</h2>
        <p>
          Record your own entry, invalidation and target after researching the
          stock. These are your assumptions, not AI recommendations. Saving
          attaches the provider observation available at that time.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void savePlan();
          }}
        >
          <div className="formGrid">
            <label>
              Current F&O stock symbol
              <input
                required
                value={form.symbol}
                onChange={(e) =>
                  setForm({ ...form, symbol: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label>
              Direction
              <select
                value={form.side}
                onChange={(e) => setForm({ ...form, side: e.target.value })}
              >
                <option value="BUY">Long</option>
                <option value="SELL">Short</option>
              </select>
            </label>
            <label>
              Trading horizon
              <select
                value={form.horizon}
                onChange={(e) => setForm({ ...form, horizon: e.target.value })}
              >
                <option value="intraday">Intraday</option>
                <option value="swing">Swing</option>
                <option value="positional">Positional</option>
              </select>
            </label>
            {fields.map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  required
                  type="number"
                  min={
                    key === "estimatedCosts" || key === "adverseSlippage"
                      ? 0
                      : key === "quantity"
                        ? 1
                        : 0.0001
                  }
                  step={key === "quantity" ? 1 : "0.0001"}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label>
            Thesis and confirmation trigger
            <textarea
              required
              minLength={10}
              maxLength={4000}
              value={form.thesis}
              onChange={(e) => setForm({ ...form, thesis: e.target.value })}
            />
          </label>
          <p>
            Costs are your total round-trip estimate. Slippage is the assumed
            adverse exit movement per share. This planner does not validate
            broker funds, short-selling eligibility, futures lots or option
            margin.
          </p>
          <button disabled={busy}>
            {busy
              ? "Checking provider evidence and saving…"
              : "Calculate risk & save plan"}
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </section>
      <section className="panel">
        <h2>Saved trade plans</h2>
        {!plans.length && (
          <p>No plans saved. Your actual plans will appear here.</p>
        )}
        {plans.map((p) => (
          <article className="researchCard" key={p.id}>
            <h3>
              {p.result.input.symbol} ·{" "}
              {p.result.input.side === "BUY" ? "Long" : "Short"} ·{" "}
              {p.result.input.horizon}
            </h3>
            <p>{p.result.input.thesis}</p>
            <p>
              Entry ₹{p.result.input.entry} · Stop ₹{p.result.input.stop} ·
              Target ₹{p.result.input.target} · {p.result.input.quantity} cash
              shares
            </p>
            <p>
              Estimated stop loss ₹{p.result.risk.estimatedStopLoss} · Estimated
              net reward ₹{p.result.risk.estimatedNetReward} · Reward/risk{" "}
              {p.result.risk.rewardRiskRatio}:1 · Maximum cash shares under this
              loss estimate {p.result.risk.maximumQuantityByRisk}
            </p>
            <p>
              {p.result.risk.exceedsBudget
                ? "Over your risk budget"
                : "Within the entered risk budget; other eligibility checks remain open"}
            </p>
            <p>
              Saved source: {p.result.source.provider} · Retrieved{" "}
              {new Date(p.result.source.retrievedAt).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST · {p.result.source.quoteFreshness}
            </p>
            <p>
              Observed cash price:{" "}
              {p.result.source.spot
                ? `₹${p.result.source.spot.last_price} · ${p.result.source.spot.timestamp}`
                : "Unavailable"}
              . This is separate from your planned entry.
            </p>
            {[...p.result.warnings, ...p.result.source.failures].map((w) => (
              <p key={w}>{w}</p>
            ))}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Review notes</h2>
        <label>
          Trade thesis or review
          <textarea
            value={note}
            maxLength={10000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !note.trim()}
          onClick={() => {
            setBusy(true);
            setError("");
            void request("journal", { note, tags: ["local-research"] })
              .then(() => request("journal"))
              .then((n) => {
                setNotes(n);
                setNote("");
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Save review note
        </button>
        {!notes.length && <p>No review notes saved.</p>}
        {notes.map((n) => (
          <article key={n.id}>
            <p>{n.note}</p>
            <small>
              {new Date(n.created_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}{" "}
              IST
            </small>
          </article>
        ))}
      </section>
    </div>
  );
}
