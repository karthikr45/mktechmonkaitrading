import type { Order } from "../../contracts/src/index";
export interface BrokerAdapter {
  id: string;
  status: "mock" | "sandbox" | "configured" | "unavailable";
  capabilities: readonly string[];
  health(): Promise<boolean>;
  placeOrder(
    order: Order,
  ): Promise<{ brokerOrderId: string; status: "filled"; price: string }>;
}
export class PaperBroker implements BrokerAdapter {
  id = "paper";
  status = "mock" as const;
  capabilities = ["limit", "paper"] as const;
  private fills = new Map<
    string,
    { brokerOrderId: string; status: "filled"; price: string }
  >();
  async health() {
    return true;
  }
  async placeOrder(order: Order) {
    if (order.state !== "acknowledged")
      throw new Error("Order must pass approval");
    const key = order.tenantId + ":" + order.id;
    const existing = this.fills.get(key);
    if (existing) return existing;
    const fill = {
      brokerOrderId: "paper-" + order.id,
      status: "filled" as const,
      price: order.limitPrice,
    };
    this.fills.set(key, fill);
    return fill;
  }
}
export class UnavailableBroker implements BrokerAdapter {
  status = "unavailable" as const;
  capabilities = [];
  constructor(public id: "icici-breeze" | "angel-smartapi" | "fyers") {}
  async health() {
    return false;
  }
  async placeOrder(): Promise<never> {
    throw new Error(
      `${this.id}: live integration unavailable; no order transmitted`,
    );
  }
}
export const brokers = [
  new PaperBroker(),
  new UnavailableBroker("icici-breeze"),
  new UnavailableBroker("angel-smartapi"),
  new UnavailableBroker("fyers"),
];
