export function paperDraft(price = "22500.00", key = "fixture-order-1") {
  return {
    instrument: "DEMO-NIFTY" as const,
    side: "BUY" as const,
    quantity: 1,
    limitPrice: price,
    idempotencyKey: key,
  };
}
