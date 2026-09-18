import {loadLocalEnvironment} from '../apps/api/src/local-config';
loadLocalEnvironment();
const base = `http://127.0.0.1:${process.env.API_PORT??4200}/v1`;
async function run() {
  const session = await fetch(base + "/demo-session", { method: "POST" });
  if (!session.ok) throw new Error("Demo session failed");
  const { token } = (await session.json()) as { token: string };
  const response = await fetch(base + "/demo-replay", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new Error("Replay failed");
  console.log(JSON.stringify(await response.json(), null, 2));
  console.log(
    "Replay completed. Open http://127.0.0.1:3200 and approve the draft in Orders & trades. Approval is required before fill.",
  );
}
run().catch((e) => {
  console.error(e instanceof Error ? e.message : "Demo failed");
  console.error("Start pnpm dev first.");
  process.exitCode = 1;
});
