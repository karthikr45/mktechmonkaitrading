import { expect, it } from "vitest";
import { evaluateTradePlan } from "./trade-plan";
const plan = {
  symbol: "RELIANCE",
  horizon: "intraday",
  thesis: "Wait for a confirmed breakout",
  side: "BUY",
  entry: "100",
  stop: "95",
  target: "115",
  quantity: 100,
  riskBudget: "600",
  estimatedCosts: "20",
  adverseSlippage: "1",
};
it("keeps trader assumptions separate and includes costs and slippage in both outcomes", () => {
  const p = evaluateTradePlan(plan);
  expect(p.risk.estimatedStopLoss).toBe("620.00");
  expect(p.risk.estimatedNetReward).toBe("1380.00");
  expect(p.risk.rewardRiskRatio).toBe("2.23");
  expect(p.risk.exceedsBudget).toBe(true);
  expect(p.input.thesis).toBe(plan.thesis);
  expect(p.warnings).toContain("Planned stop loss exceeds your risk budget");
});
it("validates short invalidation and flags insufficient reward after costs", () => {
  const p = evaluateTradePlan({
    ...plan,
    side: "SELL",
    stop: "105",
    target: "95",
  });
  expect(p.risk.estimatedNetReward).toBe("380.00");
  expect(p.warnings).toContain(
    "Net reward/risk is below the client preference of 2:1",
  );
  expect(() => evaluateTradePlan({ ...plan, stop: "101" })).toThrow();
  expect(() => evaluateTradePlan({ ...plan, quantity: 0 })).toThrow();
  expect(() => evaluateTradePlan({ ...plan, entry: "NaN" })).toThrow();
});
