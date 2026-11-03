import { z } from "zod";
export const Filters = z
  .object({
    priceMove: z.number().min(0.1).max(50).default(1.8),
    oiChange: z.number().min(1).max(1000).default(10),
    optionVolumeIncrease: z.number().min(0).max(1000).default(20),
    deliveryPct: z.number().min(0).max(100).default(50),
    turnoverCrore: z.number().min(0).max(100000).default(100),
    optionContracts: z.number().int().min(0).default(100000),
    horizon: z.enum(["intraday", "swing", "positional"]).default("intraday"),
  })
  .strict();
export type FiltersValue = z.infer<typeof Filters>;
export function change(current: number | undefined, prior: number | undefined) {
  return current !== undefined &&
    prior !== undefined &&
    Number.isFinite(current) &&
    Number.isFinite(prior) &&
    prior > 0
    ? (100 * (current - prior)) / prior
    : null;
}
export function structure(
  price: number | null,
  oi: number | null,
  f: FiltersValue,
) {
  if (price === null || oi === null) return "Not evaluated";
  if (price >= f.priceMove && oi >= f.oiChange) return "Long build-up";
  if (price <= -f.priceMove && oi >= f.oiChange) return "Short build-up";
  if (price >= f.priceMove && oi <= -f.oiChange) return "Short covering";
  if (price <= -f.priceMove && oi <= -f.oiChange) return "Long unwinding";
  return "No threshold-qualified structure";
}
export function ema(values: number[], period: number) {
  if (values.length < period) return null;
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (const p of values.slice(period)) v += ((p - v) * 2) / (period + 1);
  return v;
}
export function rsi(values: number[], period = 14) {
  if (values.length <= period) return null;
  let gain = 0,
    loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    gain += Math.max(0, d) / period;
    loss += Math.max(0, -d) / period;
  }
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
  }
  return loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
}
const Bar = z.tuple([
  z.string().datetime({ offset: true }),
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
  z.number().nonnegative(),
  z.number().nonnegative().optional(),
]);
export type Candle = z.infer<typeof Bar>;
export function candles(value: unknown, before: string) {
  const parsed = z
    .object({
      status: z.literal("success"),
      data: z.object({ candles: z.array(Bar) }),
    })
    .parse(value);
  const rows = parsed.data.candles
    .filter((r) => r[0].slice(0, 10) < before)
    .sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
  if (
    new Set(rows.map((r) => r[0])).size !== rows.length ||
    rows.some(
      (r) =>
        r[2] < Math.max(r[1], r[4]) ||
        r[3] > Math.min(r[1], r[4]) ||
        r[2] < r[3],
    )
  )
    throw Error("Invalid candles");
  return rows;
}
export function technical(rows: Candle[]) {
  const close = rows.map((r) => r[4]);
  const last = rows.at(-1);
  const p = last ? (last[2] + last[3] + last[4]) / 3 : null;
  return {
    bars: rows.length,
    asOf: last?.[0] ?? null,
    rsi: rsi(close),
    ema: Object.fromEntries(
      [10, 20, 50, 100, 200].map((n) => [n, ema(close, n)]),
    ),
    fibonacciPivots:
      last && p !== null
        ? {
            pivot: p,
            resistance: [0.382, 0.618, 1].map(
              (x) => p + x * (last[2] - last[3]),
            ),
            support: [0.382, 0.618, 1].map((x) => p - x * (last[2] - last[3])),
          }
        : null,
    turnover: null,
    turnoverNote:
      "Exact cash turnover requires a turnover report; OHLCV close × volume is not substituted.",
  };
}
const Side = z.object({
  instrument_key: z.string(),
  market_data: z.object({
    oi: z.number().nonnegative(),
    prev_oi: z.number().nonnegative(),
    volume: z.number().nonnegative(),
    bid_price: z.number().nonnegative(),
    ask_price: z.number().nonnegative(),
    ltp: z.number().nonnegative(),
  }),
  option_greeks: z.object({ iv: z.number().nonnegative() }).optional(),
});
export function chain(value: unknown, key: string, expiry: string) {
  const rows = z
    .object({
      status: z.literal("success"),
      data: z
        .array(
          z.object({
            underlying_key: z.string(),
            expiry: z.string(),
            strike_price: z.number().positive(),
            call_options: Side,
            put_options: Side,
          }),
        )
        .min(1),
    })
    .parse(value).data;
  if (
    rows.some((r) => r.underlying_key !== key || r.expiry !== expiry) ||
    new Set(rows.map((r) => r.strike_price)).size !== rows.length
  )
    throw Error("Chain identity mismatch");
  const sum = (
    side: "call_options" | "put_options",
    field: "oi" | "prev_oi" | "volume",
  ) => rows.reduce((n, r) => n + r[side].market_data[field], 0);
  const call = sum("call_options", "oi"),
    put = sum("put_options", "oi"),
    previousCall = sum("call_options", "prev_oi"),
    previousPut = sum("put_options", "prev_oi");
  return {
    expiry,
    strikes: rows.length,
    pcr: call > 0 ? put / call : null,
    previousPcr: previousCall > 0 ? previousPut / previousCall : null,
    callOi: call,
    putOi: put,
    callOiChangePct: change(call, previousCall),
    putOiChangePct: change(put, previousPut),
    callWall: [...rows].sort(
      (a, b) => b.call_options.market_data.oi - a.call_options.market_data.oi,
    )[0].strike_price,
    putWall: [...rows].sort(
      (a, b) => b.put_options.market_data.oi - a.put_options.market_data.oi,
    )[0].strike_price,
    totalOiChangePct: change(call + put, previousCall + previousPut),
    pcrChange:
      call > 0 && previousCall > 0
        ? put / call - previousPut / previousCall
        : null,
    callVolume: sum("call_options", "volume"),
    putVolume: sum("put_options", "volume"),
    maxPain: null as number | null,
    maxPainNote:
      "Suppressed until chain completeness and OI units are verified.",
    rows: rows.map((r) => ({
      strike: r.strike_price,
      call: r.call_options,
      put: r.put_options,
    })),
    limitation:
      "Chain response has no per-strike quote timestamp; retrieval time does not prove freshness. OI change alone does not prove writing. Volume units require provider verification.",
  };
}

export function verifyChain(
  result: ReturnType<typeof chain>,
  value: unknown,
  key: string,
) {
  const contracts = z
    .object({
      status: z.literal("success"),
      data: z
        .array(
          z.object({
            instrument_key: z.string(),
            underlying_key: z.literal(key),
            expiry: z.literal(result.expiry),
            strike_price: z.number().positive(),
            instrument_type: z.enum(["CE", "PE"]),
            lot_size: z.number().positive(),
          }),
        )
        .min(1),
    })
    .parse(value).data;
  const actual = result.rows.flatMap((r) => [
    { key: r.call.instrument_key, strike: r.strike, side: "CE" },
    { key: r.put.instrument_key, strike: r.strike, side: "PE" },
  ]);
  const complete =
    contracts.length === actual.length &&
    new Set(contracts.map((c) => c.instrument_key)).size === contracts.length &&
    new Set(actual.map((c) => c.key)).size === actual.length &&
    contracts.every((c) =>
      actual.some(
        (a) =>
          a.key === c.instrument_key &&
          a.strike === c.strike_price &&
          a.side === c.instrument_type,
      ),
    );
  const uniformLots = new Set(contracts.map((c) => c.lot_size)).size === 1;
  let maxPain: number | null = null;
  const hasOi = result.callOi + result.putOi > 0;
  if (complete && uniformLots && hasOi) {
    const payouts = result.rows.map((candidate) => ({
      strike: candidate.strike,
      payout: result.rows.reduce(
        (sum, r) =>
          sum +
          Math.max(0, candidate.strike - r.strike) * r.call.market_data.oi +
          Math.max(0, r.strike - candidate.strike) * r.put.market_data.oi,
        0,
      ),
    }));
    const min = Math.min(...payouts.map((p) => p.payout));
    const minima = payouts.filter((p) => p.payout === min);
    if (minima.length === 1) maxPain = minima[0].strike;
  }
  return {
    ...result,
    completeness: complete
      ? "Matches provider expiry contract list"
      : "Incomplete or mismatched provider contract list",
    expectedContracts: contracts.length,
    maxPain,
    maxPainNote:
      maxPain === null
        ? "Unavailable: incomplete chain, nonuniform lots, no OI or tied minima"
        : "Minimum aggregate intrinsic payout across returned strikes with matching provider contracts and uniform lots. Not a price forecast; no freshness guarantee.",
  };
}
