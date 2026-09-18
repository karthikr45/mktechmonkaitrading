# Local operations

Use pnpm dev for development or pnpm build && pnpm start for production preview. Native service ports: web 3200, API 4200, analytics 8200, PostgreSQL 5432. pnpm status:local verifies HTTP services. PostgreSQL is the existing host service; the launcher does not start or stop it.

pnpm db:migrate applies the project schema. pnpm test:db validates persistence/concurrency/RLS. pnpm backup:local creates a private database dump. pnpm restore:local backups/NAME.dump restores into a distinct verification database and checks counts/cash. Existing application data is not overwritten. See LOCAL_SETUP.md for configuration, constraints and recovery details.
