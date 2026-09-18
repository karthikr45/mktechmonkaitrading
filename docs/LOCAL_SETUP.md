# Local setup with native PostgreSQL

The existing PostgreSQL server is used directly. Docker is not required for the implemented local app.

## Start working

From this repository:

```bash
pnpm setup:local       # first use: dependencies, dedicated database/schema, Python venv
pnpm dev               # web, Nest API and Python analytics together
```

For the verified production preview:

```bash
pnpm build
pnpm start
```

Open http://127.0.0.1:3200. API docs: http://127.0.0.1:4200/api-docs. Analytics docs: http://127.0.0.1:8200/docs. Ctrl+C stops the launcher. The existing PostgreSQL service is managed independently; the launcher does not stop it.

## Database and configuration

Default setup connects to PostgreSQL on 127.0.0.1:5432 using the current OS user for one-time migration. Override `PG_ADMIN_URL` if that admin connection requires a password or a different server. Migration creates only `mktechmonk_local`, the app role and project tables. Existing roles/passwords are not reset. The app must use the generated non-superuser `DATABASE_URL`; startup rejects privileged roles. Keep `.env` private and ignored.

This machine runs PostgreSQL 14.19. Core schema is compatible. The requested baseline was PostgreSQL 16; no global server upgrade was performed. pgvector and TimescaleDB are absent. AI vector retrieval is unavailable. The earlier `infra/local/001-schema.sql` is a legacy design scaffold and is not the active migration. Active schema is under `infra/local/migrations/`.

Ports are configured by WEB_PORT, API_PORT and ANALYTICS_PORT in .env (3200/4200/8200). Restart services after changing them; rebuild Next.js if the API proxy address changes. Never expose this local-session build publicly.

## Local workflow

1. Open Overview and run replay → strategy → risk, or use `pnpm demo` while the server is running.
2. Inspect the order and approve its paper fill in the UI.
3. Review Positions and Audit trail. Test the global kill switch under Risk controls.
4. Save an SMA definition in Strategy library. This does not enable strategy automation or stops.
5. Run Research lab backtests or Options calculator. Reports retains research history in PostgreSQL.
6. Save Trade journal notes. Restart the application to verify the records remain.

All market prices are synthetic; the paper broker never sends a real order. Current positions are long paper holdings, not broker-reconciled holdings.

## Verification and recovery

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:analytics
pnpm test:db
pnpm test:api           # requires running API
pnpm status:local
pnpm backup:local
pnpm restore:local backups/NAME.dump
```

Database tests use isolated labeled test tenants in the project database. Backup uses the local administrative connection to include RLS-protected data. Restore creates a new `mktechmonk_restore_*` verification database and compares order/audit/execution counts and aggregate cash with the backup manifest; it never overwrites the application database. Run backups while writes are paused for stable manifest comparison. Backup files are private local files and ignored by Git.

`pnpm test:e2e` defines automated Playwright checks on isolated ports; install Chromium first. Local sandbox restrictions can prevent Chromium launch; in-app browser walkthroughs do not count as a passing Playwright suite.

Redis, MinIO, Mailpit, MLflow, Prometheus, Grafana and Ollama remain optional scaffolding until their application integrations are implemented. See FEATURE_AUDIT.md for the precise missing scope.
