import { expect, it } from "vitest";
import { marketEvidence } from "./evidence";
import type { Quote } from "../global-markets/service";
const now = Date.parse("2026-10-02T12:00:00Z");
const row: Quote = {
  id: "NVDA",
  name: "NVIDIA",
  group: "US technology",
  state: "available",
  price: 123,
  changePct: -1.2,
  asOf: new Date(now).toISOString(),
  session: "Open · provider snapshot",
  currency: "USD",
};
it("retains observed values and observation timestamp as citable evidence", () => {
  const [e] = marketEvidence([row], now);
  expect(e.id).toContain("market:NVDA:");
  expect(e.summary).toContain("-1.2000%");
  expect(e.publishedAt).toBe(row.asOf);
});
it("excludes missing, invalid, stale and future quotes even if cached as available", () => {
  const variants: Quote[] = [
    { ...row, state: "unavailable" },
    { ...row, state: "stale" },
    { ...row, price: NaN },
    { ...row, asOf: "bad" },
    { ...row, asOf: new Date(now - 21 * 60000).toISOString() },
    { ...row, asOf: new Date(now + 120000).toISOString() },
  ];
  expect(marketEvidence(variants, now)).toEqual([]);
});
it("accepts a recent closed session without claiming it is live", () => {
  const [e] = marketEvidence(
    [
      {
        ...row,
        asOf: new Date(now - 86400000).toISOString(),
        session: "Closed · last reported close",
      },
    ],
    now,
  );
  expect(e.title).toContain("Closed");
});

it("preserves mixed-provider attribution and never invents a provider", () => {
  const evidence = marketEvidence(
    [{ ...row, source: "Upstox" }, { ...row, source: "Twelve Data" }, row],
    now,
  );
  expect(evidence[0].source).toBe("Upstox quote snapshot");
  expect(evidence[0].url).toContain("upstox.com");
  expect(evidence[1].source).toBe("Twelve Data quote snapshot");
  expect(evidence[2].source).toBe("Unverified provider quote snapshot");
  expect(evidence[2].url).toBe("");
});
