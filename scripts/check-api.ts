import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.API_URL ?? "http://127.0.0.1:4200";
async function check() {
  assert.equal((await fetch(base + "/v1/dashboard")).status, 401);
  assert.equal(
    (
      await fetch(base + "/v1/demo-session", {
        method: "POST",
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    401,
  );
  const session = await fetch(base + "/v1/demo-session", { method: "POST" });
  assert.equal(session.status, 201);
  const { token } = (await session.json()) as { token: string };
  async function call(path: string, body?: unknown) {
    return fetch(base + "/v1/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  const dash = (await (await call("dashboard")).json()) as {
    ticks: { price: string }[];
  };
  const draft = {
    instrument: "DEMO-NIFTY",
    side: "BUY",
    quantity: 1,
    limitPrice: dash.ticks.at(-1)!.price,
    idempotencyKey: randomUUID(),
  };
  const created = (await (await call("orders", draft)).json()) as {
    id: string;
    state: string;
  };
  assert.equal(created.state, "pending_approval");
  const duplicate = (await (await call("orders", draft)).json()) as {
    id: string;
  };
  assert.equal(duplicate.id, created.id);
  assert.equal((await call("orders", { ...draft, quantity: 2 })).status, 400);
  await call("kill-switch", { enabled: true });
  try {
    const denied = (await (
      await call("orders/" + created.id + "/approve", {})
    ).json()) as { state: string; reasons: string[] };
    assert.equal(denied.state, "rejected");
    assert.ok(denied.reasons.includes("KILL_SWITCH"));
  } finally {
    await call("kill-switch", { enabled: false });
  }
  const passing = (await (
    await call("orders", { ...draft, idempotencyKey: randomUUID() })
  ).json()) as { id: string };
  const filled = (await (
    await call("orders/" + passing.id + "/approve", {})
  ).json()) as { state: string };
  assert.equal(filled.state, "filled");
  console.log(
    "API smoke checks passed: session boundary, origin, validation, duplicate/conflict, kill switch recheck, paper fill.",
  );
}
check().catch((error) => {
  console.error(error instanceof Error ? error.message : "API check failed");
  process.exitCode = 1;
});
