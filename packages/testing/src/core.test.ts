import { describe, it, expect } from "vitest";
import { TradingEngine } from "../../../apps/api/src/engine";
import { evaluate, transition } from "../../risk-engine/src/index";
import { replay, FeedCursor } from "../../market-data-sdk/src/index";
import { UnavailableBroker } from "../../broker-sdk/src/index";
const draft = (e: TradingEngine, key = "test-order-1") => ({
  instrument: "DEMO-NIFTY",
  side: "BUY",
  quantity: 1,
  limitPrice: e.ticks.at(-1)!.price,
  idempotencyKey: key,
});
describe("paper execution", () => {
  it("requires approval and debits exact funds once", async () => {
    const e = new TradingEngine();
    const o = e.draft("a", draft(e));
    expect(o.state).toBe("pending_approval");
    await e.approve("a", o.id);
    const funds = e.snapshot("a").funds;
    await e.approve("a", o.id);
    expect(e.snapshot("a").funds).toBe(funds);
    expect(e.snapshot("a").orders[0].state).toBe("filled");
  });
  it("deduplicates drafts and detects key conflicts", () => {
    const e = new TradingEngine();
    const o = e.draft("a", draft(e));
    expect(e.draft("a", draft(e)).id).toBe(o.id);
    expect(() => e.draft("a", { ...draft(e), quantity: 2 })).toThrow(
      "conflict",
    );
  });
  it("isolates tenants", async () => {
    const e = new TradingEngine();
    const o = e.draft("a", draft(e));
    expect(e.snapshot("b").orders).toEqual([]);
    await expect(e.approve("b", o.id)).rejects.toThrow("not found");
  });
  it("rechecks kill switch at approval", async () => {
    const e = new TradingEngine();
    const o = e.draft("a", draft(e));
    e.kill("a", true);
    expect((await e.approve("a", o.id)).state).toBe("rejected");
  });
  it("rejects excess quantity", () => {
    const e = new TradingEngine();
    expect(e.draft("a", { ...draft(e), quantity: 101 }).reasons).toContain(
      "MAX_QUANTITY",
    );
  });
  it("does not expose mutable order references", () => {
    const e = new TradingEngine();
    const o = e.draft("a", draft(e));
    o.state = "filled";
    expect(e.snapshot("a").orders[0].state).toBe("pending_approval");
  });
  it("denies stale and future quotes", () => {
    const e = new TradingEngine();
    for (const quoteAt of ["2000-01-01", "2099-01-01"])
      expect(
        evaluate(e.draft("a", draft(e)), { ...e.context("a"), quoteAt })
          .reasons,
      ).toContain("STALE_DATA");
  });
  it("prevents terminal state transitions", () => {
    expect(() => transition("filled", "submitted")).toThrow();
  });
  it("real brokers fail closed", async () => {
    await expect(new UnavailableBroker("fyers").placeOrder()).rejects.toThrow(
      "unavailable",
    );
  });
});
describe("replay", () => {
  it("is reproducible", () => expect(replay(42)).toEqual(replay(42)));
  it("deduplicates and detects sequence gaps", () => {
    const c = new FeedCursor();
    const t = replay();
    expect(c.accept(t[0]).accepted).toBe(true);
    expect(c.accept(t[0]).accepted).toBe(false);
    expect(c.accept(t[2]).gap).toBe(true);
  });
});

describe("replay pipeline", () => {
  it("creates an auditable strategy draft and does not auto-approve", () => {
    const engine = new TradingEngine();
    const result = engine.runReplay("demo");
    expect(result.matched).toBe(true);
    expect(result.order?.state).toBe("pending_approval");
    expect(engine.snapshot("demo").audit.map((a) => a.action)).toContain(
      "strategy.signal.created",
    );
    engine.runReplay("demo");
    expect(engine.snapshot("demo").orders).toHaveLength(1);
  });
  it("prevents overspending across separately drafted orders", async () => {
    const engine = new TradingEngine();
    const orders = [1, 2, 3].map((i) =>
      engine.draft("demo", {
        ...draft(engine, "funds-check-" + i),
        quantity: 20,
      }),
    );
    await engine.approve("demo", orders[0].id);
    await engine.approve("demo", orders[1].id);
    const last = await engine.approve("demo", orders[2].id);
    expect(last.state).toBe("rejected");
    expect(last.reasons).toContain("INSUFFICIENT_FUNDS");
  });
});
