import { expect, it } from "vitest";
import { financialStatements, normalizeStatement } from "./financials";
const statement = (history = [{ period: "Mar 2026", value: -125 }]) => ({
  status: "success",
  data: {
    type: "consolidated",
    units_in: "crore",
    time_period: "yearly",
    cash_flow: [{ category: "investing", history }],
  },
});
it("preserves negative cash flows and real zero values, ordered by period", () => {
  const rows = normalizeStatement(
    statement([
      { period: "Mar 2025", value: 0 },
      { period: "Mar 2026", value: -125 },
    ]),
    "cash-flow",
    "yearly",
  );
  expect(rows[0].history.map((h) => h.value)).toEqual([-125, 0]);
});
it("rejects missing values, incorrect units and mismatched frequency", () => {
  const raw = statement();
  expect(() =>
    normalizeStatement(
      { ...raw, data: { ...raw.data, units_in: "million" } },
      "cash-flow",
      "yearly",
    ),
  ).toThrow();
  expect(() => normalizeStatement(raw, "cash-flow", "quarterly")).toThrow();
  expect(() =>
    normalizeStatement(
      {
        ...raw,
        data: {
          ...raw.data,
          cash_flow: [
            {
              category: "investing",
              history: [{ period: "Mar 2026", value: null }],
            },
          ],
        },
      },
      "cash-flow",
      "yearly",
    ),
  ).toThrow();
});
it("rejects duplicate periods rather than choosing an arbitrary statement", () => {
  expect(() =>
    normalizeStatement(
      statement([
        { period: "Mar 2026", value: 1 },
        { period: "Mar 2026", value: 2 },
      ]),
      "cash-flow",
      "yearly",
    ),
  ).toThrow();
});
it("retains available sections when other provider requests fail", async () => {
  const result = await financialStatements(async (path) => {
    if (path.includes("cash-flow")) return statement();
    throw Error("Provider unavailable");
  }, "INE002A01018");
  expect(result.sections.map((s) => s.state)).toEqual([
    "unavailable",
    "unavailable",
    "unavailable",
    "available",
  ]);
  expect(result.sections[0].rows).toEqual([]);
  expect(result.sections[3].rows[0].history[0].value).toBe(-125);
});
