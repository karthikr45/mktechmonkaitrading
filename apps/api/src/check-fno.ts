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
    const plan = await service.saveTradePlan(t, {
      symbol: "Fixture",
      horizon: "intraday",
      thesis: "Isolated verification plan, not client trading data",
      side: "BUY",
      entry: "100",
      stop: "95",
      target: "115",
      quantity: 10,
      riskBudget: "100",
      estimatedCosts: "2",
      adverseSlippage: "0.5",
    });
    assert.equal(plan.result.risk.estimatedStopLoss, "57.00");
    assert.equal(plan.result.state, "plan_only");
    assert.equal((await service.tradePlans(t))[0].id, plan.id);
    assert.equal((await service.tradePlans(other)).length, 0);
    const recovered = new FnoService(
      store,
      async () => {
        throw Error("No provider fetch on saved-plan reads");
      },
      master,
    );
    assert.equal(
      (await recovered.tradePlans(t))[0].result.input.thesis,
      plan.result.input.thesis,
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
    const historical = new FnoService(
      store,
      async () => ({
        status: "success",
        data: {
          candles: Array.from({ length: 60 }, (_, i) => [
            new Date(Date.now() - (61 - i) * 86400000).toISOString(),
            100 + i * 3,
            105 + i * 3,
            99 + i * 3,
            103 + i * 3,
            1000,
            1000 * 1.2 ** i,
          ]),
        },
      }),
      master,
    );
    const study = await historical.backtest(t, { symbol: "Fixture" });
    assert.equal(study.result.bars, 60);
    assert.equal(study.result.inputCandles.length, 60);
    assert.ok(
      (await historical.backtestHistory(t)).some(
        (r: { id: string }) => r.id === study.id,
      ),
    );
    assert.equal((await historical.backtestHistory(other)).length, 0);
    assert.ok(
      (await restarted.backtestHistory(t)).some(
        (r: { id: string }) => r.id === study.id,
      ),
    );
    console.log(
      "PASS: filters, duplicate scan lock, completion, observations, historical studies with retained inputs, missing-evidence gating, restart reads and tenant isolation.",
    );
  } finally {
    await store.close();
  }
}
void main().catch(() => {
  console.error("FNO integration check failed");
  process.exitCode = 1;
});
