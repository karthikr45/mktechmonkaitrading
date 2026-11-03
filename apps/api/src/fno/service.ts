import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { LocalStore } from "../persistence";
import {
  Filters,
  type FiltersValue,
  change,
  structure,
  candles,
  technical,
  chain,
} from "./analytics";
import { loadUniverse, Quotes } from "./provider";
import { analyze } from "../news-risk/ai";
import { BacktestInput, backtest } from "./backtest";
import { completed, indicators } from "./technicals";
export class FnoService {
  private cancelling = new Set<string>();
  private backtesting = new Set<string>();
  private analysing = new Set<string>();
  constructor(
    private store: LocalStore,
    private request: (tenant: string, path: string) => Promise<unknown>,
    private master = loadUniverse,
  ) {}
  async technicals(t: string, symbol: string) {
    if (this.analysing.has(t))
      throw new BadRequestException("Technical analysis is already running");
    this.analysing.add(t);
    try {
      const master = await this.master();
      const stock = master.stocks.find(
        (s) => s.symbol.toUpperCase() === symbol.trim().toUpperCase(),
      );
      if (!stock)
        throw new BadRequestException(
          "Stock not found in current F&O universe",
        );
      const now = Date.now(),
        today = new Date(now + 330 * 60000).toISOString().slice(0, 10);
      const yesterday = new Date(now + 330 * 60000 - 86400000)
        .toISOString()
        .slice(0, 10);
      const frames = [];
      for (const [frame, path, days] of [
        ["5m", "minutes/5", 28],
        ["15m", "minutes/15", 28],
        ["1h", "hours/1", 85],
        ["daily", "days/1", 3000],
        ["weekly", "weeks/1", 7000],
        ["monthly", "months/1", 9000],
      ] as const) {
        try {
          const from = new Date(now - days * 86400000)
            .toISOString()
            .slice(0, 10);
          const key = encodeURIComponent(stock.key);
          const history = candles(
            await this.request(
              t,
              `/v3/historical-candle/${key}/${path}/${yesterday}/${from}`,
            ),
            today,
          );
          let current: ReturnType<typeof candles> = [];
          let intradayAccess = "Not requested for EOD frame";
          if (["5m", "15m", "1h"].includes(frame)) {
            try {
              current = candles(
                await this.request(
                  t,
                  `/v3/historical-candle/intraday/${key}/${path}`,
                ),
                "9999-12-31",
              ).filter((r) => r[0].slice(0, 10) === today);
              intradayAccess = current.length
                ? "Current-session candles returned"
                : "No current-session candles";
            } catch {
              intradayAccess =
                "Current-session request unavailable; history only";
            }
          }
          const rows = completed([...history, ...current], frame, now);
          frames.push({
            frame,
            status: rows.length ? "available" : "unavailable",
            intradayAccess,
            ...indicators(rows),
          });
        } catch {
          frames.push({
            frame,
            status: "unavailable",
            reason: "Provider history unavailable or failed validation",
          });
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      const result = {
        stock,
        frames,
        retrievedAt: new Date().toISOString(),
        source: "Upstox V3 candles",
        limitation:
          "On-demand snapshot, not a streaming decision. Only completed candles used; current day/week/month bars excluded for EOD frames. Pivot levels use the last completed bar. No market regime, OI or news confirmation is implied.",
      };
      const id = randomUUID();
      await this.store.scoped(t, (m) =>
        m.query(
          "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,'fno-technicals',$3,$4)",
          [t, id, JSON.stringify({ symbol }), JSON.stringify(result)],
        ),
      );
      return { id, result };
    } finally {
      this.analysing.delete(t);
    }
  }
  async backtestHistory(t: string) {
    return this.store.scoped(t, (m) =>
      m.query(
        "SELECT id,request,result,created_at FROM research_runs WHERE tenant_id=$1 AND kind='fno-backtest' ORDER BY created_at DESC LIMIT 10",
        [t],
      ),
    );
  }
  async backtest(t: string, body: unknown) {
    const input = BacktestInput.parse(body);
    if (this.backtesting.has(t))
      throw new BadRequestException("A historical study is already running");
    this.backtesting.add(t);
    try {
      const universe = await this.master();
      const stock = universe.stocks.find(
        (s) => s.symbol.toUpperCase() === input.symbol.toUpperCase(),
      );
      if (!stock)
        throw new BadRequestException(
          "Symbol not found in the current stock F&O universe",
        );
      const today = new Date(Date.now() + 330 * 60000)
        .toISOString()
        .slice(0, 10);
      const from = new Date(Date.now() - 365 * 86400000)
        .toISOString()
        .slice(0, 10);
      const rows = candles(
        await this.request(
          t,
          `/v2/historical-candle/${encodeURIComponent(stock.future)}/day/${today}/${from}`,
        ),
        today,
      );
      if (rows.length < 30)
        throw new BadRequestException(
          "Provider returned fewer than 30 completed daily bars for this active futures contract. No statistics generated.",
        );
      const result = {
        ...backtest(rows, input),
        inputCandles: rows,
        stock,
        source: "Upstox historical daily futures candles",
        retrievedAt: new Date().toISOString(),
        universePublishedAt: universe.publishedAt,
      };
      const id = randomUUID();
      await this.store.scoped(t, (m) =>
        m.query(
          "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,'fno-backtest',$3,$4)",
          [t, id, JSON.stringify(input), JSON.stringify(result)],
        ),
      );
      return { id, result };
    } finally {
      this.backtesting.delete(t);
    }
  }
  async settings(t: string) {
    const [row] = await this.store.scoped(t, (m) =>
      m.query("SELECT filters,revision FROM fno_settings WHERE tenant_id=$1", [
        t,
      ]),
    );
    return row ?? { filters: Filters.parse({}), revision: 0 };
  }
  async save(t: string, body: unknown) {
    const filters = Filters.parse(body);
    await this.store.scoped(t, (m) =>
      m.query(
        "INSERT INTO fno_settings(tenant_id,filters) VALUES($1,$2) ON CONFLICT(tenant_id) DO UPDATE SET filters=$2,revision=fno_settings.revision+1,updated_at=now()",
        [t, JSON.stringify(filters)],
      ),
    );
    return this.settings(t);
  }
  async state(t: string) {
    // A terminated process releases its PostgreSQL lock. Recover abandoned jobs
    // so the UI does not remain stuck in Running after an API restart.
    const recovery = this.store.db.createQueryRunner();
    await recovery.connect();
    try {
      const [lock] = await recovery.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
        ["fno:" + t],
      );
      if (lock.locked) {
        try {
          await this.store.scoped(t, (m) =>
            m.query(
              "UPDATE fno_runs SET state='interrupted',updated_at=now() WHERE tenant_id=$1 AND state='running'",
              [t],
            ),
          );
        } finally {
          await recovery.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            ["fno:" + t],
          );
        }
      }
    } finally {
      await recovery.release();
    }
    const runs = await this.store.scoped(t, (m) =>
      m.query(
        "SELECT id,state,progress,created_at,updated_at FROM fno_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 10",
        [t],
      ),
    );
    return { settings: await this.settings(t), runs };
  }
  async report(t: string, id: string) {
    const [row] = await this.store.scoped(t, (m) =>
      m.query("SELECT * FROM fno_runs WHERE tenant_id=$1 AND id=$2", [t, id]),
    );
    if (!row) throw new BadRequestException("Scan not found");
    return row;
  }
  async cancel(t: string, id: string) {
    const row = await this.report(t, id);
    if (row.state === "running") this.cancelling.add(id);
    return { requested: row.state === "running" };
  }
  async start(t: string) {
    const runner = this.store.db.createQueryRunner();
    await runner.connect();
    const [lock] = await runner.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked",
      ["fno:" + t],
    );
    if (!lock.locked) {
      await runner.release();
      throw new BadRequestException("A scan is already running");
    }
    const id = randomUUID();
    try {
      const settings = await this.settings(t);
      await this.store.scoped(t, async (m) => {
        await m.query(
          "UPDATE fno_runs SET state='interrupted',updated_at=now() WHERE tenant_id=$1 AND state='running'",
          [t],
        );
        const [recent] = await m.query(
          "SELECT id FROM fno_runs WHERE tenant_id=$1 AND created_at>now()-interval '60 seconds' LIMIT 1",
          [t],
        );
        if (recent)
          throw new BadRequestException("Wait one minute between scans");
        await m.query(
          "INSERT INTO fno_runs(tenant_id,id,state,filters) VALUES($1,$2,'running',$3)",
          [t, id, JSON.stringify(settings)],
        );
      });
      void this.run(t, id, settings.filters)
        .catch(async () => {
          await this.update(t, id, "failed", {
            message:
              "Provider or storage request failed. Check access and retry; no shortlist was generated.",
          });
        })
        .finally(async () => {
          this.cancelling.delete(id);
          await runner.query(
            "SELECT pg_advisory_unlock(hashtextextended($1,0))",
            ["fno:" + t],
          );
          await runner.release();
        })
        .catch(() => {});
      return { id };
    } catch (e) {
      await runner.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
        "fno:" + t,
      ]);
      await runner.release();
      throw e;
    }
  }
  private async update(
    t: string,
    id: string,
    state: string,
    progress: unknown,
    result?: unknown,
  ) {
    await this.store.scoped(t, (m) =>
      m.query(
        "UPDATE fno_runs SET state=$3,progress=$4,result=COALESCE($5::jsonb,result),updated_at=now() WHERE tenant_id=$1 AND id=$2",
        [
          t,
          id,
          state,
          JSON.stringify(progress),
          result ? JSON.stringify(result) : null,
        ],
      ),
    );
  }
  private async run(t: string, id: string, filters: FiltersValue) {
    const universe = await this.master();
    const rows: Record<string, unknown>[] = [];
    await this.update(t, id, "running", {
      phase: "quotes",
      total: universe.stocks.length,
      processed: 0,
    });
    const observations = new Map<
      string,
      ReturnType<typeof Quotes.parse>["data"][string]
    >();
    const keys = universe.stocks.flatMap((s) => [s.key, s.future]);
    for (let i = 0; i < keys.length; i += 100) {
      if (this.cancelling.has(id)) {
        await this.update(t, id, "cancelled", {
          phase: "cancelled",
          processed: rows.length,
        });
        return;
      }
      const data = Quotes.parse(
        await this.request(
          t,
          "/v2/market-quote/quotes?instrument_key=" +
            encodeURIComponent(keys.slice(i, i + 100).join(",")),
        ),
      ).data;
      for (const q of Object.values(data))
        if (keys.includes(q.instrument_token))
          observations.set(q.instrument_token, q);
      await new Promise((r) => setTimeout(r, 500));
    }
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10),
      from = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
    for (const stock of universe.stocks) {
      if (this.cancelling.has(id)) {
        await this.update(
          t,
          id,
          "cancelled",
          { processed: rows.length },
          { universe, rows },
        );
        return;
      }
      const spot = observations.get(stock.key),
        future = observations.get(stock.future);
      const result: Record<string, unknown> = {
        ...stock,
        decision: "Not evaluated",
        missing: [
          "Exchange restrictions / ban status",
          "Exact average turnover and delivery reports",
          "Previous-session option volume / contract unit confirmation",
          "Market regime validation",
          "Multi-timeframe confirmation, fundamentals and events",
        ],
      };
      rows.push(result);
      const fresh = (q: typeof spot) =>
        q &&
        Number.isFinite(Date.parse(q.timestamp)) &&
        Date.now() - Date.parse(q.timestamp) >= -60000 &&
        Date.now() - Date.parse(q.timestamp) <= 5 * 60000;
      if (!fresh(spot) || !fresh(future)) {
        result.reason =
          "Missing or stale cash/futures quote. No current-session decision.";
      } else {
        const spotChange = change(
          spot!.last_price,
          spot!.last_price - spot!.net_change,
        );
        result.spotPrice = spot!.last_price;
        result.spotChangePct = spotChange;
        result.asOf = spot!.timestamp;
        if (spotChange === null || Math.abs(spotChange) < filters.priceMove) {
          result.decision = "Outside price filter";
          result.reason = "Does not meet configured price movement";
        } else
          try {
            const get = async (path: string) => {
              await new Promise((r) => setTimeout(r, 500));
              return this.request(t, path);
            };
            const daily = candles(
              await get(
                `/v2/historical-candle/${encodeURIComponent(stock.key)}/day/${today}/${from}`,
              ),
              today,
            );
            const fh = candles(
              await get(
                `/v2/historical-candle/${encodeURIComponent(stock.future)}/day/${today}/${from}`,
              ),
              today,
            );
            const baseline = fh.at(-1);
            // Old contract history must not be mislabelled as yesterday's OI.
            const baselineRecent =
              baseline &&
              daily.at(-1)?.[0].slice(0, 10) === baseline[0].slice(0, 10) &&
              Date.now() - Date.parse(baseline[0]) < 96 * 3600000;
            const oi = baselineRecent ? change(future!.oi, baseline![6]) : null;
            result.futuresOiChangePct = oi;
            result.futuresStructure = structure(
              change(
                future!.last_price,
                future!.last_price - future!.net_change,
              ),
              oi,
              filters,
            );
            result.baselineDate = baseline?.[0];
            result.daily = technical(daily);
            result.optionChain = chain(
              await get(
                `/v2/option/chain?instrument_key=${encodeURIComponent(stock.key)}&expiry_date=${stock.expiry}`,
              ),
              stock.key,
              stock.expiry,
            );
            result.reason =
              "Price filter matched; required confirmation inputs are incomplete. This is an observation, not a trade candidate.";
          } catch {
            result.reason =
              "Price filter matched, but derivatives/history data failed validation or access.";
          }
      }
      await this.update(t, id, "running", {
        phase: "analysis",
        total: universe.stocks.length,
        processed: rows.length,
      });
    }
    const report = {
      universe,
      rows,
      filters,
      horizon: filters.horizon,
      qualifiedCandidates: 0,
      marketRegime: "Insufficient evidence",
      marketStrengthScore: null,
      completedAt: new Date().toISOString(),
      limitation:
        "Price/OI observations only. Complete trade qualification is blocked by the missing inputs listed per stock. Intraday, swing and positional confirmation pipelines are not yet complete.",
    };
    await this.update(
      t,
      id,
      "partial",
      { phase: "finished", total: rows.length, processed: rows.length },
      report,
    );
  }
  async explain(t: string, id: string, key: string) {
    const report = await this.report(t, id);
    if (!report.result || report.state === "running")
      throw new BadRequestException("Wait for a finished scan");
    const row = report.result.rows?.find((r: { key: string }) => r.key === key);
    if (!row) throw new BadRequestException("Stock not in this scan");
    const evidence = {
      id: `scan:${id}:${key}`,
      title: `Saved F&O observation: ${row.symbol}`,
      summary: JSON.stringify(row).slice(0, 12000),
      source: "Validated Upstox research snapshot",
      publishedAt: report.result.completedAt ?? report.updated_at.toISOString(),
      instruments: [key],
      url: "https://upstox.com/developer/api-documentation/",
    };
    const analysis = await analyze(
      [evidence],
      [
        "This is a historical scan, not a fresh quote. Qualification is incomplete; do not recommend a trade.",
      ],
    );
    await this.store.scoped(t, (m) =>
      m.query(
        "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,$3,$4,$5)",
        [
          t,
          randomUUID(),
          "fno-explanation",
          JSON.stringify({ scanId: id, key, evidence }),
          JSON.stringify(analysis),
        ],
      ),
    );
    return analysis;
  }
}
