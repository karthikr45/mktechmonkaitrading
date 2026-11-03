import { expect, it } from "vitest";
import { backtest, BacktestInput } from "./backtest";
import type { Candle } from "./analytics";
function fixture(): Candle[] {
  return Array.from({ length: 60 }, (_, i) => [
    new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    100 + i * 3,
    105 + i * 3,
    99 + i * 3,
    103 + i * 3,
    1000,
    1000 * 1.2 ** i,
  ]);
}
const input = BacktestInput.parse({
  symbol: "FIXTURE",
  priceMove: 0.1,
  oiChange: 1,
  costBps: 10,
  slippageBps: 5,
});
it("executes only after signal, keeps splits separate and accounts for both-side friction", () => {
  const result = backtest(fixture(), input),
    trade = result.earlierPeriod.trades[0];
  expect(Date.parse(trade.entryAt)).toBeGreaterThan(Date.parse(trade.signalAt));
  expect(trade.exitAt).toBe(trade.entryAt);
  expect(trade.netPct).toBeLessThan(trade.grossPct);
  expect(
    result.earlierPeriod.trades.at(-1)!.exitAt < result.laterPeriod.from!,
  ).toBe(true);
  const zero = backtest(fixture(), { ...input, costBps: 0, slippageBps: 0 });
  expect(zero.earlierPeriod.trades[0].netPct).toBeCloseTo(
    zero.earlierPeriod.trades[0].grossPct,
  );
});
it("never invents OI or success rates for missing history", () => {
  const rows = fixture();
  for (const r of rows) r[6] = undefined;
  const result = backtest(rows, input);
  expect(result.earlierPeriod.tradeCount).toBe(0);
  expect(result.earlierPeriod.winRatePct).toBeNull();
  expect(result.earlierPeriod.winRate95IntervalPct).toBeNull();
  expect(() => backtest(rows.slice(0, 20), input)).toThrow();
});
it("changing later candles cannot alter earlier-period trades", () => {
  const rows = fixture(),
    before = backtest(rows, input);
  const changed = rows.map((r, i) =>
    i < 42
      ? r
      : ([r[0], r[1] * 2, r[2] * 2, r[3] * 2, r[4] * 2, r[5], r[6]] as Candle),
  );
  const after = backtest(changed, input);
  expect(after.earlierPeriod).toEqual(before.earlierPeriod);
  expect(after.dataHash).not.toBe(before.dataHash);
});
it("never overlaps holding periods or executes across the split", () => {
  const result = backtest(fixture(), { ...input, holdBars: 5 });
  for (const segment of [result.earlierPeriod, result.laterPeriod]) {
    for (let i = 1; i < segment.trades.length; i++)
      expect(segment.trades[i].entryAt > segment.trades[i - 1].exitAt).toBe(
        true,
      );
    for (const t of segment.trades) expect(t.exitAt <= segment.to!).toBe(true);
  }
});
