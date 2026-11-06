import { z } from "zod";
import Decimal from "decimal.js";
import { Plan, projectRisk } from "../news-risk/contracts";
export const TradePlanInput = Plan.extend({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((s) => s.toUpperCase()),
  horizon: z.enum(["intraday", "swing", "positional"]),
  thesis: z.string().trim().min(10).max(4000),
}).strict();
export function evaluateTradePlan(body: unknown) {
  const input = TradePlanInput.parse(body);
  const { symbol, horizon, thesis, ...prices } = input;
  const risk = projectRisk(prices);
  const reward = new Decimal(risk.estimatedNetReward);
  const ratio = reward.div(risk.estimatedStopLoss);
  return {
    input: { ...prices, symbol, horizon, thesis },
    risk: {
      ...risk,
      estimatedNetReward: reward.toFixed(2),
      rewardRiskRatio: ratio.toFixed(2),
    },
    warnings: [
      ...(risk.exceedsBudget
        ? ["Planned stop loss exceeds your risk budget"]
        : []),
      ...(ratio.lt(2)
        ? ["Net reward/risk is below the client preference of 2:1"]
        : []),
      "Equity cash quantities only; no futures lot, options margin or broker funds validation",
      "A saved plan does not qualify a trade or submit an order; stops are not guaranteed fills",
    ],
  };
}
