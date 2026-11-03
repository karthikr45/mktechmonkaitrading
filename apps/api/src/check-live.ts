import { loadLocalEnvironment } from "./local-config";
import { LocalStore } from "./persistence";
import { checkProviders } from "./readiness/providers";

async function main() {
  loadLocalEnvironment();
  const store = new LocalStore();
  let blocked = false;
  try {
    await store.init();
    console.log(
      "PASS PostgreSQL: schema and tenant-isolation role checks passed.",
    );
  } catch {
    blocked = true;
    console.log(
      "BLOCKED PostgreSQL: check local service, application role, DATABASE_URL and migrations.",
    );
  } finally {
    await store.close();
  }
  for (const check of await checkProviders(process.env)) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
    if (check.status === "blocked") blocked = true;
  }
  console.log(
    "This is a dependency check, not production certification. See docs/PRODUCTION_READINESS.md for remaining release gates.",
  );
  if (blocked) process.exitCode = 1;
}
void main().catch(() => {
  console.error(
    "Readiness check failed. No credentials or provider payloads are logged.",
  );
  process.exitCode = 1;
});
