import { z } from "zod";
import Decimal from "decimal.js";
export const Settings = z
  .object({
    enabled: z.boolean().default(true),
    watchlist: z
      .array(
        z
          .object({
            key: z.string().regex(/^[A-Z_]+\|[^|\r\n,]{1,100}$/),
            name: z.string().trim().min(2).max(100),
            aliases: z
              .array(z.string().trim().min(3).max(100))
              .max(5)
              .default([]),
          })
          .strict(),
      )
      .max(30)
      .default([]),
    briefingTime: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default("08:45"),
    cutoffTime: z
      .union([z.literal(""), z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)])
      .default(""),
    refreshMinutes: z.number().int().min(5).max(120).default(15),
    repeatMinutes: z.number().int().min(5).max(240).default(30),
  })
  .strict();
export type SettingsValue = z.infer<typeof Settings>;
export type Article = {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt: string | null;
  source: string;
  instruments: string[];
};
export type Coverage = {
  name: string;
  state: "checked" | "partial" | "unavailable";
  detail: string;
  checkedAt: string;
};
export const checklist = [
  {
    id: "news",
    title: "Review overnight news and company disclosures",
    time: "08:45",
    stage: "Prepare",
  },
  {
    id: "calendar",
    title: "Check results, economic events, holidays and corporate actions",
    time: "08:45",
    stage: "Prepare",
  },
  {
    id: "context",
    title: "Review index, sector, volatility and global market context",
    time: "09:00",
    stage: "Prepare",
  },
  {
    id: "plan",
    title: "Write entry conditions, invalidation, stop and exit plan",
    time: "09:15",
    stage: "Before entry",
  },
  {
    id: "size",
    title: "Check position size, loss budget, costs and available margin",
    time: "09:15",
    stage: "Before entry",
  },
  {
    id: "liquidity",
    title: "Check spread, volume, depth and correlated exposure",
    time: "09:15",
    stage: "Before entry",
  },
  {
    id: "orders",
    title: "Review rejected orders, partial fills and missing exits",
    time: "12:00",
    stage: "Monitor",
  },
  {
    id: "discipline",
    title: "Review daily loss, trade count and rule discipline",
    time: "12:00",
    stage: "Monitor",
  },
  {
    id: "cutoff",
    title: "Verify broker cutoff and remaining intraday positions",
    time: null,
    stage: "Close",
  },
  {
    id: "reconcile",
    title: "Reconcile orders, positions and P&L after costs",
    time: "16:00",
    stage: "Review",
  },
  {
    id: "journal",
    title: "Record mistakes, decisions and tomorrow's events",
    time: "16:15",
    stage: "Review",
  },
] as const;
export function indiaClock(now = new Date()) {
  const local = new Date(now.getTime() + 330 * 60000).toISOString();
  return { day: local.slice(0, 10), time: local.slice(11, 16) };
}
const amount = z.string().regex(/^\d{1,12}(\.\d{1,4})?$/);
export const Plan = z
  .object({
    side: z.enum(["BUY", "SELL"]),
    entry: amount,
    stop: amount,
    target: amount,
    quantity: z.number().int().min(1).max(1000000),
    riskBudget: amount,
    estimatedCosts: amount,
    adverseSlippage: amount,
  })
  .strict();
export function projectRisk(input: unknown) {
  const p = Plan.parse(input);
  const entry = new Decimal(p.entry),
    stop = new Decimal(p.stop),
    target = new Decimal(p.target);
  if (
    entry.lte(0) ||
    stop.lte(0) ||
    target.lte(0) ||
    new Decimal(p.riskBudget).lte(0)
  )
    throw new Error("Prices and budget must be positive");
  if (
    p.side === "BUY"
      ? stop.gte(entry) || target.lte(entry)
      : stop.lte(entry) || target.gte(entry)
  )
    throw new Error("Stop and target must be on the correct sides of entry");
  const costs = new Decimal(p.estimatedCosts),
    slippage = new Decimal(p.adverseSlippage);
  const perUnit = entry.minus(stop).abs().plus(slippage);
  const loss = perUnit.mul(p.quantity).plus(costs);
  const reward = target.minus(entry).abs().mul(p.quantity).minus(costs);
  const size = Decimal.max(0, new Decimal(p.riskBudget).minus(costs))
    .div(perUnit)
    .floor();
  return {
    notional: entry.mul(p.quantity).toFixed(2),
    estimatedStopLoss: loss.toFixed(2),
    estimatedNetReward: reward.toFixed(2),
    rewardRiskRatio: reward.div(loss).toFixed(2),
    maximumQuantityByRisk: size.toFixed(0),
    exceedsBudget: loss.gt(p.riskBudget),
    assumptions:
      "Equity units only. User-entered prices, total round-trip costs and adverse slippage per unit. Not a margin calculation or probability forecast. Gaps can exceed the stop estimate.",
  };
}
