import { z } from "zod";
const Period = z
  .string()
  .regex(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/);
const History = z
  .array(
    z.object({
      period: Period,
      value: z.number().finite(),
      change: z.string().optional(),
    }),
  )
  .min(1)
  .max(40);
const Series = z
  .array(z.object({ category: z.string().min(1).max(100), history: History }))
  .min(1)
  .max(30);
const Base = z.object({
  type: z.literal("consolidated"),
  units_in: z.literal("crore"),
  time_period: z.enum(["yearly", "quarterly"]),
});
export type FinancialSection = {
  id: string;
  name: string;
  state: "available" | "unavailable";
  frequency: "yearly" | "quarterly";
  rows: {
    name: string;
    history: { period: string; value: number; change?: string }[];
  }[];
  reason?: string;
};
const definitions = [
  {
    id: "annual-income",
    name: "Annual income statement",
    endpoint: "income-statement",
    query: "type=consolidated&time_period=yearly",
    frequency: "yearly",
  },
  {
    id: "quarterly-income",
    name: "Quarterly income statement",
    endpoint: "income-statement",
    query: "type=consolidated&time_period=quarterly",
    frequency: "quarterly",
  },
  {
    id: "balance-sheet",
    name: "Annual balance sheet",
    endpoint: "balance-sheet",
    query: "type=consolidated",
    frequency: "yearly",
  },
  {
    id: "cash-flow",
    name: "Annual cash flow",
    endpoint: "cash-flow",
    query: "type=consolidated",
    frequency: "yearly",
  },
] as const;
export function normalizeStatement(
  value: unknown,
  endpoint: string,
  frequency: "yearly" | "quarterly",
) {
  const raw = z
    .object({ status: z.literal("success"), data: Base.passthrough() })
    .parse(value).data;
  if (raw.time_period !== frequency)
    throw Error("Statement frequency mismatch");
  let rows: FinancialSection["rows"];
  if (endpoint === "balance-sheet") {
    const history = z
      .array(
        z.object({
          period: Period,
          total_asset: z.number().finite(),
          total_liability: z.number().finite(),
        }),
      )
      .min(1)
      .max(40)
      .parse(raw.history);
    rows = [
      {
        name: "Total assets",
        history: history.map((h) => ({
          period: h.period,
          value: h.total_asset,
        })),
      },
      {
        name: "Total liabilities",
        history: history.map((h) => ({
          period: h.period,
          value: h.total_liability,
        })),
      },
    ];
  } else
    rows = Series.parse(
      raw[endpoint === "income-statement" ? "income_statement" : "cash_flow"],
    ).map((s) => ({
      name: s.category.replaceAll("_", " "),
      history: s.history,
    }));
  for (const row of rows) {
    if (new Set(row.history.map((h) => h.period)).size !== row.history.length)
      throw Error("Duplicate financial periods");
    row.history.sort(
      (a, b) => Date.parse(`1 ${b.period}`) - Date.parse(`1 ${a.period}`),
    );
  }
  return rows;
}
export async function financialStatements(
  request: (path: string) => Promise<unknown>,
  isin: string,
) {
  if (!/^[A-Z0-9]{12}$/.test(isin)) throw Error("Invalid company identifier");
  const sections: FinancialSection[] = [];
  for (const d of definitions) {
    try {
      const rows = normalizeStatement(
        await request(`/v2/fundamentals/${isin}/${d.endpoint}?${d.query}`),
        d.endpoint,
        d.frequency,
      );
      sections.push({
        id: d.id,
        name: d.name,
        state: "available",
        frequency: d.frequency,
        rows,
      });
    } catch {
      sections.push({
        id: d.id,
        name: d.name,
        state: "unavailable",
        frequency: d.frequency,
        rows: [],
        reason:
          "Provider access, response or reporting-period validation failed",
      });
    }
  }
  return {
    source: "Upstox company fundamentals",
    basis: "consolidated",
    units: "INR crore",
    retrievedAt: new Date().toISOString(),
    sections,
    limitation:
      "Periods are reported by the provider, not filing publication dates. Latest returned quarter may lag newer results. Filing links, restatements and independent reconciliation are not supplied; no missing years or quarters are estimated.",
  };
}
