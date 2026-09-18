import assert from "node:assert/strict";
const base = process.env.MARKET_TEST_URL ?? "http://127.0.0.1:3200/api/";
async function main() {
  assert.equal((await fetch(base + "market/stream")).status, 401);
  const session = await fetch(base + "demo-session", { method: "POST" });
  assert.equal(session.status, 201);
  const { token } = await session.json();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const invalid = await fetch(base + "brokers/upstox/connect", {
    method: "POST",
    headers,
    body: JSON.stringify({ instrumentKeys: ["invalid"] }),
  });
  assert.equal(invalid.status, 400);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + "market/stream", {
      headers,
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /text\/event-stream/,
    );
    const reader = response.body!.getReader();
    let output = "";
    while (!output.includes("event: heartbeat")) {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      output += new TextDecoder().decode(value);
    }
    assert.match(output, /event: status/);
    assert.match(output, /"source":"upstox"/);
    assert.ok(!output.includes(token));
    controller.abort();
    console.log(
      "Market API checks passed: authentication, validation, proxy streaming and heartbeat; no broker connection attempted.",
    );
  } finally {
    clearTimeout(deadline);
    controller.abort();
  }
}
main().catch(() => {
  console.error("Market API check failed");
  process.exitCode = 1;
});
