import { randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { LocalStore } from "../persistence";
import type { UpstoxFeed } from "../upstox/feed";
import {
  Settings,
  checklist,
  indiaClock,
  type Article,
  type Coverage,
  type SettingsValue,
} from "./contracts";
import {
  boundedBody,
  getUpstoxNews,
  parseRss,
  RatioResponse,
  rssSources,
  rssFreshness,
} from "./providers";
import { analyze } from "./ai";
export class NewsRiskService {
  private timer?: ReturnType<typeof setInterval>;
  private active = new Set<string>();
  private lastWorkerCheck: string | null = null;
  private workerError = false;
  constructor(
    private store: LocalStore,
    private feed: (tenant: string) => UpstoxFeed,
  ) {}
  async settings(t: string): Promise<SettingsValue> {
    const defaults = Settings.parse({});
    return this.store.scoped(t, async (m) => {
      await m.query(
        "INSERT INTO trader_settings(tenant_id,settings) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [t, JSON.stringify(defaults)],
      );
      const [row] = await m.query(
        "SELECT settings FROM trader_settings WHERE tenant_id=$1",
        [t],
      );
      return Settings.parse(row.settings);
    });
  }
  async saveSettings(t: string, body: unknown) {
    const settings = Settings.parse(body);
    if (
      new Set(settings.watchlist.map((w) => w.key)).size !==
      settings.watchlist.length
    )
      throw new BadRequestException("Watchlist keys must be unique");
    await this.store.scoped(t, async (m) => {
      await m.query(
        "INSERT INTO trader_settings(tenant_id,settings) VALUES($1,$2) ON CONFLICT(tenant_id) DO UPDATE SET settings=$2,updated_at=now()",
        [t, JSON.stringify(settings)],
      );
      await this.store.record(m, t, "trader.settings.saved", {
        watchlistCount: settings.watchlist.length,
        enabled: settings.enabled,
      });
    });
    return settings;
  }
  async alert(
    t: string,
    key: string,
    severity: string,
    title: string,
    detail: string,
    evidence: unknown = [],
  ) {
    await this.store.scoped(t, (m) =>
      m.query(
        `INSERT INTO trader_alerts(tenant_id,id,dedupe_key,severity,title,detail,evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,dedupe_key) DO UPDATE SET
      severity=EXCLUDED.severity,title=EXCLUDED.title,detail=EXCLUDED.detail,evidence=EXCLUDED.evidence,last_seen=now(),
      acknowledged_at=CASE WHEN trader_alerts.resolved_at IS NOT NULL THEN NULL ELSE trader_alerts.acknowledged_at END,resolved_at=NULL`,
        [
          t,
          randomUUID(),
          key,
          severity,
          title,
          detail,
          JSON.stringify(evidence),
        ],
      ),
    );
  }
  async resolve(t: string, key: string) {
    await this.store.scoped(t, (m) =>
      m.query(
        "UPDATE trader_alerts SET resolved_at=COALESCE(resolved_at,now()) WHERE tenant_id=$1 AND dedupe_key=$2",
        [t, key],
      ),
    );
  }
  async acknowledge(t: string, id: string) {
    z.string().uuid().parse(id);
    return this.store.scoped(t, async (m) => {
      const rows = await m.query(
        "WITH changed AS (UPDATE trader_alerts SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE tenant_id=$1 AND id=$2 RETURNING id) SELECT id FROM changed",
        [t, id],
      );
      if (!rows.length) throw new BadRequestException("Alert not found");
      await this.store.record(m, t, "trader.alert.acknowledged", { id });
      return { acknowledged: true };
    });
  }
  async check(t: string, body: unknown) {
    const data = z
      .object({
        item: z.enum(checklist.map((c) => c.id) as [string, ...string[]]),
        note: z.string().trim().min(5).max(2000),
      })
      .strict()
      .parse(body);
    const { day } = indiaClock();
    await this.store.scoped(t, async (m) => {
      await m.query(
        "INSERT INTO trader_checklist(tenant_id,day,item,note) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,day,item) DO UPDATE SET note=$4,checked_at=now()",
        [t, day, data.item, data.note],
      );
      await this.store.record(m, t, "trader.checklist.reviewed", {
        day,
        item: data.item,
      });
    });
    await this.resolve(t, `${day}:check:${data.item}`);
    return { checked: true };
  }
  async checklistState(t: string, settings: SettingsValue) {
    const { day, time } = indiaClock();
    const rows = await this.store.scoped(t, (m) =>
      m.query(
        "SELECT item,note,checked_at FROM trader_checklist WHERE tenant_id=$1 AND day=$2",
        [t, day],
      ),
    );
    return checklist.map((item) => {
      const done = rows.find((r: { item: string }) => r.item === item.id);
      const due = item.id === "cutoff" ? settings.cutoffTime : item.time;
      return {
        ...item,
        due,
        state: done
          ? "checked"
          : !due
            ? "unavailable"
            : time >= due
              ? "overdue"
              : "needs attention",
        note: done?.note ?? "",
        checkedAt: done?.checked_at ?? null,
      };
    });
  }
  async briefing(t: string, id: string) {
    z.string().uuid().parse(id);
    return this.store.scoped(t, async (m) => {
      const [row] = await m.query(
        "SELECT id,report,created_at FROM trader_briefings WHERE tenant_id=$1 AND id=$2",
        [t, id],
      );
      if (!row) throw new BadRequestException("Briefing not found");
      return row;
    });
  }
  async state(t: string) {
    const settings = await this.settings(t);
    const result = await this.store.scoped(t, async (m) => {
      const [latest] = await m.query(
        "SELECT id,report,created_at FROM trader_briefings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",
        [t],
      );
      const alerts = await m.query(
        "SELECT * FROM trader_alerts WHERE tenant_id=$1 ORDER BY (resolved_at IS NULL) DESC,(acknowledged_at IS NULL) DESC,CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,created_at DESC LIMIT 200",
        [t],
      );
      const articles = await m.query(
        "SELECT article,first_seen,last_seen FROM trader_news WHERE tenant_id=$1 ORDER BY article->>'publishedAt' DESC NULLS LAST,last_seen DESC LIMIT 100",
        [t],
      );
      const history = await m.query(
        "SELECT id,created_at,report->>'kind' AS kind FROM trader_briefings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20",
        [t],
      );
      return { latest, alerts, articles, history };
    });
    const age = result.latest
      ? Date.now() - new Date(result.latest.created_at).getTime()
      : Infinity;
    return {
      ...result,
      settings,
      checklist: await this.checklistState(t, settings),
      day: indiaClock().day,
      running: this.active.has(t),
      worker: { lastCheckedAt: this.lastWorkerCheck, error: this.workerError },
      coverageOverdue: age > settings.refreshMinutes * 120000,
      limitation:
        "Local monitoring requires the API and computer to remain awake. Manual checklist completion is your attestation, not independent verification. Live portfolio, exchange calendar and broker cutoff are not automatically verified.",
    };
  }
  async refresh(t: string, force = false) {
    if (this.active.has(t)) return { running: true };
    this.active.add(t);
    const lock = this.store.db.createQueryRunner();
    let acquired = false;
    try {
      await lock.connect();
      const [row] = await lock.query(
        "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired",
        [`news-risk:${t}`],
      );
      acquired = row.acquired;
      if (!acquired) return { running: true };
      const settings = await this.settings(t);
      if (!force && !settings.enabled) return { paused: true };
      await this.checkRisks(t, settings);
      const [last] = await this.store.scoped(t, (m) =>
        m.query(
          "SELECT report,created_at FROM trader_briefings WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",
          [t],
        ),
      );
      const current = indiaClock();
      const lastClock = last ? indiaClock(new Date(last.created_at)) : null;
      const briefingDue =
        current.time >= settings.briefingTime &&
        (!lastClock ||
          lastClock.day !== current.day ||
          lastClock.time < settings.briefingTime);
      if (
        last &&
        !briefingDue &&
        Date.now() - new Date(last.created_at).getTime() <
          (force ? 30000 : settings.refreshMinutes * 60000)
      )
        return { cached: true };
      const { day, time } = indiaClock(),
        checkedAt = new Date().toISOString();
      const coverage: Coverage[] = [],
        articles: Article[] = [];
      const record = (name: string, state: Coverage["state"], detail: string) =>
        coverage.push({ name, state, detail, checkedAt });
      const request = (path: string) =>
        this.feed(t).researchRequest(
          path,
          t === "mk-demo" ? process.env.UPSTOX_ACCESS_TOKEN : undefined,
        );
      const keys = settings.watchlist.map((w) => w.key);
      if (!keys.length)
        record(
          "Upstox news",
          "unavailable",
          "Add instruments to your research watchlist.",
        );
      else
        try {
          const result = await getUpstoxNews(request, keys);
          articles.push(...result.items);
          record(
            "Upstox news",
            result.truncated ? "partial" : "checked",
            `${result.items.length} article mappings retrieved from the provider's seven-day window.${result.truncated ? " More than three pages available; coverage is incomplete." : " No articles does not prove no relevant events."}`,
          );
        } catch {
          record(
            "Upstox news",
            "unavailable",
            "News fetch failed. Check token, provider entitlement and connectivity.",
          );
        }
      try {
        const sources = rssSources();
        if (!sources.length)
          record(
            "Exchange / Moneycontrol feeds",
            "unavailable",
            "No verified RSS URLs configured. Coverage does not include these sources.",
          );
        for (const source of sources)
          try {
            const response = await fetch(source.url, {
              redirect: "error",
              signal: AbortSignal.timeout(10000),
            });
            const items = parseRss(
              await boundedBody(response),
              source.name,
              settings.watchlist,
            );
            const freshness = rssFreshness(items);
            if (!freshness.stale) articles.push(...items);
            record(
              source.name,
              freshness.stale ? "unavailable" : "partial",
              `${freshness.stale ? "STALE OR UNDATED FEED — excluded from current research. " : ""}${items.length} feed items parsed (maximum 300 per feed); company matching uses configured names/aliases. Latest dated item: ${
                items
                  .map((a) => a.publishedAt ?? "")
                  .sort()
                  .at(-1) || "unavailable"
              }. Feed window is not full coverage.`,
            );
          } catch {
            record(
              source.name,
              "unavailable",
              "RSS retrieval or parsing failed; no claim of coverage.",
            );
          }
      } catch {
        record(
          "Exchange / Moneycontrol feeds",
          "unavailable",
          "RSS configuration invalid; only supported publisher hosts are allowed.",
        );
      }
      const fundamentals: {
        instrument: string;
        retrievedAt: string;
        ratios: z.infer<typeof RatioResponse>["data"];
      }[] = [];
      const equity = settings.watchlist.filter((w) =>
        /^(NSE_EQ|BSE_EQ)\|[A-Z0-9]{12}$/.test(w.key),
      );
      for (const item of equity.slice(0, 10))
        try {
          const isin = item.key.split("|")[1];
          const result = RatioResponse.parse(
            await request(`/v2/fundamentals/${isin}/key-ratios`),
          );
          fundamentals.push({
            instrument: item.key,
            retrievedAt: checkedAt,
            ratios: result.data,
          });
        } catch {
          /* Coverage reports every missing company below. */
        }
      record(
        "Company fundamentals",
        fundamentals.length ? "partial" : "unavailable",
        `${fundamentals.length}/${equity.length} equity ratio sets fetched (up to 10 per run). Source financial-period timestamps, financial statements and corporate actions are not included; retrieval time is not the accounting period.`,
      );
      record(
        "Economic / results calendar",
        "unavailable",
        "No verified event calendar connected. Check official calendars manually.",
      );
      record(
        "Live portfolio / margins",
        "unavailable",
        "Upstox positions, holdings, margin and order reconciliation are not connected; account checks below cover local paper records only.",
      );
      const merged = new Map<string, Article>();
      for (const article of articles) {
        const old = merged.get(article.id);
        merged.set(article.id, {
          ...article,
          instruments: [
            ...new Set([...(old?.instruments ?? []), ...article.instruments]),
          ],
        });
      }
      const unique = [...merged.values()].sort((a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
      );
      const relevant = unique.filter((a) => a.instruments.length);
      const ai = await analyze(relevant);
      record(
        "AI research",
        ai.state === "generated" ? "checked" : "unavailable",
        ai.detail,
      );
      const report = {
        kind: time >= settings.briefingTime ? "daily update" : "early update",
        day,
        createdAt: checkedAt,
        coverage,
        fundamentals,
        ai,
        evidence: relevant.slice(0, 15),
        articleCount: unique.length,
        relevantCount: relevant.length,
        summary: `${relevant.length} matched articles; ${coverage.filter((c) => c.state === "unavailable").length} unavailable research sources/checks. Review the coverage table before relying on this briefing.`,
      };
      const id = randomUUID();
      await this.store.scoped(t, async (m) => {
        for (const article of unique)
          await m.query(
            "INSERT INTO trader_news(tenant_id,id,article) VALUES($1,$2,$3) ON CONFLICT(tenant_id,id) DO UPDATE SET article=$3,last_seen=now()",
            [t, article.id, JSON.stringify(article)],
          );
        await m.query(
          "INSERT INTO trader_briefings(tenant_id,id,report) VALUES($1,$2,$3)",
          [t, id, JSON.stringify(report)],
        );
        await this.store.record(m, t, "trader.briefing.created", {
          id,
          articleCount: unique.length,
          missingSources: coverage
            .filter((c) => c.state === "unavailable")
            .map((c) => c.name),
        });
      });
      if (
        last &&
        Date.now() - new Date(last.created_at).getTime() >
          settings.refreshMinutes * 120000
      )
        await this.alert(
          t,
          `${day}:gap`,
          "warning",
          "Monitoring gap detected",
          "The previous research check is overdue. This refresh cannot reconstruct all missed news or price events.",
        );
      for (const c of coverage) {
        const key = `coverage:${c.name}`;
        if (c.state !== "checked")
          await this.alert(
            t,
            key,
            "warning",
            `${c.name}: ${c.state}`,
            c.detail,
          );
        else await this.resolve(t, key);
      }
      if (time >= settings.briefingTime)
        await this.alert(
          t,
          `${day}:briefing`,
          "info",
          "Daily research briefing ready",
          report.summary,
        );
      for (const a of relevant.filter(
        (a) =>
          !a.publishedAt || Date.now() - Date.parse(a.publishedAt) < 86400000,
      ))
        await this.alert(
          t,
          `news:${a.id}`,
          "info",
          "Watchlist news needs review",
          `${a.title}${a.publishedAt ? "" : " — Publication time unavailable; verify recency."}`,
          [
            {
              id: a.id,
              url: a.url,
              source: a.source,
              publishedAt: a.publishedAt,
            },
          ],
        );
      return { id, report };
    } finally {
      if (acquired)
        await lock
          .query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [
            `news-risk:${t}`,
          ])
          .catch(() => {});
      await lock.release();
      this.active.delete(t);
    }
  }
  private async checkRisks(t: string, settings: SettingsValue) {
    const { day } = indiaClock();
    await this.store.scoped(t, (m) =>
      m.query(
        "UPDATE trader_alerts SET resolved_at=now() WHERE tenant_id=$1 AND dedupe_key LIKE '%:check:%' AND left(dedupe_key,10)<>$2 AND resolved_at IS NULL",
        [t, day],
      ),
    );
    for (const item of await this.checklistState(t, settings))
      if (item.state === "overdue")
        await this.alert(
          t,
          `${day}:check:${item.id}`,
          item.id === "cutoff" ? "critical" : "warning",
          `Checklist overdue: ${item.title}`,
          `Scheduled for ${item.due} IST. Review and record your note. This is a personal reminder, not an exchange-session determination.`,
        );
    const rows = await this.store.scoped(t, (m) =>
      m.query(
        "SELECT state,count(*)::int AS count FROM paper_orders WHERE tenant_id=$1 GROUP BY state",
        [t],
      ),
    );
    const hasFills = rows.some(
      (r: { state: string; count: number }) =>
        r.state === "filled" && r.count > 0,
    );
    if (hasFills)
      await this.alert(
        t,
        "paper:exits",
        "critical",
        "Paper positions lack managed exits",
        "Local paper fills exist but automatic stops and exits are not implemented. A saved strategy stop field is not an active protective order.",
      );
    else await this.resolve(t, "paper:exits");
    const uncertain = rows.some(
      (r: { state: string; count: number }) =>
        ["unknown", "partially_filled", "submitted"].includes(r.state) &&
        r.count > 0,
    );
    if (uncertain)
      await this.alert(
        t,
        "paper:orders",
        "critical",
        "Review unresolved paper orders",
        "Submitted, partial or uncertain order states need reconciliation.",
      );
    else await this.resolve(t, "paper:orders");
    const feed = this.feed(t).status();
    const missing = settings.watchlist.filter(
      (w) =>
        !feed.quotes.some(
          (q) =>
            q.instrument === w.key &&
            Date.now() - Date.parse(q.receivedAt) < 30000 &&
            Date.now() - Date.parse(q.timestamp) < 30000,
        ),
    );
    if (
      settings.watchlist.length &&
      (feed.state !== "connected" || missing.length)
    )
      await this.alert(
        t,
        "feed:freshness",
        "warning",
        "Watchlist quotes are unavailable or stale",
        `${missing.length}/${settings.watchlist.length} instruments lack recent trade data. A closed/inactive market can also cause this. Do not treat old prices as live.`,
      );
    else await this.resolve(t, "feed:freshness");
  }
  start() {
    const tick = async () => {
      try {
        await this.refresh("mk-demo");
        this.workerError = false;
      } catch {
        this.workerError = true;
      } finally {
        this.lastWorkerCheck = new Date().toISOString();
      }
    };
    void tick();
    this.timer = setInterval(() => void tick(), 60000);
    this.timer.unref();
  }
  stop() {
    clearInterval(this.timer);
  }
}
