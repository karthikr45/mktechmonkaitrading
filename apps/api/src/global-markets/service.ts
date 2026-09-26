import { z } from "zod";
import { boundedBody, parseRss } from "../news-risk/providers";
export const catalog = [
  ["sp500", "S&P 500", "US"],
  ["nasdaq", "Nasdaq 100", "US"],
  ["dow", "Dow Jones", "US"],
  ["russell", "Russell 2000", "US"],
  ["nikkei", "Nikkei 225", "Asia-Pacific"],
  ["topix", "TOPIX", "Asia-Pacific"],
  ["kospi", "KOSPI", "Asia-Pacific"],
  ["kosdaq", "KOSDAQ", "Asia-Pacific"],
  ["taiwan", "Taiwan TAIEX", "Asia-Pacific"],
  ["shanghai", "Shanghai Composite", "Asia-Pacific"],
  ["csi300", "CSI 300", "Asia-Pacific"],
  ["hangseng", "Hang Seng", "Asia-Pacific"],
  ["hangsengtech", "Hang Seng Tech", "Asia-Pacific"],
  ["asx", "ASX 200", "Asia-Pacific"],
  ["sti", "Singapore STI", "Asia-Pacific"],
  ["stoxx600", "STOXX Europe 600", "Europe"],
  ["eurostoxx", "Euro STOXX 50", "Europe"],
  ["dax", "DAX", "Europe"],
  ["cac", "CAC 40", "Europe"],
  ["ftse", "FTSE 100", "Europe"],
  ["nifty", "Nifty 50", "India"],
  ["sensex", "Sensex", "India"],
  ["banknifty", "Bank Nifty", "India"],
  ["gift", "GIFT Nifty futures", "India"],
  ["indiavix", "India VIX", "Risk context"],
  ["usdinr", "USD/INR", "Currencies"],
  ["usdjpy", "USD/JPY", "Currencies"],
  ["eurusd", "EUR/USD", "Currencies"],
  ["usdcnh", "USD/CNH", "Currencies"],
  ["dxy", "US dollar index", "Currencies"],
  ["brent", "Brent crude", "Risk context"],
  ["gold", "Gold", "Risk context"],
  ["us10y", "US 10-year yield", "Risk context"],
  ...["NVDA", "MSFT", "GOOGL", "AAPL", "AMZN", "META", "TSLA"].map((s) => [
    s,
    s,
    "US technology",
  ]),
].map(([id, name, group]) => ({ id, name, group }));
export type Instrument = (typeof catalog)[number];
export type Quote = Instrument & {
  state: "available" | "stale" | "unavailable";
  price?: number;
  changePct?: number;
  asOf?: string;
  session?: string;
  reason?: string;
  currency?: string;
};
const ResponseSchema = z.object({
  symbol: z.string(),
  close: z.coerce.number().finite(),
  previous_close: z.coerce.number().positive().finite(),
  timestamp: z.number().positive(),
  is_market_open: z.boolean(),
  currency: z.string().optional(),
});
export function normalize(
  item: Instrument,
  value: unknown,
  symbol: string,
  now = Date.now(),
): Quote {
  const parsed = ResponseSchema.safeParse(value);
  if (!parsed.success || parsed.data.symbol !== symbol)
    return {
      ...item,
      state: "unavailable",
      reason: "Provider response incomplete or symbol mismatch",
    };
  const q = parsed.data,
    age = now - q.timestamp * 1000;
  if (age < -60000 || q.close <= 0)
    return {
      ...item,
      state: "unavailable",
      reason: "Invalid price or timestamp",
    };
  const stale = age > (q.is_market_open ? 20 * 60000 : 96 * 3600000);
  return {
    ...item,
    state: stale ? "stale" : "available",
    price: q.close,
    changePct: (q.close / q.previous_close - 1) * 100,
    asOf: new Date(q.timestamp * 1000).toISOString(),
    session: q.is_market_open
      ? "Open · provider snapshot"
      : "Closed · last reported close",
    currency: q.currency,
    reason: stale ? "Quote too old for context" : undefined,
  };
}
export function breadth(quotes: Quote[], group: string) {
  const rows = quotes.filter((q) => q.group === group),
    usable = rows.filter((q) => q.state === "available");
  const up = usable.filter((q) => q.changePct! > 0.1).length,
    down = usable.filter((q) => q.changePct! < -0.1).length;
  const status =
    usable.length < rows.length || !usable.length
      ? "Insufficient coverage"
      : up / usable.length >= 0.7
        ? "Mostly rising"
        : down / usable.length >= 0.7
          ? "Mostly falling"
          : "Mixed / little changed";
  return {
    group,
    status,
    available: usable.length,
    total: rows.length,
    up,
    down,
  };
}
const Mappings = z.record(
  z.string(),
  z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9_./:^=-]+$/),
);
export class GlobalMarkets {
  private cached?: Awaited<ReturnType<GlobalMarkets["fetchState"]>>;
  private until = 0;
  private pending?: Promise<Awaited<ReturnType<GlobalMarkets["fetchState"]>>>;
  async state() {
    if (this.cached && Date.now() < this.until) return this.cached;
    if (this.pending) return this.pending;
    this.pending = this.fetchState()
      .then((value) => {
        this.cached = value;
        this.until = Date.now() + 15 * 60000;
        return value;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  private async fetchState() {
    let mappings: Record<string, string> = {};
    let configError = false;
    try {
      mappings = Mappings.parse(
        JSON.parse(process.env.GLOBAL_MARKET_SYMBOLS ?? "{}"),
      );
      if (Object.keys(mappings).some((id) => !catalog.some((i) => i.id === id)))
        throw Error();
    } catch {
      configError = true;
      mappings = {};
    }
    const key = process.env.TWELVE_DATA_API_KEY;
    const quotes: Quote[] = catalog.map((item) => ({
      ...item,
      state: "unavailable",
      reason: configError
        ? "Invalid symbol configuration"
        : !key
          ? "Global data provider not configured"
          : !mappings[item.id]
            ? "Provider symbol and entitlement need verification"
            : "Waiting for provider",
    }));
    // Explicit opt-in mappings avoid silently spending quota across forty instruments.
    if (key && !configError) {
      const symbols = [...new Set(Object.values(mappings))];
      if (symbols.length)
        try {
          const url = new URL("https://api.twelvedata.com/quote");
          url.searchParams.set("symbol", symbols.join(","));
          url.searchParams.set("apikey", key);
          const response = await fetch(url, {
            redirect: "error",
            signal: AbortSignal.timeout(12000),
          });
          if (!response.ok) throw Error();
          const raw = JSON.parse(await boundedBody(response, 1_000_000));
          for (let i = 0; i < quotes.length; i++) {
            const symbol = mappings[quotes[i].id];
            if (symbol)
              quotes[i] = normalize(
                catalog[i],
                symbols.length === 1 ? raw : raw[symbol],
                symbol,
              );
          }
        } catch {
          for (const row of quotes)
            if (mappings[row.id])
              row.reason =
                "Provider unavailable, rate limited or access denied";
        }
    }
    let news: ReturnType<typeof parseRss> = [];
    let newsStatus = "Unavailable";
    try {
      const response = await fetch(
        "https://feeds.bbci.co.uk/news/business/rss.xml",
        { redirect: "error", signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw Error();
      news = parseRss(
        await boundedBody(response, 2_000_000),
        "BBC Business",
        [],
      )
        .filter(
          (a) =>
            a.publishedAt &&
            Date.now() - Date.parse(a.publishedAt) >= 0 &&
            Date.now() - Date.parse(a.publishedAt) < 72 * 3600000,
        )
        .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
        .slice(0, 8);
      newsStatus = news.length
        ? "Headlines only · partial international coverage"
        : "No recent headlines";
    } catch {
      newsStatus = "International news feed unavailable";
    }
    return {
      checkedAt: new Date().toISOString(),
      provider: "Twelve Data",
      configured: !!key,
      quotes,
      regions: ["US", "Asia-Pacific", "Europe", "India"].map((group) =>
        breadth(quotes, group),
      ),
      news,
      newsStatus,
      interpretation:
        "Regional colours describe observed price breadth, not a forecast for India. Closed markets and open sessions are not simultaneous observations.",
      limitations: [
        "GIFT Nifty requires a verified licensed contract mapping; no spot-gap estimate is calculated.",
        "Scheduled economic events, FII/DII flows and Indian advance/decline breadth are not connected.",
        "No directional probability or automated trading recommendation. Provider delay and market calendars are not independently verified.",
      ],
    };
  }
}
