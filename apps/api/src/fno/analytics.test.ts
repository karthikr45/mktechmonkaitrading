import { expect, it } from "vitest";
import {
  Filters,
  change,
  structure,
  ema,
  rsi,
  technical,
  candles,
  chain,
  verifyChain,
} from "./analytics";
import { universe } from "./provider";
it("classifies four futures structures with inclusive thresholds", () => {
  const f = Filters.parse({});
  expect(structure(1.8, 10, f)).toBe("Long build-up");
  expect(structure(-1.8, 10, f)).toBe("Short build-up");
  expect(structure(1.8, -10, f)).toBe("Short covering");
  expect(structure(-1.8, -10, f)).toBe("Long unwinding");
  expect(structure(null, 10, f)).toBe("Not evaluated");
  expect(change(10, 0)).toBeNull();
});
it("requires indicator history and handles flat RSI", () => {
  expect(ema([1, 2], 3)).toBeNull();
  expect(ema([1, 2, 3, 4], 3)).toBe(3);
  expect(rsi(Array(20).fill(100))).toBe(50);
  expect(rsi(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(100);
});
it("excludes developing daily candles and rejects duplicates", () => {
  const bar = ["2026-10-12T00:00:00+05:30", 100, 110, 90, 105, 1000, 10];
  expect(
    candles({ status: "success", data: { candles: [bar] } }, "2026-10-12"),
  ).toEqual([]);
  expect(() =>
    candles({ status: "success", data: { candles: [bar, bar] } }, "2026-10-13"),
  ).toThrow();
  expect(technical([]).fibonacciPivots).toBeNull();
});
it("builds universe dynamically and excludes indices, expired and optionless contracts", () => {
  const row = {
    segment: "NSE_FO",
    instrument_type: "FUT",
    instrument_key: "NSE_FO|1",
    underlying_key: "NSE_EQ|TEST",
    underlying_type: "EQUITY",
    underlying_symbol: "Fixture",
    expiry: 2000,
    lot_size: 50,
  };
  const option = { ...row, instrument_key: "NSE_FO|2", instrument_type: "CE" };
  expect(universe([row, option], 1000)).toHaveLength(1);
  expect(universe([row], 1000)).toHaveLength(0);
  expect(universe([row, option], 3000)).toHaveLength(0);
  expect(
    universe([{ ...row, underlying_type: "INDEX" }, option], 1000),
  ).toHaveLength(0);
});
it("rejects mixed-expiry chains and does not invent max pain", () => {
  const side = {
    instrument_key: "NSE_FO|1",
    market_data: {
      oi: 100,
      prev_oi: 0,
      volume: 10,
      bid_price: 1,
      ask_price: 2,
      ltp: 1,
    },
  };
  const payload = {
    status: "success",
    data: [
      {
        underlying_key: "k",
        expiry: "2026-10-27",
        strike_price: 100,
        call_options: side,
        put_options: side,
      },
    ],
  };
  const result = chain(payload, "k", "2026-10-27");
  expect(result.pcr).toBe(1);
  expect(result.callOiChangePct).toBeNull();
  expect(result.maxPain).toBeNull();
  expect(() => chain(payload, "k", "2026-11-24")).toThrow();
});

it("computes max pain only with complete matching uniform-lot contracts", () => {
  const side = (key: string, oi: number) => ({
    instrument_key: key,
    market_data: {
      oi,
      prev_oi: oi,
      volume: 1,
      bid_price: 1,
      ask_price: 2,
      ltp: 1,
    },
  });
  const rows = [
    {
      strike_price: 100,
      call_options: side("c1", 100),
      put_options: side("p1", 1),
    },
    {
      strike_price: 110,
      call_options: side("c2", 1),
      put_options: side("p2", 100),
    },
  ].map((r) => ({ ...r, underlying_key: "k", expiry: "2026-12-01" }));
  const base = chain({ status: "success", data: rows }, "k", "2026-12-01");
  const contracts = rows.flatMap((r) =>
    ["CE", "PE"].map((type) => ({
      instrument_key:
        type === "CE"
          ? r.call_options.instrument_key
          : r.put_options.instrument_key,
      strike_price: r.strike_price,
      instrument_type: type,
      underlying_key: "k",
      expiry: "2026-12-01",
      lot_size: 10,
    })),
  );
  // Symmetric payout has tied minima, which must not produce a spurious unique strike.
  expect(
    verifyChain(base, { status: "success", data: contracts }, "k").maxPain,
  ).toBeNull();
  rows[0].call_options.market_data.oi = 200;
  const stronger = chain({ status: "success", data: rows }, "k", "2026-12-01");
  expect(
    verifyChain(stronger, { status: "success", data: contracts }, "k").maxPain,
  ).toBe(100);
  expect(
    verifyChain(stronger, { status: "success", data: contracts.slice(1) }, "k")
      .maxPain,
  ).toBeNull();
  expect(
    verifyChain(
      stronger,
      {
        status: "success",
        data: contracts.map((c, i) => ({ ...c, lot_size: i ? 10 : 20 })),
      },
      "k",
    ).maxPain,
  ).toBeNull();
});
