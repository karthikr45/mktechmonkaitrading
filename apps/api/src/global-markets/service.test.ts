import { afterEach, describe, expect, it, vi } from "vitest";
import { breadth, catalog, GlobalMarkets, normalize } from "./service";
const now = Date.parse("2026-09-25T15:00:00Z");
const item = catalog.find((i) => i.id === "NVDA")!;
const quote = {
  symbol: "NVDA",
  close: "110",
  previous_close: "100",
  timestamp: now / 1000,
  is_market_open: true,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("Global market evidence", () => {
  it("computes change against previous close", () => {
    const q = normalize(item, quote, "NVDA", now);
    expect(q.changePct).toBeCloseTo(10);
    expect(q.state).toBe("available");
  });
  it("rejects provider errors, mismatched symbols and future timestamps", () => {
    for (const q of [
      { status: "error" },
      { ...quote, symbol: "AAPL" },
      { ...quote, timestamp: now / 1000 + 120 },
      { ...quote, previous_close: "0" },
    ])
      expect(normalize(item, q, "NVDA", now).state).toBe("unavailable");
  });
  it("distinguishes stale open markets from a recent closed session", () => {
    expect(
      normalize(item, { ...quote, timestamp: now / 1000 - 3600 }, "NVDA", now)
        .state,
    ).toBe("stale");
    expect(
      normalize(
        item,
        { ...quote, timestamp: now / 1000 - 86400, is_market_open: false },
        "NVDA",
        now,
      ).session,
    ).toContain("Closed");
  });
  it("never treats missing regional coverage as neutral or green", () => {
    const rows = catalog
      .filter((i) => i.group === "US")
      .map((i) => ({ ...i, state: "unavailable" as const }));
    expect(breadth(rows, "US").status).toBe("Insufficient coverage");
  });
  it("keeps technology stocks outside regional index breadth", () => {
    expect(breadth([normalize(item, quote, "NVDA", now)], "US").status).toBe(
      "Insufficient coverage",
    );
  });
  it("does not fetch quotes without a key and deduplicates concurrent refreshes", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "");
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    const service = new GlobalMarkets();
    const [a, b] = await Promise.all([service.state(), service.state()]);
    expect(a).toBe(b);
    expect(a.quotes.every((q) => q.state === "unavailable")).toBe(true);
    await service.state();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles rate limiting without leaking credentials or fabricating prices", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "private-test-key");
    vi.stubEnv("GLOBAL_MARKET_SYMBOLS", '{"NVDA":"NVDA"}');
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 429 })),
    );
    const state = await new GlobalMarkets().state();
    expect(JSON.stringify(state)).not.toContain("private-test-key");
    expect(state.quotes.find((q) => q.id === "NVDA")?.state).toBe(
      "unavailable",
    );
  });
  it("invalid mappings fail closed without quote requests", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test");
    vi.stubEnv("GLOBAL_MARKET_SYMBOLS", '{"typo":"SPX"}');
    const fetcher = vi.fn().mockRejectedValue(Error());
    vi.stubGlobal("fetch", fetcher);
    const state = await new GlobalMarkets().state();
    expect(state.quotes[0].reason).toBe("Invalid symbol configuration");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("loads a mapped provider quote and filters undated news", async () => {
    vi.stubEnv("TWELVE_DATA_API_KEY", "test");
    vi.stubEnv("GLOBAL_MARKET_SYMBOLS", '{"NVDA":"NVDA"}');
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: URL | string) =>
          Promise.resolve(
            new Response(
              String(url).includes("api.twelvedata.com")
                ? JSON.stringify({ ...quote, timestamp: Date.now() / 1000 })
                : "<rss><channel><item><title>Undated</title><link>https://example.com/news</link></item></channel></rss>",
            ),
          ),
        ),
    );
    const state = await new GlobalMarkets().state();
    expect(state.quotes.find((q) => q.id === "NVDA")?.state).toBe("available");
    expect(state.news).toHaveLength(0);
    expect(
      state.regions.every((r) => r.status === "Insufficient coverage"),
    ).toBe(true);
  });
});
