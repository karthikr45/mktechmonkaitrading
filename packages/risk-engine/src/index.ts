import Decimal from "decimal.js";
import type { Draft, OrderState } from "../../contracts/src/index";
export interface RiskContext {
  funds: string;
  quote: string;
  quoteAt: string;
  now: string;
  killSwitch: boolean;
  openPositions: number;
  dailyLoss: string;
  brokerHealthy: boolean;
  strategyEnabled: boolean;
}
export function evaluate(d: Draft, c: RiskContext) {
  const reasons: string[] = [];
  const value = new Decimal(d.limitPrice).mul(d.quantity);
  if (c.killSwitch) reasons.push("KILL_SWITCH");
  if (!c.brokerHealthy) reasons.push("BROKER_UNHEALTHY");
  if (!c.strategyEnabled) reasons.push("STRATEGY_DISABLED");
  if (value.gt(500000)) reasons.push("MAX_ORDER_VALUE");
  if (d.quantity > 100) reasons.push("MAX_QUANTITY");
  if (value.gt(c.funds)) reasons.push("INSUFFICIENT_FUNDS");
  if (c.openPositions >= 10) reasons.push("MAX_POSITIONS");
  if (new Decimal(c.dailyLoss).gte(10000)) reasons.push("DAILY_LOSS_LIMIT");
  const age = Date.parse(c.now) - Date.parse(c.quoteAt);
  if (!Number.isFinite(age) || age > 30000 || age < 0)
    reasons.push("STALE_DATA");
  if (
    new Decimal(c.quote).lte(0) ||
    new Decimal(d.limitPrice).div(c.quote).minus(1).abs().gt("0.03")
  )
    reasons.push("PRICE_DEVIATION");
  return { allowed: reasons.length === 0, reasons, notional: value.toFixed(2) };
}
const transitions: Record<OrderState, OrderState[]> = {
  draft: ["risk_review"],
  risk_review: ["pending_approval", "rejected"],
  pending_approval: ["submitted", "rejected", "cancelled"],
  submitted: ["acknowledged", "rejected", "unknown"],
  acknowledged: ["partially_filled", "filled", "cancelled", "unknown"],
  partially_filled: ["filled", "cancelled", "unknown"],
  filled: [],
  rejected: [],
  cancelled: [],
  unknown: ["acknowledged", "filled", "cancelled", "rejected"],
};
export function transition(from: OrderState, to: OrderState) {
  if (!transitions[from].includes(to))
    throw new Error(`Invalid transition ${from} -> ${to}`);
  return to;
}
