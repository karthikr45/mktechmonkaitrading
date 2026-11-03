import { createHash } from "node:crypto";
import { z } from "zod";
import { type Candle, change, structure, Filters } from "./analytics";

export const BacktestInput = z
  .object({
    symbol: z.string().trim().min(1).max(40),
    priceMove: z.number().min(0.1).max(50).default(1.8),
    oiChange: z.number().min(1).max(1000).default(10),
    holdBars: z.number().int().min(1).max(10).default(1),
    costBps: z.number().min(0).max(500).default(10),
    slippageBps: z.number().min(0).max(500).default(5),
  })
  .strict();

// A per-unit futures outcome study, not a margined portfolio simulation.
// The signal uses only a completed candle; execution starts at the next open.
export function backtest(rows: Candle[], input: z.infer<typeof BacktestInput>) {
  if (rows.length < 30)
    throw new Error("At least 30 completed daily bars are required");
  const filters = Filters.parse({
    priceMove: input.priceMove,
    oiChange: input.oiChange,
  });
  const split = Math.floor(rows.length * 0.7);
  function segment(start: number, end: number) {
    const trades: {
      signalAt: string;
      entryAt: string;
      exitAt: string;
      structure: string;
      direction: string;
      entry: number;
      exit: number;
      grossPct: number;
      netPct: number;
      costPct: number;
    }[] = [];
    let missingOi = 0,
      gapSkipped = 0,
      signals = 0;
    for (let i = Math.max(1, start); i + input.holdBars < end; i++) {
      const signal = rows[i],
        previous = rows[i - 1];
      const oi = change(signal[6], previous[6]);
      if (oi === null) {
        missingOi++;
        continue;
      }
      // A long gap is not silently interpreted as a previous-session change.
      if (Date.parse(signal[0]) - Date.parse(previous[0]) > 4 * 86400000) {
        gapSkipped++;
        continue;
      }
      const kind = structure(change(signal[4], previous[4]), oi, filters);
      const direction = ["Long build-up", "Short covering"].includes(kind)
        ? 1
        : ["Short build-up", "Long unwinding"].includes(kind)
          ? -1
          : 0;
      if (!direction) continue;
      signals++;
      const entryBar = rows[i + 1],
        exitBar = rows[i + input.holdBars];
      if (
        Date.parse(exitBar[0]) - Date.parse(signal[0]) >
          (input.holdBars + 4) * 86400000 ||
        rows.slice(i + 1, i + input.holdBars + 1).some((r) => r[5] === 0)
      ) {
        gapSkipped++;
        continue;
      }
      const slip = input.slippageBps / 10000,
        fee = input.costBps / 10000;
      const entry = entryBar[1] * (1 + direction * slip);
      const exit = exitBar[4] * (1 - direction * slip);
      const grossPct =
        (100 * direction * (exitBar[4] - entryBar[1])) / entryBar[1];
      const netPct =
        (100 * (direction * (exit - entry) - fee * (entry + exit))) /
        entryBar[1];
      trades.push({
        signalAt: signal[0],
        entryAt: entryBar[0],
        exitAt: exitBar[0],
        structure: kind,
        direction: direction > 0 ? "LONG" : "SHORT",
        entry,
        exit,
        grossPct,
        netPct,
        costPct: grossPct - netPct,
      });
      i += input.holdBars; // one position at a time, no overlapping signals
    }
    const n = trades.length,
      wins = trades.filter((t) => t.netPct > 0).length;
    const positive = trades.reduce((s, t) => s + Math.max(0, t.netPct), 0);
    const negative = trades.reduce((s, t) => s + Math.max(0, -t.netPct), 0);
    // Wilson 95% interval describes sampling uncertainty, not future probability.
    const p = n ? wins / n : 0,
      z = 1.96,
      denom = 1 + (z * z) / (n || 1);
    const center = (p + (z * z) / (2 * (n || 1))) / denom;
    const half =
      (z *
        Math.sqrt((p * (1 - p)) / (n || 1) + (z * z) / (4 * (n || 1) ** 2))) /
      denom;
    return {
      from: rows[start]?.[0],
      to: rows[end - 1]?.[0],
      bars: end - start,
      signals,
      missingOi,
      gapSkipped,
      trades,
      tradeCount: n,
      winRatePct: n ? (100 * wins) / n : null,
      winRate95IntervalPct: n
        ? [100 * Math.max(0, center - half), 100 * Math.min(1, center + half)]
        : null,
      meanNetReturnPct: n ? trades.reduce((s, t) => s + t.netPct, 0) / n : null,
      profitFactor: negative > 0 ? positive / negative : null,
      sampleAssessment:
        n < 30
          ? "Insufficient sample for reliability conclusions"
          : "Descriptive sample only; independent validation required",
    };
  }
  return {
    engine: "futures-price-oi-outcomes-v1",
    input,
    bars: rows.length,
    dataHash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    earlierPeriod: segment(0, split),
    laterPeriod: segment(split, rows.length),
    assumptions: [
      "Fixed user thresholds; no optimization or claim that the later period is unseen to the user.",
      "Completed daily futures price and same-contract OI; not cash or option-chain OI.",
      "Signal at close, next observed session open entry, fixed holding-period close exit; non-overlapping positions.",
      "Costs and adverse slippage are user assumptions applied on both entry and exit, not an exact broker tax calculation.",
      "Current active contract only; no continuous-contract stitching, historical universe, rollover or survivorship-bias correction.",
      "No margin, position sizing, stop-loss execution or portfolio drawdown simulation. Percentage returns are per entry notional.",
      "Calendar completeness and corporate actions need independent verification. This is an EOD research study, not intraday validation.",
    ],
  };
}
