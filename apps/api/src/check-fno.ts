import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "./persistence";
import { FnoService } from "./fno/service";
import { Filters } from "./fno/analytics";
async function main() {
  const store = new LocalStore();
  await store.init();
  const t = "test-fno-" + randomUUID(),
    other = "test-fno-" + randomUUID();
  try {
    await store.db.query(
      "INSERT INTO local_tenants(id,name) VALUES($1,'FNO fixture'),($2,'FNO isolation fixture')",
      [t, other],
    );
    const master = async () => ({
      stocks: [
        {
          key: "NSE_EQ|TEST",
          symbol: "Fixture",
          future: "NSE_FO|1",
          expiry: "2099-01-01",
          lotSize: 1,
        },
      ],
      publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
      source: "TEST FIXTURE ONLY",
      limitation: "Isolated test",
    });
    const service = new FnoService(
      store,
      async () => ({
        status: "success",
        data: {
          cash: {
            instrument_token: "NSE_EQ|TEST",
            last_price: 100,
            net_change: 0,
            timestamp: new Date().toISOString(),
          },
          future: {
            instrument_token: "NSE_FO|1",
            last_price: 100,
            net_change: 0,
            timestamp: new Date().toISOString(),
            oi: 100,
          },
        },
      }),
      master,
    );
    await service.save(t, Filters.parse({ priceMove: 2 }));
    assert.equal((await service.settings(t)).filters.priceMove, 2);
    const { id } = await service.start(t);
    await assert.rejects(service.start(t));
    let report;
    for (let i = 0; i < 50; i++) {
      report = await service.report(t, id);
      if (report.state !== "running") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(report.state, "partial");
    assert.equal(report.result.rows[0].decision, "Outside price filter");
    assert.equal(report.result.qualifiedCandidates, 0);
    assert.equal(report.result.marketStrengthScore, null);
    await assert.rejects(service.report(other, id));
    const crossed = await store.scoped(other, (m) =>
      m.query("SELECT * FROM fno_runs WHERE id=$1", [id]),
    );
    assert.equal(crossed.length, 0);
    const restarted = new FnoService(
      store,
      async () => {
        throw Error("unused");
      },
      master,
    );
    assert.equal((await restarted.report(t, id)).result.rows.length, 1);
    console.log(
      "PASS: filters, duplicate scan lock, background completion, persisted observations, missing-evidence gating, restart reads and tenant isolation.",
    );
  } finally {
    await store.close();
  }
}
void main().catch(() => {
  console.error("FNO integration check failed");
  process.exitCode = 1;
});
