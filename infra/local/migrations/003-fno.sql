CREATE TABLE IF NOT EXISTS fno_settings(tenant_id text PRIMARY KEY REFERENCES local_tenants(id), revision integer NOT NULL DEFAULT 1, filters jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS fno_runs(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, state text NOT NULL, filters jsonb NOT NULL, progress jsonb NOT NULL DEFAULT '{}', result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id));
CREATE UNIQUE INDEX IF NOT EXISTS fno_one_active ON fno_runs(tenant_id) WHERE state='running';
DO $$ DECLARE tbl text; BEGIN FOREACH tbl IN ARRAY ARRAY['fno_settings','fno_runs'] LOOP
EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=tbl AND policyname='tenant_scope') THEN
EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',tbl); END IF;
END LOOP; END $$;
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
