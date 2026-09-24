import "reflect-metadata";
import { DataSource } from "typeorm";
import { randomBytes } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  readdirSync,
} from "node:fs";
import { resolve } from "node:path";
import { userInfo } from "node:os";
import { repositoryRoot } from "./local-config";
async function setup() {
  const root = repositoryRoot();
  const envPath = resolve(root, ".env");
  const adminUrl =
    process.env.PG_ADMIN_URL ??
    `postgresql://${encodeURIComponent(userInfo().username)}@127.0.0.1:5432/postgres`;
  const admin = new DataSource({ type: "postgres", url: adminUrl });
  await admin.initialize();
  try {
    const databases = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      ["mktechmonk_local"],
    );
    if (!databases.length)
      await admin.query("CREATE DATABASE mktechmonk_local");
    const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [
      "mktechmonk_app",
    ]);
    if (!role.length) {
      const password = randomBytes(32).toString("hex");
      await admin.query(
        `CREATE ROLE mktechmonk_app LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
      );
      if (!existsSync(envPath)) {
        writeFileSync(
          envPath,
          `DATABASE_URL=postgresql://mktechmonk_app:${password}@127.0.0.1:5432/mktechmonk_local\nEXECUTION_MODE=paper\nLIVE_TRADING_ENABLED=false\nAI_PROVIDER=disabled\nWEB_PORT=3200\nAPI_PORT=4200\nANALYTICS_PORT=8200\n`,
          { mode: 0o600 },
        );
      }
    }
    if (!existsSync(envPath))
      throw new Error(
        "Existing application role found; create .env with DATABASE_URL for that role. No role password was changed.",
      );
    chmodSync(envPath, 0o600);
  } finally {
    await admin.destroy();
  }
  const dbUrl = new URL(adminUrl);
  dbUrl.pathname = "/mktechmonk_local";
  const migration = new DataSource({ type: "postgres", url: dbUrl.toString() });
  await migration.initialize();
  try {
    await migration.transaction(async (manager) => {
      const directory = resolve(root, "infra/local/migrations");
      for (const filename of readdirSync(directory)
        .filter((name) => /^\d+.*\.sql$/.test(name))
        .sort()) {
        await manager.query(readFileSync(resolve(directory, filename), "utf8"));
      }
      await manager.query(
        "GRANT CONNECT ON DATABASE mktechmonk_local TO mktechmonk_app",
      );
      await manager.query("GRANT USAGE ON SCHEMA public TO mktechmonk_app");
      await manager.query(
        "GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO mktechmonk_app",
      );
      await manager.query(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mktechmonk_app",
      );
      await manager.query(
        "INSERT INTO local_tenants(id,name) VALUES('mk-demo','MKTechMonk Local') ON CONFLICT DO NOTHING",
      );
    });
    console.log(
      "Local database migrated. Application uses a non-superuser role. Credentials stored only in ignored .env.",
    );
  } finally {
    await migration.destroy();
  }
}
setup().catch((e) => {
  console.error(
    "Local setup failed:",
    e instanceof Error ? e.message : "database error",
  );
  process.exitCode = 1;
});
