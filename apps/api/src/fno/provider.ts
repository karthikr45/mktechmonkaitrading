import { gunzipSync } from "node:zlib";
import { z } from "zod";
export const MasterRow = z.object({
  segment: z.string(),
  instrument_type: z.string(),
  instrument_key: z.string(),
  underlying_key: z.string().optional(),
  underlying_type: z.string().optional(),
  underlying_symbol: z.string().optional(),
  expiry: z.number().optional(),
  lot_size: z.number().positive(),
  weekly: z.boolean().optional(),
});
export type Stock = {
  key: string;
  symbol: string;
  future: string;
  expiry: string;
  lotSize: number;
};
export function universe(value: unknown, now = Date.now()): Stock[] {
  const rows = z
    .array(z.unknown())
    .parse(value)
    .flatMap((r) => {
      const p = MasterRow.safeParse(r);
      return p.success ? [p.data] : [];
    });
  const options = new Set(
    rows
      .filter(
        (r) =>
          r.segment === "NSE_FO" &&
          r.underlying_type === "EQUITY" &&
          ["CE", "PE"].includes(r.instrument_type) &&
          (r.expiry ?? 0) > now,
      )
      .map((r) => r.underlying_key),
  );
  const stocks = new Map<string, Stock>();
  for (const r of rows
    .filter(
      (r) =>
        r.segment === "NSE_FO" &&
        r.instrument_type === "FUT" &&
        r.underlying_type === "EQUITY" &&
        r.underlying_key?.startsWith("NSE_EQ|") &&
        options.has(r.underlying_key) &&
        (r.expiry ?? 0) > now,
    )
    .sort((a, b) => a.expiry! - b.expiry!)) {
    if (!stocks.has(r.underlying_key!))
      stocks.set(r.underlying_key!, {
        key: r.underlying_key!,
        symbol: r.underlying_symbol ?? r.underlying_key!,
        future: r.instrument_key,
        expiry: new Date(r.expiry!).toISOString().slice(0, 10),
        lotSize: r.lot_size,
      });
  }
  return [...stocks.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
export async function loadUniverse() {
  const response = await fetch(
    "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
    { redirect: "error", signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok) throw Error("Universe unavailable");
  const modified = response.headers.get("last-modified");
  if (
    !modified ||
    !Number.isFinite(Date.parse(modified)) ||
    Date.now() - Date.parse(modified) > 96 * 3600000
  )
    throw Error("Universe publication stale or unknown");
  const reader = response.body!.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 20_000_000) throw Error("Master too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const stocks = universe(
    JSON.parse(
      gunzipSync(Buffer.concat(chunks), {
        maxOutputLength: 100_000_000,
      }).toString(),
    ),
  );
  if (!stocks.length) throw Error("Empty universe");
  return {
    stocks,
    publishedAt: modified,
    retrievedAt: new Date().toISOString(),
    source: "Upstox NSE BOD instruments",
    limitation:
      "Broker instrument universe; exchange eligibility, suspension and ban status require separate confirmation.",
  };
}
export const Quotes = z.object({
  status: z.literal("success"),
  data: z.record(
    z.string(),
    z.object({
      instrument_token: z.string(),
      last_price: z.number().positive(),
      net_change: z.number(),
      timestamp: z.string(),
      oi: z.number().nonnegative().optional(),
    }),
  ),
});
