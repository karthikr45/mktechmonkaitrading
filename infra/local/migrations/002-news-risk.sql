CREATE TABLE IF NOT EXISTS trader_settings (
 tenant_id text PRIMARY KEY REFERENCES local_tenants(id), settings jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS trader_news (
 tenant_id text NOT NULL REFERENCES local_tenants(id), id text NOT NULL,
 article jsonb NOT NULL, first_seen timestamptz NOT NULL DEFAULT now(),
 last_seen timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS trader_briefings (
 tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL,
 report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS trader_alerts (
 tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL,
 dedupe_key text NOT NULL, severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
 title text NOT NULL, detail text NOT NULL, evidence jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
 acknowledged_at timestamptz, resolved_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,dedupe_key)
);
CREATE TABLE IF NOT EXISTS trader_checklist (
 tenant_id text NOT NULL REFERENCES local_tenants(id), day date NOT NULL, item text NOT NULL,
 note text NOT NULL DEFAULT '', checked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,day,item)
);
CREATE INDEX IF NOT EXISTS trader_briefings_recent ON trader_briefings(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS trader_alerts_recent ON trader_alerts(tenant_id,created_at DESC);
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['trader_settings','trader_news','trader_briefings','trader_alerts','trader_checklist'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=tbl AND policyname='tenant_scope') THEN
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',tbl); END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
