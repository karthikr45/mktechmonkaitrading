import { LocalStore } from "./persistence";
const store = new LocalStore();
async function check() {
  try {
    await store.init();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error(
      message === "API database role must not bypass tenant isolation"
        ? "Startup blocked: DATABASE_URL must use a non-superuser application role. Administrator credentials belong in PG_ADMIN_URL."
        : "Startup blocked: check DATABASE_URL credentials and run pnpm db:migrate.",
    );
    process.exitCode = 1;
  } finally {
    await store.close();
  }
}
void check();
