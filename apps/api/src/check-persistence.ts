import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { LocalStore } from "./persistence";
import { canonicalJson } from "./engine";
async function test() {
  const a = "test-" + randomUUID(),
    b = "test-" + randomUUID();
  let first = new LocalStore();
  const second = new LocalStore();
  await first.init();
  await second.init();
  try {
    for (const id of [a, b])
      await first.db.query("INSERT INTO local_tenants(id,name) VALUES($1,$2)", [
        id,
        "Automated persistence verification",
      ]);
    const snapshot = await first.snapshot(a);
    const input = {
      instrument: "DEMO-NIFTY",
      side: "BUY",
      quantity: 1,
      limitPrice: snapshot.ticks.at(-1)!.price,
      idempotencyKey: randomUUID(),
    };
    const draft = await first.engine(a, (e) => e.draft(a, input));
    const results = await Promise.all([
      first.engine(a, (e) => e.approve(a, draft.id)),
      second.engine(a, (e) => e.approve(a, draft.id)),
    ]);
    assert.ok(results.every((x) => x.state === "filled"));
    const executions = await first.scoped(a, (m) =>
      m.query("SELECT * FROM paper_executions"),
    );
    assert.equal(executions.length, 1);
    const stored = await first.snapshot(a);
    await first.close();
    first = new LocalStore();
    await first.init();
    assert.equal((await first.snapshot(a)).funds, stored.funds);
    assert.equal((await first.snapshot(a)).orders[0].state, "filled");
    assert.equal(
      (await first.engine(a, (e) => e.draft(a, input))).id,
      draft.id,
    );
    const foreign = await first.scoped(b, (m) =>
      m.query("SELECT * FROM paper_orders WHERE tenant_id=$1", [a]),
    );
    assert.equal(foreign.length, 0);
    await assert.rejects(
      first.engine(b, (e) => e.approve(b, draft.id)),
      /not found/,
    );
    await assert.rejects(
      first.scoped(b, (m) =>
        m.query("INSERT INTO paper_accounts(tenant_id) VALUES($1)", [a]),
      ),
      /row-level security/,
    );
    await assert.rejects(
      first.scoped(a, (m) =>
        m.query("UPDATE paper_audit SET action='tampered' WHERE tenant_id=$1", [
          a,
        ]),
      ),
      /Immutable/,
    );
    const pending = await first.engine(a, (e) =>
      e.draft(a, { ...input, idempotencyKey: randomUUID() }),
    );
    await first.engine(a, (e) => e.kill(a, true));
    assert.equal(
      (await second.engine(a, (e) => e.approve(a, pending.id))).state,
      "rejected",
    );
    await assert.rejects(
      first.engine(a, (e) => {
        e.kill(a, false);
        throw new Error("force rollback");
      }),
      /force rollback/,
    );
    assert.equal((await second.snapshot(a)).killSwitch, true);
    const audits = (await first.snapshot(a)).audit;
    let previous = "GENESIS";
    for (const event of audits) {
      assert.equal(event.previousHash, previous);
      const { hash, ...body } = event;
      assert.equal(
        createHash("sha256").update(canonicalJson(body)).digest("hex"),
        hash,
      );
      previous = hash;
    }
    const token = await first.createSession();
    assert.ok(await second.session(token));
    await first.revoke(token);
    assert.equal(await second.session(token), undefined);
    console.log(
      "PASS: database restart recovery, concurrent approval exactly once, idempotency, RLS read/write denial, immutable audit, cross-process kill switch, rollback, audit hash chain and session revocation.",
    );
  } finally {
    await first.close();
    await second.close();
  }
}
test().catch((e) => {
  console.error(e instanceof Error ? e.message : "Persistence test failed");
  process.exitCode = 1;
});
