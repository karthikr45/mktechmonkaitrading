import { expect, it, vi } from "vitest";
import { checkProviders } from "./providers";

it("does not contact providers without credentials or local AI configuration", async () => {
  const fetcher = vi.fn();
  const checks = await checkProviders({}, fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  expect(checks.every((c) => c.status === "blocked")).toBe(true);
});

it("never leaks credentials, account data or upstream exceptions", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValue(new Error("secret-token private-email"));
  const checks = await checkProviders(
    { UPSTOX_ACCESS_TOKEN: "secret-token" },
    fetcher,
  );
  expect(JSON.stringify(checks)).not.toMatch(/secret-token|private-email/);
  expect(checks.find((c) => c.name === "Upstox authentication")?.status).toBe(
    "blocked",
  );
});

it("requires an actual structured Ollama inference, not just installed model presence", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ models: [{ name: "local-model" }] }))
    .mockResolvedValueOnce(
      Response.json({ done: true, response: '{"ready":true}' }),
    );
  const checks = await checkProviders(
    { AI_PROVIDER: "ollama", OLLAMA_MODEL: "local-model" },
    fetcher,
  );
  expect(checks.find((c) => c.name === "Local Ollama inference")?.status).toBe(
    "pass",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("rejects remote Ollama endpoints and malformed generation", async () => {
  const fetcher = vi.fn();
  await checkProviders(
    {
      AI_PROVIDER: "ollama",
      OLLAMA_MODEL: "local-model",
      OLLAMA_URL: "https://example.com",
    },
    fetcher,
  );
  expect(fetcher).not.toHaveBeenCalled();
  fetcher
    .mockResolvedValueOnce(Response.json({ models: [{ name: "local-model" }] }))
    .mockResolvedValueOnce(Response.json({ done: true, response: "not JSON" }));
  const checks = await checkProviders(
    { AI_PROVIDER: "ollama", OLLAMA_MODEL: "local-model" },
    fetcher,
  );
  expect(checks.find((c) => c.name === "Local Ollama inference")?.status).toBe(
    "blocked",
  );
});

it("does not call global quotes with an invalid symbol catalog and rejects API error bodies", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ status: "error", code: 401 }));
  await checkProviders(
    {
      TWELVE_DATA_API_KEY: "secret",
      GLOBAL_MARKET_SYMBOLS: '{"unknown":"NVDA"}',
    },
    fetcher,
  );
  expect(fetcher).not.toHaveBeenCalled();
  const checks = await checkProviders(
    { TWELVE_DATA_API_KEY: "secret", GLOBAL_MARKET_SYMBOLS: '{"NVDA":"NVDA"}' },
    fetcher,
  );
  expect(checks.find((c) => c.name === "Global provider sample")?.status).toBe(
    "blocked",
  );
});
