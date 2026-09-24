import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "./persistence";
import { NewsRiskService } from "./news-risk/service";
import { Settings } from "./news-risk/contracts";
import type { UpstoxFeed } from "./upstox/feed";
async function main() {
  const store = new LocalStore();
  await store.init();
  process.env.AI_PROVIDER = "disabled";
  process.env.NEWS_RSS_URLS = "";
  const t = `test-research-${randomUUID()}`,
    other = `test-research-${randomUUID()}`;
  const feed = {
    status: () => ({ state: "disconnected", quotes: [] }),
    researchRequest: async (path: string) =>
      path.startsWith("/v2/news")
        ? {
            status: "success",
            data: {
              "NSE_EQ|INE002A01018": [
                {
                  heading: "Fixture announcement",
                  summary: "Integration fixture, not market news",
                  article_link: "https://example.com/research-fixture",
                  published_time: Date.now() - 1000,
                },
              ],
            },
            metadata: { page: { total_pages: 1 } },
          }
        : {
            status: "success",
            data: [{ name: "P/E", company_value: "20", sector_value: "15" }],
          },
  } as unknown as UpstoxFeed;
  const service = new NewsRiskService(store, () => feed);
  try {
    await store.db.query(
      "INSERT INTO local_tenants(id,name) VALUES($1,'Research integration fixture'),($2,'Isolation fixture')",
      [t, other],
    );
    await service.saveSettings(
      t,
      Settings.parse({
        watchlist: [{ key: "NSE_EQ|INE002A01018", name: "Fixture company" }],
      }),
    );
    await Promise.all([service.refresh(t, true), service.refresh(t, true)]);
    const before = await service.state(t);
    assert.equal(before.history.length, 1);
    assert.equal(before.articles.length, 1);
    assert.equal(
      (await service.briefing(t, before.history[0].id)).id,
      before.history[0].id,
    );
    await assert.rejects(service.briefing(other, before.history[0].id));
    assert.equal(
      before.latest.report.coverage.find(
        (c: { name: string }) => c.name === "Upstox news",
      ).state,
      "checked",
    );
    assert.equal(
      before.latest.report.coverage.find(
        (c: { name: string }) => c.name === "AI research",
      ).state,
      "unavailable",
    );
    const alert = before.alerts.find(
      (a: { dedupe_key: string }) => a.dedupe_key === "coverage:AI research",
    );
    await service.acknowledge(t, alert.id);
    await service.alert(
      t,
      "coverage:AI research",
      "warning",
      "AI research",
      "Still unavailable",
    );
    await service.check(t, {
      item: "news",
      note: "Reviewed fixture evidence only",
    });
    const again = await new NewsRiskService(store, () => feed).state(t);
    assert.ok(
      again.alerts.find((a: { id: string }) => a.id === alert.id)
        .acknowledged_at,
    );
    assert.equal(
      again.checklist.find((c) => c.id === "news")?.state,
      "checked",
    );
    assert.equal(again.settings.watchlist.length, 1);
    const isolated = await service.state(other);
    assert.equal(isolated.alerts.length, 0);
    assert.equal(isolated.articles.length, 0);
    await assert.rejects(service.acknowledge(other, alert.id));
    await assert.rejects(
      store.scoped(other, (m) =>
        m.query(
          "INSERT INTO trader_news(tenant_id,id,article) VALUES($1,'forbidden','{}')",
          [t],
        ),
      ),
    );
    await service.resolve(t, "coverage:AI research");
    await service.alert(
      t,
      "coverage:AI research",
      "warning",
      "AI research",
      "Recurrence",
    );
    assert.equal(
      (await service.state(t)).alerts.find(
        (a: { id: string }) => a.id === alert.id,
      ).acknowledged_at,
      null,
    );
    console.log(
      "Research persistence checks passed: concurrent refresh, source coverage, dedupe, acknowledgement, recurrence, checklist, reload and tenant isolation. Fixtures isolated from the user workspace.",
    );
  } finally {
    await store.close();
  }
}
main().catch((error) => {
  console.error(
    "Research persistence check failed",
    error instanceof Error ? error.message : "unknown",
  );
  process.exitCode = 1;
});
