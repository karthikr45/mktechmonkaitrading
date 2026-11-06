import { loadLocalEnvironment } from "./local-config";
import { LocalStore } from "./persistence";
import { FnoService } from "./fno/service";
import { UpstoxFeed } from "./upstox/feed";
async function main() {
  loadLocalEnvironment();
  const store = new LocalStore();
  const feed = new UpstoxFeed();
  try {
    await store.init();
    const fno = new FnoService(store, (_t, path) =>
      feed.researchRequest(path, process.env.UPSTOX_ACCESS_TOKEN),
    );
    const symbol = process.argv[2];
    if (!symbol) throw Error("Pass a current F&O stock symbol");
    const snapshot = await fno.stockSnapshot("mk-demo", symbol);
    console.log(
      JSON.stringify({
        symbol: snapshot.stock.symbol,
        expiry: snapshot.stock.expiry,
        cash: snapshot.spot?.last_price,
        futures: snapshot.future?.last_price,
        oiChange: snapshot.futuresOiChangePct,
        strikes: snapshot.optionChain?.strikes,
        completeness: snapshot.optionChain?.completeness,
        maxPain: snapshot.optionChain?.maxPain,
        failures: snapshot.failures,
      }),
    );
    const result = await fno.stockResearch("mk-demo", symbol);
    console.log(
      JSON.stringify({
        id: result.id,
        ai: result.ai.state,
        ...("failure" in result.ai ? { failure: result.ai.failure } : {}),
        articles: result.news.length,
        ratios: result.fundamentals.length,
        financials: result.financials.sections.map((section) => ({
          section: section.id,
          state: section.state,
          periods: [
            ...new Set(
              section.rows.flatMap((row) => row.history.map((h) => h.period)),
            ),
          ],
        })),
        findings: result.ai.result?.findings.length,
      }),
    );
    if (result.ai.state !== "generated" || snapshot.failures.length)
      process.exitCode = 1;
  } finally {
    feed.disconnect();
    await store.close();
  }
}
void main().catch(() => {
  console.error(
    "Stock acceptance failed; check local services and configured provider access.",
  );
  process.exitCode = 1;
});
