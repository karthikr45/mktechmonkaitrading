import { financialStatements } from "./financials";
import { evaluateTradePlan } from "./trade-plan";
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
  verifyChain,
} from "./analytics";
import { loadUniverse, Quotes } from "./provider";
import { getUpstoxNews, RatioResponse } from "../news-risk/providers";
import { analyze } from "../news-risk/ai";
import { BacktestInput, backtest } from "./backtest";
import { completed, indicators, chartSeries } from "./technicals";
export class FnoService {
  private cancelling = new Set<string>();
  private backtesting = new Set<string>();
  private analysing = new Set<string>();
  private researching = new Set<string>();
  constructor(
    private store: LocalStore,
    private request: (tenant: string, path: string) => Promise<unknown>,
    private master = loadUniverse,
  ) {}
  async tradePlans(t: string) {
    return this.store.scoped(t, (m) =>
      m.query(
        "SELECT id,result,created_at FROM research_runs WHERE kind='trade-plan' ORDER BY created_at DESC LIMIT 100",
      ),
    );
  }
  async saveTradePlan(t: string, body: unknown) {
    const plan = evaluateTradePlan(body);
    const snapshot = await this.stockSnapshot(t, plan.input.symbol);
    const result = {
      ...plan,
      state: "plan_only",
      source: {
        provider: "Upstox",
        instrument: snapshot.stock.key,
        symbol: snapshot.stock.symbol,
        retrievedAt: snapshot.retrievedAt,
        quoteFreshness: snapshot.quoteFreshness,
        spot: snapshot.spot,
        futuresOiChangePct: snapshot.futuresOiChangePct,
        optionOiChangePct: snapshot.optionChain?.totalOiChangePct ?? null,
        failures: snapshot.failures,
      },
    };
    const id = randomUUID();
    await this.store.scoped(t, async (m) => {
      await m.query(
        "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,'trade-plan',$3,$4)",
        [t, id, JSON.stringify(plan.input), JSON.stringify(result)],
      );
      await this.store.record(m, t, "trade-plan.saved", {
        id,
        symbol: snapshot.stock.symbol,
      });
    });
    return { id, result };
  }
  async symbols() {
    const master = await this.master();
    return { stocks: master.stocks, publishedAt: master.publishedAt };
  }
  async stockSnapshot(t: string, symbol: string) {
    const master = await this.master();
    const stock = master.stocks.find(
      (s) => s.symbol.toUpperCase() === symbol.trim().toUpperCase(),
    );
    if (!stock)
      throw new BadRequestException(
        "Select a stock from the current F&O universe",
      );
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const from = new Date(Date.now() - 15 * 86400000)
      .toISOString()
      .slice(0, 10);
    const tasks = await Promise.allSettled([
      this.request(
        t,
        "/v2/market-quote/quotes?instrument_key=" +
          encodeURIComponent([stock.key, stock.future].join(",")),
      ).then(Quotes.parse),
      this.request(
        t,
        `/v2/option/chain?instrument_key=${encodeURIComponent(stock.key)}&expiry_date=${stock.expiry}`,
      ).then((v) => chain(v, stock.key, stock.expiry)),
      this.request(
        t,
        `/v2/historical-candle/${encodeURIComponent(stock.future)}/day/${today}/${from}`,
      ).then((v) => candles(v, today)),
      this.request(
        t,
        `/v2/historical-candle/${encodeURIComponent(stock.key)}/day/${today}/${from}`,
      ).then((v) => candles(v, today)),
    ] as const);
    const [quotes, options, history, cashHistory] = tasks;
    let optionChain:
      | (ReturnType<typeof chain> & {
          completeness?: string;
          expectedContracts?: number;
          maxPain: number | null;
        })
      | null = options.status === "fulfilled" ? options.value : null;
    if (optionChain) {
      try {
        optionChain = verifyChain(
          optionChain,
          await this.request(
            t,
            `/v2/option/contract?instrument_key=${encodeURIComponent(stock.key)}&expiry_date=${stock.expiry}`,
          ),
          stock.key,
        );
      } catch {
        /* Keep returned-strike evidence; never assert completeness on failure. */
      }
    }
    const values =
      quotes.status === "fulfilled" ? Object.values(quotes.value.data) : [];
    const spot = values.find((q) => q.instrument_token === stock.key) ?? null;
    const future =
      values.find((q) => q.instrument_token === stock.future) ?? null;
    const baseline =
      history.status === "fulfilled" ? history.value.at(-1) : undefined;
    const cashBaseline =
      cashHistory.status === "fulfilled" ? cashHistory.value.at(-1) : undefined;
    const baselineValid =
      baseline &&
      cashBaseline &&
      baseline[0].slice(0, 10) === cashBaseline[0].slice(0, 10) &&
      Date.now() - Date.parse(baseline[0]) < 96 * 3600000;
    const oiChange = baselineValid ? change(future?.oi, baseline[6]) : null;
    const priceChange = future
      ? change(future.last_price, future.last_price - future.net_change)
      : null;
    const filters = (await this.settings(t)).filters;
    const fresh = (q: typeof spot) =>
      q?.last_trade_time !== undefined &&
      Date.now() - q.last_trade_time <= 60000 &&
      q.last_trade_time <= Date.now() + 60000;
    return {
      stock,
      retrievedAt: new Date().toISOString(),
      source: "Upstox",
      spot,
      future,
      spotChangePct: spot
        ? change(spot.last_price, spot.last_price - spot.net_change)
        : null,
      futuresPriceChangePct: priceChange,
      futuresOiChangePct: oiChange,
      baselineDate: baselineValid ? baseline[0] : null,
      futuresStructure: structure(priceChange, oiChange, filters),
      quoteFreshness:
        fresh(spot) && fresh(future)
          ? "Recent provider quote; confirm exchange session before trading"
          : "Stale, closed-session or unavailable quote; not a live trade signal",
      optionChain,
      failures: tasks.flatMap((r, i) =>
        r.status === "rejected"
          ? [
              [
                "Cash/futures quotes",
                "Option chain",
                "Futures OI baseline",
                "Cash baseline",
              ][i] + " unavailable: provider request or validation failed",
            ]
          : [],
      ),
      limitation:
        "Cash price %, futures price/OI % and returned option-chain OI % are separate observations. Thresholds are user-defined, not historically optimized. Chain retrieval time is not an exchange quote timestamp. No trade qualification without restrictions, liquidity, market context and news confirmation.",
    };
  }
  async stockResearch(t: string, symbol: string) {
    if (this.researching.has(t))
      throw new BadRequestException(
        "Stock AI research is already running; wait for it to finish",
      );
    this.researching.add(t);
    try {
      const snapshot = await this.stockSnapshot(t, symbol);
      const key = snapshot.stock.key;
      const [newsResult, fundamentalsResult] = await Promise.allSettled([
        getUpstoxNews((path) => this.request(t, path), [key]),
        this.request(
          t,
          `/v2/fundamentals/${key.split("|")[1]}/key-ratios`,
        ).then(RatioResponse.parse),
      ]);
      const news =
        newsResult.status === "fulfilled"
          ? newsResult.value.items
              .filter(
                (a) =>
                  a.publishedAt &&
                  Date.now() - Date.parse(a.publishedAt) < 72 * 3600000,
              )
              .slice(0, 15)
          : [];
      const fundamentals =
        fundamentalsResult.status === "fulfilled"
          ? fundamentalsResult.value.data
          : [];
      const financials = await financialStatements(
        (path) => this.request(t, path),
        key.split("|")[1],
      );
      const id = randomUUID();
      const evidence = [
        {
          id: `stock:${id}`,
          title: `${snapshot.stock.symbol} provider observation`,
          summary: JSON.stringify({
            symbol: snapshot.stock.symbol,
            spot: snapshot.spot,
            future: snapshot.future,
            futuresOiChangePct: snapshot.futuresOiChangePct,
            baselineDate: snapshot.baselineDate,
            freshness: snapshot.quoteFreshness,
            optionChain: snapshot.optionChain
              ? {
                  expiry: snapshot.optionChain.expiry,
                  pcr: snapshot.optionChain.pcr,
                  oiChangePct: snapshot.optionChain.totalOiChangePct,
                  callWall: snapshot.optionChain.callWall,
                  putWall: snapshot.optionChain.putWall,
                }
              : null,
          }),
          publishedAt: snapshot.retrievedAt,
          source: "Upstox quotes and chain",
          instruments: [key],
          url: "https://upstox.com/developer/api-documentation/",
        },
        ...financials.sections
          .filter((s) => s.state === "available")
          .map((s) => ({
            id: `financial:${id}:${s.id}`,
            title: `${snapshot.stock.symbol} ${s.name}`,
            summary: JSON.stringify({
              basis: financials.basis,
              units: financials.units,
              frequency: s.frequency,
              rows: s.rows,
              limitation: financials.limitation,
            }),
            publishedAt: null,
            source: financials.source,
            instruments: [key],
            url: "https://upstox.com/developer/api-documentation/announcements/company-fundamentals-api/",
          })),
        ...news,
      ];
      const coverage = [
        snapshot.limitation,
        news.length
          ? `${news.length} recent stock articles; coverage may be incomplete`
          : "No recent stock news was returned; do not infer that no event exists",
        financials.limitation,
        ...financials.sections
          .filter((s) => s.state === "unavailable")
          .map((s) => `${s.name}: unavailable`),
        "Fundamental ratios have no verified reporting period and are shown separately; do not treat retrieval time as financial-statement recency.",
      ];
      const ai = await analyze(
        evidence,
        coverage,
        `Explain the supplied ${snapshot.stock.symbol} evidence for a trader: distinguish cash price, futures price/OI and option-chain OI; discuss supplied financial periods, revenue/profit/cash flow, news, freshness and missing confirmations. Financial periods are not publication dates; do not call the latest returned quarter the latest filed result. Do not infer buying/writing from OI alone. Do not recommend a trade, invent a target, claim a success probability or infer broader market direction. Cite evidence IDs for every finding.`,
      );
      const result = {
        symbol: snapshot.stock.symbol,
        retrievedAt: new Date().toISOString(),
        ai,
        news,
        fundamentals,
        financials,
        coverage,
      };
      await this.store.scoped(t, (m) =>
        m.query(
          "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,'stock-research',$3,$4)",
          [t, id, JSON.stringify({ symbol, evidence }), JSON.stringify(result)],
        ),
      );
      return { id, ...result };
    } finally {
      this.researching.delete(t);
    }
  }
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
            chart: chartSeries(rows),
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
