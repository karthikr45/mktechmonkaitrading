import { z } from "zod";
import { boundedBody } from "../news-risk/providers";
import { catalog } from "../global-markets/service";

type Check = { name: string; status: "pass" | "blocked"; detail: string };
// Never return provider payloads, URLs, account details or exception messages.
export async function checkProviders(
  env: Record<string, string | undefined>,
  request: typeof fetch = fetch,
): Promise<Check[]> {
  const checks: Check[] = [];
  async function check(name: string, work: () => Promise<string>) {
    try {
      checks.push({ name, status: "pass", detail: await work() });
    } catch {
      checks.push({
        name,
        status: "blocked",
        detail:
          "Unavailable, rejected or invalid response. Check configuration and provider access.",
      });
    }
  }
  const json = async (url: string | URL, init: RequestInit = {}) => {
    const response = await request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(60000),
    });
    return JSON.parse(await boundedBody(response, 1_000_000)) as unknown;
  };
  if (!env.UPSTOX_ACCESS_TOKEN?.trim())
    checks.push({
      name: "Upstox",
      status: "blocked",
      detail:
        "Set UPSTOX_ACCESS_TOKEN in local .env. API key alone is insufficient.",
    });
  else
    await check("Upstox authentication", async () => {
      const result = z
        .object({
          status: z.literal("success"),
          data: z.object({
            is_active: z.literal(true),
            exchanges: z.array(z.string()),
          }),
        })
        .parse(
          await json("https://api.upstox.com/v2/user/profile", {
            headers: {
              Authorization: `Bearer ${env.UPSTOX_ACCESS_TOKEN}`,
              Accept: "application/json",
            },
          }),
        );
      if (
        !result.data.exchanges.includes("NSE") ||
        !result.data.exchanges.includes("NFO")
      )
        throw Error();
      return "Active account with NSE/NFO segments. Live quote, chain freshness and stream acceptance still required.";
    });
  let mappings: Record<string, string> = {};
  await check("Global symbol configuration", async () => {
    mappings = z
      .record(z.string(), z.string().min(1).max(100))
      .parse(JSON.parse(env.GLOBAL_MARKET_SYMBOLS || "{}"));
    if (
      !Object.keys(mappings).length ||
      Object.keys(mappings).some((id) => !catalog.some((row) => row.id === id))
    ) {
      mappings = {};
      throw Error();
    }
    return `${Object.keys(mappings).length} of ${catalog.length} catalog instruments mapped; mapping does not confirm entitlement.`;
  });
  if (!env.TWELVE_DATA_API_KEY?.trim())
    checks.push({
      name: "Global provider",
      status: "blocked",
      detail:
        "Set TWELVE_DATA_API_KEY after confirming required exchange coverage and display rights.",
    });
  else if (Object.keys(mappings).length)
    await check("Global provider sample", async () => {
      // One configured symbol only: do not silently spend credits on the entire catalog.
      const url = new URL("https://api.twelvedata.com/quote");
      url.searchParams.set("symbol", Object.values(mappings)[0]);
      url.searchParams.set("apikey", env.TWELVE_DATA_API_KEY!);
      z.object({
        symbol: z.string().min(1),
        close: z.coerce.number().positive(),
        timestamp: z.number().positive(),
      }).parse(await json(url));
      return "One configured quote returned. This does not verify all exchanges, live latency or redistribution rights.";
    });
  if (env.AI_PROVIDER !== "ollama" || !env.OLLAMA_MODEL?.trim())
    checks.push({
      name: "Ollama",
      status: "blocked",
      detail: "Set AI_PROVIDER=ollama and OLLAMA_MODEL to an installed model.",
    });
  else
    await check("Local Ollama inference", async () => {
      const base = new URL(env.OLLAMA_URL || "http://127.0.0.1:11434");
      if (
        base.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        base.pathname !== "/"
      )
        throw Error();
      const tags = z
        .object({ models: z.array(z.object({ name: z.string() })) })
        .parse(await json(new URL("/api/tags", base)));
      if (!tags.models.some((model) => model.name === env.OLLAMA_MODEL))
        throw Error();
      const generated = z
        .object({ done: z.literal(true), response: z.string().min(1) })
        .parse(
          await json(new URL("/api/generate", base), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: env.OLLAMA_MODEL,
              prompt: 'Return JSON only: {"ready":true}',
              format: "json",
              stream: false,
              options: { temperature: 0, num_predict: 32 },
            }),
          }),
        );
      z.object({ ready: z.literal(true) }).parse(
        JSON.parse(generated.response),
      );
      return "Installed local model completed a structured inference; market evidence is still supplied by data providers.";
    });
  return checks;
}
