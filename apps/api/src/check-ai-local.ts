import { loadLocalEnvironment } from "./local-config";
import { GlobalMarkets } from "./global-markets/service";
import { analyze } from "./news-risk/ai";
import { marketEvidence } from "./news-risk/evidence";
async function main() {
  loadLocalEnvironment();
  const state = await new GlobalMarkets().state();
  const evidence = [...state.news.slice(0, 5), ...marketEvidence(state.quotes)];
  console.log(
    `Retrieved ${state.news.length} recent headlines; ${evidence.length - state.news.slice(0, 5).length} valid quote observations. Testing local AI…`,
  );
  const result = await analyze(
    evidence,
    state.regions.map(
      (r) => `${r.group}: ${r.status} (${r.available}/${r.total})`,
    ),
  );
  console.log(
    JSON.stringify(
      {
        state: result.state,
        detail: result.detail,
        model: result.model,
        evidenceCount: result.evidenceCount,
        findings: result.result?.findings.length,
      },
      null,
      2,
    ),
  );
  if (result.state !== "generated") process.exitCode = 1;
}
void main().catch(() => {
  console.error("Local AI verification could not complete.");
  process.exitCode = 1;
});
