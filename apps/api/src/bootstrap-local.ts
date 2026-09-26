import "reflect-metadata";
import { DataSource } from "typeorm";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { userInfo } from "node:os";
import { loadLocalEnvironment, repositoryRoot } from "./local-config";
import { LocalStore } from "./persistence";

async function setup() {
  loadLocalEnvironment();
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Set DATABASE_URL in your local .env using a dedicated non-superuser role before running migrations.",
    );
  const application = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(application.pathname.slice(1));
  const role = decodeURIComponent(application.username);
  if (!database || !role)
    throw new Error(
      "DATABASE_URL must specify a database and application role.",
    );
  const adminUrl =
    process.env.PG_ADMIN_URL ??
    `postgresql://${encodeURIComponent(userInfo().username)}@${application.host}/postgres`;
  const adminTarget = new URL(adminUrl);
  if (
    adminTarget.hostname !== application.hostname ||
    adminTarget.port !== application.port
  )
    throw new Error(
      "PG_ADMIN_URL and DATABASE_URL must use the same PostgreSQL host and port.",
    );
  const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const admin = new DataSource({ type: "postgres", url: adminUrl });
  await admin.initialize();
  try {
    const [existing] = await admin.query(
      "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1",
      [role],
    );
    if (existing?.rolsuper || existing?.rolbypassrls)
      throw new Error(
        "DATABASE_URL uses a superuser or BYPASSRLS role. Use a dedicated application role (for example mktechmonk_app); put administrator credentials in PG_ADMIN_URL.",
      );
    if (!existing) {
      const password = decodeURIComponent(application.password);
      if (!password)
        throw new Error(
          "Set an application password in DATABASE_URL before creating its role.",
        );
      const [quoted] = await admin.query(
        "SELECT quote_literal($1) AS password",
        [password],
      );
      await admin.query(
        `CREATE ROLE ${identifier(role)} LOGIN PASSWORD ${quoted.password} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
    }
    if (
      !(
        await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          database,
        ])
      ).length
    )
      await admin.query(`CREATE DATABASE ${identifier(database)}`);
  } finally {
    await admin.destroy();
  }
  adminTarget.pathname = application.pathname;
  const migration = new DataSource({
    type: "postgres",
    url: adminTarget.toString(),
  });
  await migration.initialize();
  try {
    await migration.transaction(async (manager) => {
      const directory = resolve(repositoryRoot(), "infra/local/migrations");
      for (const filename of readdirSync(directory)
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort())
        await manager.query(readFileSync(resolve(directory, filename), "utf8"));
      await manager.query(
        `GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(role)}`,
      );
      await manager.query(
        `GRANT USAGE ON SCHEMA public TO ${identifier(role)}`,
      );
      await manager.query(
        `GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ${identifier(role)}`,
      );
      await manager.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${identifier(role)}`,
      );
      await manager.query(
        "INSERT INTO local_tenants(id,name) VALUES('mk-demo','MKTechMonk Local') ON CONFLICT DO NOTHING",
      );
    });
  } finally {
    await migration.destroy();
  }
  const store = new LocalStore();
  try {
    await store.init();
  } finally {
    await store.close();
  }
  console.log(
    `Database ${database} migrated; application connection and restricted role verified. Your .env was not modified.`,
  );
}
setup().catch((error) => {
  // Never print raw driver errors: they can contain SQL or credentials.
  const message = error instanceof Error ? error.message : "Unknown error";
  const safe =
    /^(Set |DATABASE_URL |PG_ADMIN_URL |Database migrations missing|API database role)/.test(
      message,
    );
  console.error(
    "Local setup failed:",
    safe
      ? message
      : "Check PostgreSQL connectivity, administrator privileges and application credentials. No credentials were printed.",
  );
  process.exitCode = 1;
});
