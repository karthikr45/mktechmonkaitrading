import { describe, expect, it } from "vitest";
import { indiaClock, projectRisk, Settings } from "./contracts";
import {
  articleId,
  getUpstoxNews,
  parseNews,
  parseRss,
  safeLink,
  rssFreshness,
} from "./providers";
import { validateAnalysis } from "./ai";
const key = "NSE_EQ|INE002A01018";
const article = {
  heading: "Company reports earnings",
  summary: "Reported result",
  article_link: "https://upstox.com/news/example",
  published_time: Date.now() - 1000,
};
describe("News and risk rules", () => {
  it("rolls checklist days at midnight IST", () => {
    expect(indiaClock(new Date("2026-09-24T18:29:00Z"))).toEqual({
      day: "2026-09-24",
      time: "23:59",
    });
    expect(indiaClock(new Date("2026-09-24T18:30:00Z"))).toEqual({
      day: "2026-09-25",
      time: "00:00",
    });
  });
  it("requires bounded intervals and explicit cutoff instead of assuming broker hours", () => {
    expect(Settings.parse({}).cutoffTime).toBe("");
    expect(() => Settings.parse({ refreshMinutes: 0 })).toThrow();
    expect(() => Settings.parse({ briefingTime: "25:30" })).toThrow();
  });
  it("includes costs and adverse slippage in long and short risk", () => {
    const p = {
      side: "BUY",
      entry: "100",
      stop: "95",
      target: "110",
      quantity: 100,
      riskBudget: "500",
      estimatedCosts: "20",
      adverseSlippage: "0.5",
    };
    const r = projectRisk(p);
    expect(r.estimatedStopLoss).toBe("570.00");
    expect(r.maximumQuantityByRisk).toBe("87");
    expect(r.exceedsBudget).toBe(true);
    expect(
      projectRisk({ ...p, side: "SELL", stop: "105", target: "90" })
        .estimatedStopLoss,
    ).toBe("570.00");
    expect(() => projectRisk({ ...p, stop: "105" })).toThrow();
    expect(() => projectRisk({ ...p, riskBudget: "0" })).toThrow();
  });
  it("deduplicates mapped articles without losing instrument relevance", () => {
    const b = "NSE_EQ|INE040H01021";
    const r = parseNews(
      {
        status: "success",
        data: { [key]: [article], [b]: [article] },
        metadata: { page: { total_pages: 1 } },
      },
      [key, b],
    );
    expect(r.items).toHaveLength(1);
    expect(r.items[0].instruments).toEqual([key, b]);
    expect(articleId(article.article_link + "?utm_source=x")).toBe(
      articleId(article.article_link),
    );
  });
  it("does not turn malformed/failed news responses into successful empty coverage", () => {
    expect(() => parseNews({ status: "error" }, [key])).toThrow();
    expect(() =>
      parseNews(
        {
          status: "success",
          data: {
            [key]: [{ ...article, published_time: Date.now() + 1000000 }],
          },
          metadata: { page: { total_pages: 1 } },
        },
        [key],
      ),
    ).toThrow();
  });
  it("caps pagination and explicitly reports incomplete coverage", async () => {
    let calls = 0;
    const r = await getUpstoxNews(async () => {
      calls++;
      return {
        status: "success",
        data: { [key]: [article] },
        metadata: { page: { total_pages: 9 } },
      };
    }, [key]);
    expect(calls).toBe(3);
    expect(r.truncated).toBe(true);
  });
  it("rejects unsafe links and entity-bearing RSS", () => {
    expect(() => safeLink("javascript:alert(1)")).toThrow();
    expect(() => parseRss("<!DOCTYPE x><rss/>", "test", [])).toThrow();
    expect(() => parseRss("<html>denied</html>", "test", [])).toThrow();
    const rows = parseRss(
      "<rss><channel><item><title>Reliance earnings</title><link>https://example.com/a</link><description>Report</description></item></channel></rss>",
      "fixture",
      [{ key, name: "Reliance", aliases: [] }],
    );
    expect(rows[0].instruments).toEqual([key]);
    expect(rows[0].publishedAt).toBeNull();
  });
  it("treats reachable but stale or undated feeds as missing current coverage", () => {
    expect(rssFreshness([]).stale).toBe(true);
    const a = parseNews(
      {
        status: "success",
        data: { [key]: [article] },
        metadata: { page: { total_pages: 1 } },
      },
      [key],
    ).items[0];
    expect(rssFreshness([a]).stale).toBe(false);
    expect(
      rssFreshness([{ ...a, publishedAt: "2024-04-23T17:06:32Z" }]).stale,
    ).toBe(true);
  });
  it("rejects AI findings with invented source IDs", () => {
    const result = {
      summary: "Summary",
      findings: [
        {
          observation: "Report",
          whyItMatters: "Event risk",
          review: "Check source",
          evidenceIds: ["invented"],
          uncertainty: "Summary only",
        },
      ],
    };
    expect(() => validateAnalysis(result, [])).toThrow();
    expect(validateAnalysis({ ...result, findings: [] }, []).summary).toBe(
      "Summary",
    );
  });
});
