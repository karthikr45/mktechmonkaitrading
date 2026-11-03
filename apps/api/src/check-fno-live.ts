import { LocalStore } from "./persistence";
import { UpstoxFeed } from "./upstox/feed";
import { FnoService } from "./fno/service";

async function main() {
  const symbol = process.argv[2];
  if (!symbol) throw Error("Supply an exchange stock symbol");
  const store = new LocalStore();
  await store.init();
  try {
    const feed = new UpstoxFeed();
    const service = new FnoService(store, async (_t, path) =>
      feed.researchRequest(path, process.env.UPSTOX_ACCESS_TOKEN),
    );
    const saved = await service.backtest("mk-demo", { symbol });
    const technical = await service.technicals("mk-demo", symbol);
    console.log(
      JSON.stringify({
        technicalFrames: technical.result.frames.map((f) => ({
          frame: f.frame,
          status: f.status,
          bars: "bars" in f ? f.bars : 0,
        })),
      }),
    );
    const reloaded = await service.backtestHistory("mk-demo");
    if (!reloaded.some((r: { id: string }) => r.id === saved.id))
      throw Error("Persistence check failed");
    console.log(
      JSON.stringify({
        id: saved.id,
        symbol: saved.result.stock.symbol,
        contract: saved.result.stock.future,
        bars: saved.result.bars,
        earlierTrades: saved.result.earlierPeriod.tradeCount,
        laterTrades: saved.result.laterPeriod.tradeCount,
        persisted: true,
        source: saved.result.source,
      }),
    );
  } finally {
    await store.close();
  }
}
void main().catch(() => {
  console.error(
    "Live historical study failed; check provider history availability, application tenant and token. No credentials printed.",
  );
  process.exitCode = 1;
});
