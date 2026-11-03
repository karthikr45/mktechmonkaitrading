import { expect, it } from "vitest";
import { upstoxGlobalQuote } from "./upstox";
const item = { id: "gift", name: "GIFT Nifty", group: "India" };
it("uses exchange trade time, not fresh retrieval time, and keeps old global quotes stale", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const value = {
    instrument_token: "k",
    last_price: 110,
    net_change: 10,
    last_trade_time: String(now - 3600000),
    timestamp: new Date(now).toISOString(),
  };
  const q = upstoxGlobalQuote(item, value, "k", "120 Seconds", now);
  expect(q.state).toBe("stale");
  expect(q.changePct).toBe(10);
  expect(q.asOf).toBe(new Date(now - 3600000).toISOString());
  expect(
    upstoxGlobalQuote(
      item,
      { ...value, last_trade_time: now + 120000 },
      "k",
      "120 Seconds",
      now,
    ).state,
  ).toBe("unavailable");
  expect(
    upstoxGlobalQuote(
      item,
      { ...value, instrument_token: "wrong" },
      "k",
      "120 Seconds",
      now,
    ).price,
  ).toBeUndefined();
});
