import { expect, it } from "vitest";
import { completed, indicators, chartSeries, crossover } from "./technicals";
import type { Candle } from "./analytics";
const bar = (date: string): Candle => [date, 100, 100, 100, 100, 1000, 0];
it("charts retain actual OHLCV and use earlier history for overlay warmup", () => {
  const rows = Array.from({ length: 180 }, (_, i) =>
    bar(new Date(Date.UTC(2026, 0, i + 1)).toISOString()),
  );
  const chart = chartSeries(rows);
  expect(chart).toHaveLength(120);
  expect(chart[0].time).toBe(rows[60][0]);
  expect(chart[0].ema50).toBe(100);
  expect(chart[0].rsi).toBe(50);
  expect(chart[0].volume).toBe(1000);
  expect(chartSeries(rows.slice(0, 3))[0].ema20).toBeNull();
});
it("flat markets have neutral RSI, zero MACD/ATR/ADX and no artificial trend", () => {
  const r = indicators(
    Array.from({ length: 60 }, (_, i) =>
      bar(new Date(Date.UTC(2026, 0, i + 1)).toISOString()),
    ),
  );
  expect(r.rsi).toBe(50);
  expect(r.macd).toBe(0);
  expect(r.macdSignal).toBe(0);
  expect(r.adx14).toBe(0);
  expect(r.atr14).toBe(0);
  expect(r.volumeVsPrevious20).toBe(1);
});
it("does not output indicators before sufficient warmup", () => {
  const r = indicators([bar("2026-01-01T00:00:00+05:30")]);
  expect(r.macd).toBeNull();
  expect(r.adx14).toBeNull();
  expect(r.atr14).toBeNull();
  expect(r.volumeVsPrevious20).toBeNull();
});
it("removes developing intraday, weekly and monthly bars in IST", () => {
  const now = Date.parse("2026-11-03T10:03:00+05:30");
  expect(
    completed(
      [bar("2026-11-03T09:55:00+05:30"), bar("2026-11-03T10:00:00+05:30")],
      "5m",
      now,
    ),
  ).toHaveLength(1);
  expect(
    completed(
      [bar("2026-10-26T00:00:00+05:30"), bar("2026-11-02T00:00:00+05:30")],
      "weekly",
      now,
    ),
  ).toHaveLength(1);
  expect(
    completed(
      [bar("2026-10-01T00:00:00+05:30"), bar("2026-11-01T00:00:00+05:30")],
      "monthly",
      now,
    ),
  ).toHaveLength(1);
});

it("distinguishes a completed crossover from a continuing trend or absent history", () => {
  expect(crossover(-1, 2)).toBe("Bullish crossover");
  expect(crossover(1, -2)).toBe("Bearish crossover");
  expect(crossover(1, 2)).toBe("No new crossover");
  expect(crossover(0, 0)).toBe("No new crossover");
  expect(crossover(null, 2)).toBe("Insufficient history");
  const rising = Array.from({ length: 220 }, (_, i): Candle => [
    new Date(Date.UTC(2025, 0, i + 1)).toISOString(),
    100 + i,
    100 + i,
    100 + i,
    100 + i,
    1000,
    0,
  ]);
  expect(indicators(rising).emaAlignment).toBe("Bullish alignment");
  expect(indicators(rising).ema50x200).toBe("No new crossover");
  expect(indicators(rising.slice(0, 100)).emaAlignment).toBe(
    "Insufficient history",
  );
});
