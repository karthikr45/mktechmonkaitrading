CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS local_tenants(id text PRIMARY KEY, name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Kolkata', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS paper_accounts(tenant_id text PRIMARY KEY REFERENCES local_tenants(id), cash numeric(24,4) NOT NULL DEFAULT 1000000 CHECK(cash>=0), kill_switch boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS paper_orders(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, idempotency_key text NOT NULL, instrument text NOT NULL, side text NOT NULL CHECK(side IN ('BUY','SELL')), quantity integer NOT NULL CHECK(quantity>0), limit_price numeric(24,4) NOT NULL CHECK(limit_price>0), state text NOT NULL CHECK(state IN ('draft','risk_review','pending_approval','submitted','acknowledged','partially_filled','filled','rejected','cancelled','unknown')), filled_quantity integer NOT NULL DEFAULT 0, fill_price numeric(24,4), reasons jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,idempotency_key));
CREATE TABLE IF NOT EXISTS paper_executions(tenant_id text NOT NULL, order_id uuid NOT NULL, quantity integer NOT NULL, price numeric(24,4) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,order_id), FOREIGN KEY(tenant_id,order_id) REFERENCES paper_orders(tenant_id,id));
CREATE TABLE IF NOT EXISTS cash_ledger(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, order_id uuid, amount numeric(24,4) NOT NULL, description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,order_id));
CREATE TABLE IF NOT EXISTS paper_audit(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, sequence bigint GENERATED ALWAYS AS IDENTITY, at timestamptz NOT NULL, action text NOT NULL, details jsonb NOT NULL, hash text NOT NULL, previous_hash text NOT NULL, PRIMARY KEY(tenant_id,id));
CREATE TABLE IF NOT EXISTS local_sessions(token_hash text PRIMARY KEY, tenant_id text NOT NULL REFERENCES local_tenants(id), role text NOT NULL DEFAULT 'owner', expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS research_runs(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, kind text NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id));
CREATE TABLE IF NOT EXISTS saved_strategies(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, version integer NOT NULL, definition jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id,version));
CREATE TABLE IF NOT EXISTS journal_entries(tenant_id text NOT NULL REFERENCES local_tenants(id), id uuid NOT NULL, order_id uuid, note text NOT NULL, tags jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,order_id) REFERENCES paper_orders(tenant_id,id));
CREATE INDEX IF NOT EXISTS paper_orders_tenant_created ON paper_orders(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS paper_audit_tenant_sequence ON paper_audit(tenant_id,sequence);
CREATE OR REPLACE FUNCTION local_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable audit or execution record'; END $$;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['paper_audit','paper_executions','cash_ledger','saved_strategies','research_runs'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=tbl||'_immutable') THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION local_append_only()',tbl||'_immutable',tbl); END IF;
 END LOOP;
 FOREACH tbl IN ARRAY ARRAY['paper_accounts','paper_orders','paper_executions','cash_ledger','paper_audit','research_runs','saved_strategies','journal_entries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=tbl AND policyname='tenant_scope') THEN
 EXECUTE format('CREATE POLICY tenant_scope ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',tbl); END IF;
 END LOOP;
END $$;
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
