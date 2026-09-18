import { z } from "zod";
export const Money = z.string().regex(/^\d+(\.\d{1,4})?$/);
export const OrderDraft = z
  .object({
    instrument: z.enum(["DEMO-NIFTY", "DEMO-BANK", "DEMO-TECH"]),
    side: z.enum(["BUY", "SELL"]),
    quantity: z.number().int().positive().max(100000),
    limitPrice: Money,
    idempotencyKey: z.string().min(8).max(100),
  })
  .strict();
export type Draft = z.infer<typeof OrderDraft>;
export type OrderState =
  | "draft"
  | "risk_review"
  | "pending_approval"
  | "submitted"
  | "acknowledged"
  | "partially_filled"
  | "filled"
  | "rejected"
  | "cancelled"
  | "unknown";
export interface Order extends Draft {
  id: string;
  tenantId: string;
  state: OrderState;
  createdAt: string;
  reasons: string[];
  filledQuantity: number;
  fillPrice?: string;
}
export interface Tick {
  instrument: string;
  price: string;
  timestamp: string;
  sequence: number;
  source: "synthetic";
}
export type EventName =
  | "market.tick.received"
  | "market.candle.closed"
  | "market.feed.stale"
  | "scanner.match"
  | "strategy.signal.created"
  | "risk.decision.created"
  | "order.approval.requested"
  | "order.submitted"
  | "order.updated"
  | "position.updated"
  | "model.prediction.created"
  | "alert.created"
  | "notification.sent"
  | "broker.connection.changed";
export interface DomainEvent<T = unknown> {
  id: string;
  tenantId: string;
  name: EventName;
  timestamp: string;
  version: 1;
  correlationId: string;
  payload: T;
}
