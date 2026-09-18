import { z } from "zod";
export const Strategy = z
  .object({
    version: z.literal(1),
    name: z.string().min(3),
    instrument: z.literal("DEMO-NIFTY"),
    timeframe: z.literal("1m"),
    entry: z.object({
      indicator: z.literal("SMA"),
      period: z.number().int().min(2).max(200),
      operator: z.literal("price_above"),
    }),
    quantity: z.number().int().min(1).max(100),
    stopLossPct: z.number().positive().max(10),
    targetPct: z.number().positive().max(30),
    enabled: z.boolean(),
  })
  .strict();
export function explain(s: z.infer<typeof Strategy>) {
  return `Buy ${s.quantity} ${s.instrument} when price is above SMA(${s.entry.period}); stop ${s.stopLossPct}%, target ${s.targetPct}%. Human approval required.`;
}
