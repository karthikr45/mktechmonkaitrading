import { boundedBody, parseRss, rssSources } from "./news-risk/providers";
async function main() {
  for (const source of rssSources()) {
    const response = await fetch(source.url, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    const items = parseRss(await boundedBody(response), source.name, []);
    if (!items.length) throw new Error("No parseable source items");
    console.log(
      `${source.name}: ${items.length} parseable items; newest timestamp ${
        items
          .map((a) => a.publishedAt ?? "")
          .sort()
          .at(-1) || "unavailable"
      }`,
    );
  }
}
main().catch(() => {
  console.error("Public news source check failed");
  process.exitCode = 1;
});
