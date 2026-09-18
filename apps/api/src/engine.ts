import { randomUUID, createHash } from "node:crypto";
import Decimal from "decimal.js";
import { OrderDraft, type Order } from "../../../packages/contracts/src/index";
import { evaluate, transition } from "../../../packages/risk-engine/src/index";
import { PaperBroker } from "../../../packages/broker-sdk/src/index";
import { Strategy, explain } from "../../../packages/strategy-dsl/src/index";
import { replay } from "../../../packages/market-data-sdk/src/index";
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalJson((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export class TradingEngine {
  private orders: Order[] = [];
  private audit: {
    id: string;
    tenantId: string;
    at: string;
    action: string;
    details: unknown;
    hash: string;
    previousHash: string;
  }[] = [];
  private switches = new Map<string, boolean>();
  private balances = new Map<string, string>();
  private broker = new PaperBroker();
  private busy = new Set<string>();
  ticks = replay();
  restore(
    tenantId: string,
    state: {
      orders: Order[];
      audit: TradingEngine["audit"];
      funds: string;
      killSwitch: boolean;
    },
  ) {
    if (
      state.orders.some((o) => o.tenantId !== tenantId) ||
      state.audit.some((a) => a.tenantId !== tenantId)
    )
      throw new Error("Tenant restore mismatch");
    this.orders = structuredClone(state.orders);
    this.audit = structuredClone(state.audit);
    this.balances.set(tenantId, state.funds);
    this.switches.set(tenantId, state.killSwitch);
  }

  runReplay(tenantId: string) {
    const strategy = Strategy.parse({
      version: 1,
      name: "Demo SMA momentum",
      instrument: "DEMO-NIFTY",
      timeframe: "1m",
      entry: { indicator: "SMA", period: 20, operator: "price_above" },
      quantity: 1,
      stopLossPct: 1,
      targetPct: 2,
      enabled: true,
    });
    const sample = this.ticks.slice(-strategy.entry.period);
    const average = sample
      .reduce((a, t) => a.plus(t.price), new Decimal(0))
      .div(sample.length);
    const tick = this.ticks.at(-1)!;
    const matched = new Decimal(tick.price).gt(average);
    this.record(tenantId, "market.replay.completed", {
      seed: 42,
      source: "synthetic",
      observations: this.ticks.length,
    });
    this.record(tenantId, "scanner.match", {
      rule: "price_above_sma20",
      matched,
      average: average.toFixed(4),
    });
    if (!matched) return { matched, strategy: explain(strategy), order: null };
    this.record(tenantId, "strategy.signal.created", {
      strategyVersion: 1,
      instrument: strategy.instrument,
    });
    const order = this.draft(tenantId, {
      instrument: strategy.instrument,
      side: "BUY",
      quantity: strategy.quantity,
      limitPrice: tick.price,
      idempotencyKey: "replay-seed42-sma20-v1",
    });
    return { matched, strategy: explain(strategy), order };
  }

  record(tenantId: string, action: string, details: unknown) {
    const previousHash =
      this.audit.filter((a) => a.tenantId === tenantId).at(-1)?.hash ??
      "GENESIS";
    const body = {
      id: randomUUID(),
      tenantId,
      at: new Date().toISOString(),
      action,
      details,
      previousHash,
    };
    this.audit.push({
      ...body,
      hash: createHash("sha256").update(canonicalJson(body)).digest("hex"),
    });
  }
  snapshot(tenantId: string) {
    return {
      mode: "paper",
      source: "synthetic",
      storage: "ephemeral demo memory",
      timezone: "Asia/Kolkata",
      funds: this.balances.get(tenantId) ?? "1000000.00",
      killSwitch: this.switches.get(tenantId) ?? false,
      ticks: this.ticks,
      orders: structuredClone(
        this.orders.filter((o) => o.tenantId === tenantId),
      ),
      audit: structuredClone(this.audit.filter((a) => a.tenantId === tenantId)),
      ai: { status: "unavailable", reason: "No AI provider configured" },
      brokers: [
        { name: "Paper Broker", status: "mock" },
        { name: "ICICI Breeze", status: "unavailable" },
        { name: "Angel SmartAPI", status: "unavailable" },
        { name: "FYERS", status: "unavailable" },
      ],
    };
  }
  context(tenantId: string) {
    const now = this.ticks.at(-1)!.timestamp;
    return {
      funds: this.balances.get(tenantId) ?? "1000000",
      quote: this.ticks.at(-1)!.price,
      quoteAt: now,
      now,
      killSwitch: this.switches.get(tenantId) ?? false,
      openPositions: 0,
      dailyLoss: "0",
      brokerHealthy: true,
      strategyEnabled: true,
    };
  }
  draft(tenantId: string, input: unknown) {
    const d = OrderDraft.parse(input);
    d.limitPrice = new Decimal(d.limitPrice).toFixed(4);
    if (d.instrument !== "DEMO-NIFTY")
      throw new Error("Instrument unavailable in this demo");
    if (d.side !== "BUY")
      throw new Error("Short selling unavailable in this slice");
    const old = this.orders.find(
      (o) => o.tenantId === tenantId && o.idempotencyKey === d.idempotencyKey,
    );
    if (old) {
      const { instrument, side, quantity, limitPrice, idempotencyKey } = old;
      if (
        JSON.stringify({
          instrument,
          side,
          quantity,
          limitPrice,
          idempotencyKey,
        }) !== JSON.stringify(d)
      )
        throw new Error("Idempotency key conflict");
      return structuredClone(old);
    }
    const risk = evaluate(d, this.context(tenantId));
    const o: Order = {
      ...d,
      id: randomUUID(),
      tenantId,
      state: "draft",
      createdAt: new Date().toISOString(),
      reasons: risk.reasons,
      filledQuantity: 0,
    };
    o.state = transition(o.state, "risk_review");
    o.state = transition(
      o.state,
      risk.allowed ? "pending_approval" : "rejected",
    );
    this.orders.push(o);
    this.record(tenantId, "risk.decision.created", { orderId: o.id, ...risk });
    this.record(tenantId, "order." + o.state, { orderId: o.id });
    return structuredClone(o);
  }
  async approve(tenantId: string, id: string) {
    if (this.busy.has(tenantId)) throw new Error("Execution in progress");
    this.busy.add(tenantId);
    try {
      const o = this.orders.find((o) => o.tenantId === tenantId && o.id === id);
      if (!o) throw new Error("Order not found");
      if (o.state === "filled") return structuredClone(o);
      if (o.state !== "pending_approval")
        throw new Error("Order cannot be approved");
      const risk = evaluate(o, this.context(tenantId));
      this.record(tenantId, "risk.decision.created", { orderId: id, ...risk });
      if (!risk.allowed) {
        o.state = transition(o.state, "rejected");
        o.reasons = risk.reasons;
        return structuredClone(o);
      }
      for (const next of ["submitted", "acknowledged"] as const) {
        o.state = transition(o.state, next);
        this.record(tenantId, "order." + next, { orderId: id });
      }
      const fill = await this.broker.placeOrder(o);
      o.state = transition(o.state, "filled");
      o.filledQuantity = o.quantity;
      o.fillPrice = fill.price;
      this.balances.set(
        tenantId,
        new Decimal(this.context(tenantId).funds)
          .minus(new Decimal(fill.price).mul(o.quantity))
          .toFixed(4),
      );
      this.record(tenantId, "order.filled", { orderId: id, ...fill });
      return structuredClone(o);
    } finally {
      this.busy.delete(tenantId);
    }
  }
  kill(tenantId: string, enabled: boolean) {
    this.switches.set(tenantId, enabled);
    this.record(tenantId, "risk.kill_switch", { enabled });
    return { enabled };
  }
}
