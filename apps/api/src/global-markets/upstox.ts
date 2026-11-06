import { gunzipSync } from "node:zlib";
import { z } from "zod";
import type { Quote } from "./service";
// Instrument identities, not market values. Each key is resolved from the provider master.
const identities: Record<string, string> = {
  "HANG SENG": "hangseng",
  "DOW JONES": "dow",
  "FTSE 100": "ftse",
  "S&P": "sp500",
  "GIFT NIFTY": "gift",
  DAX: "dax",
  "US Tech 100": "nasdaq",
  "CAC 40": "cac",
  "NIKKEI 225": "nikkei",
};
const GlobalRow = z.object({
  name: z.string(),
  instrument_key: z.string(),
  latency: z.string(),
});
export function upstoxGlobalQuote(
  item: Pick<Quote, "id" | "name" | "group">,
  value: unknown,
  key: string,
  latency: string,
  now = Date.now(),
): Quote {
  const parsed = z
    .object({
      instrument_token: z.literal(key),
      last_price: z.number().positive(),
      net_change: z.number(),
      last_trade_time: z.coerce.number().positive(),
    })
    .safeParse(value);
  if (!parsed.success)
    return {
      ...item,
      state: "unavailable",
      reason: "Upstox quote missing or invalid",
    };
  const q = parsed.data,
    age = now - q.last_trade_time,
    prior = q.last_price - q.net_change;
  if (!Number.isSafeInteger(q.last_trade_time) || age < -60000 || prior <= 0)
    return {
      ...item,
      state: "unavailable",
      reason: "Upstox timestamp or baseline invalid",
    };
  return {
    ...item,
    source: "Upstox",
    price: q.last_price,
    changePct: (100 * q.net_change) / prior,
    asOf: new Date(q.last_trade_time).toISOString(),
    state: age > 20 * 60000 ? "stale" : "available",
    session: `Upstox · provider interval ${latency} · ${age > 20 * 60000 ? "older observation; session not confirmed" : "recent observation; session not confirmed"}`,
  };
}
export class UpstoxGlobal {
  private master?: { rows: z.infer<typeof GlobalRow>[]; until: number };
  private cached?: { quotes: Quote[]; until: number };
  private pending?: Promise<Quote[]>;
  constructor(private request: (path: string) => Promise<unknown>) {}
  async quotes(
    catalog: Pick<Quote, "id" | "name" | "group">[],
  ): Promise<Quote[]> {
    if (this.cached && Date.now() < this.cached.until)
      return this.cached.quotes;
    if (this.pending) return this.pending;
    this.pending = this.load(catalog)
      .then((quotes) => {
        this.cached = { quotes, until: Date.now() + 60000 };
        return quotes;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  private async load(catalog: Pick<Quote, "id" | "name" | "group">[]) {
    if (!this.master || Date.now() > this.master.until) {
      const response = await fetch(
        "https://assets.upstox.com/market-quote/instruments/exchange/global.json.gz",
        { redirect: "error", signal: AbortSignal.timeout(12000) },
      );
      if (!response.ok) throw Error("Global instruments unavailable");
      // Stream bytes with a bounded compressed input and decompressed output.
      const reader = response.body!.getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 1000000) throw Error("Global master too large");
          parts.push(value);
        }
      } finally {
        await reader.cancel();
      }
      const rows = z.array(GlobalRow).parse(
        JSON.parse(
          gunzipSync(Buffer.concat(parts), {
            maxOutputLength: 2000000,
          }).toString(),
        ),
      );
      this.master = { rows, until: Date.now() + 15 * 60000 };
    }
    const mapped = this.master.rows.filter((r) => identities[r.name]);
    const india = [
      { id: "nifty", key: "NSE_INDEX|Nifty 50" },
      { id: "banknifty", key: "NSE_INDEX|Nifty Bank" },
      { id: "indiavix", key: "NSE_INDEX|India VIX" },
    ];
    const keys = [
      ...mapped.map((r) => r.instrument_key),
      ...india.map((r) => r.key),
    ];
    const payload = z
      .object({
        status: z.literal("success"),
        data: z.record(z.string(), z.unknown()),
      })
      .parse(
        await this.request(
          "/v2/market-quote/quotes?instrument_key=" +
            encodeURIComponent(keys.join(",")),
        ),
      );
    const raw = Object.values(payload.data);
    return [
      ...mapped.map((r) => ({
        id: identities[r.name],
        key: r.instrument_key,
        latency: r.latency,
      })),
      ...india.map((r) => ({ ...r, latency: "exchange quote" })),
    ].map((r) => {
      const item = catalog.find((i) => i.id === r.id)!;
      return upstoxGlobalQuote(
        item,
        raw.find(
          (q) =>
            q &&
            typeof q === "object" &&
            "instrument_token" in q &&
            q.instrument_token === r.key,
        ),
        r.key,
        r.latency,
      );
    });
  }
}
