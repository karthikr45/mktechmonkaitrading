import { type Candle, technical, rsi } from "./analytics";

export function chartSeries(rows: Candle[]) {
  const closes = rows.map((r) => r[4]);
  const e20 = emaSeries(closes, 20),
    e50 = emaSeries(closes, 50);
  const start = Math.max(0, rows.length - 120);
  return rows.slice(start).map((r, i) => ({
    time: r[0],
    open: r[1],
    high: r[2],
    low: r[3],
    close: r[4],
    volume: r[5],
    ema20: e20[start + i],
    ema50: e50[start + i],
    rsi: rsi(closes.slice(0, start + i + 1)),
  }));
}

function emaSeries(values: number[], period: number) {
  const result: (number | null)[] = values.map(() => null);
  if (values.length < period) return result;
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = v;
  for (let i = period; i < values.length; i++) {
    v += ((values[i] - v) * 2) / (period + 1);
    result[i] = v;
  }
  return result;
}
// Compare two completed observations; an ongoing trend is not a new crossover.
export function crossover(previous: number | null, current: number | null) {
  if (
    previous === null ||
    current === null ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current)
  )
    return "Insufficient history";
  if (previous <= 0 && current > 0) return "Bullish crossover";
  if (previous >= 0 && current < 0) return "Bearish crossover";
  return "No new crossover";
}
export function indicators(rows: Candle[]) {
  const basic = technical(rows),
    close = rows.map((r) => r[4]),
    last = rows.at(-1);
  const fast = emaSeries(close, 12),
    slow = emaSeries(close, 26);
  const macd = close.flatMap((_, i) =>
    fast[i] !== null && slow[i] !== null ? [fast[i]! - slow[i]!] : [],
  );
  const signalSeries = emaSeries(macd, 9);
  const signal = signalSeries.at(-1) ?? null;
  const previousSignal = signalSeries.at(-2) ?? null;
  const ma50 = emaSeries(close, 50),
    ma200 = emaSeries(close, 200);
  const difference = (
    a: number | null | undefined,
    b: number | null | undefined,
  ) => (a == null || b == null ? null : a - b);
  const alignmentValues = [10, 20, 50, 100, 200].map(
    (period) => emaSeries(close, period).at(-1) ?? null,
  );
  const emaAlignment = alignmentValues.some((value) => value === null)
    ? "Insufficient history"
    : alignmentValues.every(
          (value, i) => i === 0 || alignmentValues[i - 1]! > value!,
        )
      ? "Bullish alignment"
      : alignmentValues.every(
            (value, i) => i === 0 || alignmentValues[i - 1]! < value!,
          )
        ? "Bearish alignment"
        : "Mixed / flat alignment";
  let tr = 0,
    plus = 0,
    minus = 0,
    atr: number | null = null,
    adx: number | null = null;
  const dx: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i],
      b = rows[i - 1];
    const range = Math.max(
      a[2] - a[3],
      Math.abs(a[2] - b[4]),
      Math.abs(a[3] - b[4]),
    );
    const up = a[2] - b[2],
      down = b[3] - a[3];
    const pd = up > down && up > 0 ? up : 0,
      md = down > up && down > 0 ? down : 0;
    if (i <= 14) {
      tr += range;
      plus += pd;
      minus += md;
    } else {
      tr = tr - tr / 14 + range;
      plus = plus - plus / 14 + pd;
      minus = minus - minus / 14 + md;
    }
    if (i >= 14) {
      atr = tr / 14;
      dx.push(
        plus + minus === 0
          ? 0
          : (100 * Math.abs(plus - minus)) / (plus + minus),
      );
    }
  }
  if (dx.length >= 14) {
    adx = dx.slice(0, 14).reduce((a, b) => a + b, 0) / 14;
    for (const d of dx.slice(14)) adx = (adx * 13 + d) / 14;
  }
  const previous20 = rows.slice(-21, -1),
    avg =
      previous20.length === 20
        ? previous20.reduce((s, r) => s + r[5], 0) / 20
        : null;
  const p = last ? (last[2] + last[3] + last[4]) / 3 : null,
    range = last ? last[2] - last[3] : 0;
  return {
    ...basic,
    emaAlignment,
    ema50x200: crossover(
      difference(ma50.at(-2), ma200.at(-2)),
      difference(ma50.at(-1), ma200.at(-1)),
    ),
    macdCrossover: crossover(
      difference(macd.at(-2), previousSignal),
      difference(macd.at(-1), signal),
    ),
    close: last?.[4] ?? null,
    atr14: atr,
    adx14: adx,
    macd: macd.at(-1) ?? null,
    macdSignal: signal,
    macdHistogram: signal !== null ? macd.at(-1)! - signal : null,
    volumeVsPrevious20: avg && last ? last[5] / avg : null,
    rsiBand:
      basic.rsi === null
        ? "Insufficient history"
        : basic.rsi > 70
          ? "Overbought"
          : basic.rsi >= 60
            ? "Strong"
            : basic.rsi >= 45
              ? "Neutral/bullish"
              : basic.rsi >= 30
                ? "Weak"
                : "Oversold",
    emaPosition: Object.fromEntries(
      Object.entries(basic.ema).map(([n, v]) => [
        n,
        v === null || !last
          ? "Unavailable"
          : last[4] > v
            ? "Above"
            : last[4] < v
              ? "Below"
              : "At",
      ]),
    ),
    classicPivots:
      last && p !== null
        ? {
            pivot: p,
            support: [2 * p - last[2], p - range, last[3] - 2 * (last[2] - p)],
            resistance: [
              2 * p - last[3],
              p + range,
              last[2] + 2 * (p - last[3]),
            ],
          }
        : null,
    camarilla: last
      ? {
          support: [12, 6, 4, 2].map((n) => last[4] - (range * 1.1) / n),
          resistance: [12, 6, 4, 2].map((n) => last[4] + (range * 1.1) / n),
        }
      : null,
  };
}

// Conservatively exclude any developing candle, including current week/month.
export function completed(rows: Candle[], frame: string, now = Date.now()) {
  const ist = new Date(now + 330 * 60000),
    today = ist.toISOString().slice(0, 10);
  if (frame === "daily") return rows.filter((r) => r[0].slice(0, 10) < today);
  if (frame === "monthly")
    return rows.filter((r) => r[0].slice(0, 7) < today.slice(0, 7));
  if (frame === "weekly") {
    const monday = new Date(
      Date.UTC(
        ist.getUTCFullYear(),
        ist.getUTCMonth(),
        ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7),
      ),
    )
      .toISOString()
      .slice(0, 10);
    return rows.filter((r) => r[0].slice(0, 10) < monday);
  }
  const minutes = frame === "5m" ? 5 : frame === "15m" ? 15 : 60;
  return rows.filter((r) => Date.parse(r[0]) + minutes * 60000 <= now);
}
