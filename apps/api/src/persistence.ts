import "reflect-metadata";
import { DataSource, type EntityManager } from "typeorm";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import Decimal from "decimal.js";
import { TradingEngine, canonicalJson } from "./engine";
import type { Order } from "../../../packages/contracts/src/index";
import { loadLocalEnvironment } from "./local-config";
export class LocalStore {
  readonly db: DataSource;
  constructor(url?: string) {
    loadLocalEnvironment();
    const connection = url ?? process.env.DATABASE_URL;
    if (!connection)
      throw new Error("DATABASE_URL missing; run pnpm setup:local");
    this.db = new DataSource({
      type: "postgres",
      url: connection,
      extra: { max: 10 },
      logging: false,
    });
  }
  async init() {
    await this.db.initialize();
    const role = await this.db.query(
      "SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user",
    );
    if (role[0].rolsuper || role[0].rolbypassrls) {
      await this.db.destroy();
      throw new Error("API database role must not bypass tenant isolation");
    }
    await this.db.query(
      "SELECT version FROM schema_migrations WHERE version=1",
    );
  }
  async close() {
    if (this.db.isInitialized) await this.db.destroy();
  }
  async scoped<T>(
    tenantId: string,
    fn: (manager: EntityManager) => Promise<T>,
  ) {
    return this.db.transaction(async (m) => {
      await m.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      return fn(m);
    });
  }
  async record(
    m: EntityManager,
    tenantId: string,
    action: string,
    details: unknown,
  ) {
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      tenantId,
    ]);
    const [last] = await m.query(
      "SELECT hash FROM paper_audit WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1",
      [tenantId],
    );
    const body = {
      id: randomUUID(),
      tenantId,
      at: new Date().toISOString(),
      action,
      details,
      previousHash: last?.hash ?? "GENESIS",
    };
    const hash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    await m.query(
      "INSERT INTO paper_audit(tenant_id,id,at,action,details,hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        tenantId,
        body.id,
        body.at,
        action,
        JSON.stringify(details),
        hash,
        body.previousHash,
      ],
    );
  }
  async engine<T>(
    tenantId: string,
    fn: (engine: TradingEngine) => T | Promise<T>,
  ) {
    return this.scoped(tenantId, async (m) => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        tenantId,
      ]);
      await m.query(
        "INSERT INTO paper_accounts(tenant_id) VALUES($1) ON CONFLICT DO NOTHING",
        [tenantId],
      );
      const [account] = await m.query(
        "SELECT cash,kill_switch FROM paper_accounts WHERE tenant_id=$1 FOR UPDATE",
        [tenantId],
      );
      const rows = await m.query(
        "SELECT * FROM paper_orders WHERE tenant_id=$1 ORDER BY created_at,id",
        [tenantId],
      );
      const auditRows = await m.query(
        "SELECT * FROM paper_audit WHERE tenant_id=$1 ORDER BY sequence",
        [tenantId],
      );
      const orders: Order[] = rows.map((r: Record<string, unknown>): Order => ({
        id: String(r.id),
        idempotencyKey: String(r.idempotency_key),
        tenantId: String(r.tenant_id),
        instrument: String(r.instrument) as Order["instrument"],
        side: String(r.side) as Order["side"],
        quantity: Number(r.quantity),
        limitPrice: new Decimal(String(r.limit_price)).toFixed(4),
        state: String(r.state) as Order["state"],
        createdAt: (r.created_at instanceof Date
          ? r.created_at
          : new Date(String(r.created_at))
        ).toISOString(),
        reasons: r.reasons as string[],
        filledQuantity: Number(r.filled_quantity),
        ...(r.fill_price
          ? { fillPrice: new Decimal(String(r.fill_price)).toFixed(4) }
          : {}),
      }));
      const audit = auditRows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        tenantId: String(r.tenant_id),
        at: (r.at instanceof Date
          ? r.at
          : new Date(String(r.at))
        ).toISOString(),
        action: String(r.action),
        details: r.details,
        hash: String(r.hash),
        previousHash: String(r.previous_hash),
      }));
      const engine = new TradingEngine();
      engine.restore(tenantId, {
        orders,
        audit,
        funds: new Decimal(account.cash).toFixed(4),
        killSwitch: account.kill_switch,
      });
      const result = await fn(engine);
      const snapshot = engine.snapshot(tenantId);
      await m.query(
        "UPDATE paper_accounts SET cash=$2,kill_switch=$3,updated_at=now() WHERE tenant_id=$1",
        [tenantId, snapshot.funds, snapshot.killSwitch],
      );
      for (const o of snapshot.orders) {
        await m.query(
          `INSERT INTO paper_orders(tenant_id,id,idempotency_key,instrument,side,quantity,limit_price,state,filled_quantity,fill_price,reasons,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(tenant_id,id) DO UPDATE SET state=EXCLUDED.state,filled_quantity=EXCLUDED.filled_quantity,fill_price=EXCLUDED.fill_price,reasons=EXCLUDED.reasons`,
          [
            tenantId,
            o.id,
            o.idempotencyKey,
            o.instrument,
            o.side,
            o.quantity,
            o.limitPrice,
            o.state,
            o.filledQuantity,
            o.fillPrice ?? null,
            JSON.stringify(o.reasons),
            o.createdAt,
          ],
        );
        if (
          o.state === "filled" &&
          !orders.some((old) => old.id === o.id && old.state === "filled")
        ) {
          await m.query(
            "INSERT INTO paper_executions(tenant_id,order_id,quantity,price) VALUES($1,$2,$3,$4)",
            [tenantId, o.id, o.quantity, o.fillPrice],
          );
          await m.query(
            "INSERT INTO cash_ledger(tenant_id,id,order_id,amount,description) VALUES($1,$2,$3,$4,$5)",
            [
              tenantId,
              randomUUID(),
              o.id,
              new Decimal(o.fillPrice!).mul(o.quantity).neg().toFixed(4),
              "Paper buy execution",
            ],
          );
        }
      }
      for (const a of snapshot.audit.slice(audit.length)) {
        await m.query(
          "INSERT INTO paper_audit(tenant_id,id,at,action,details,hash,previous_hash) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            tenantId,
            a.id,
            a.at,
            a.action,
            JSON.stringify(a.details),
            a.hash,
            a.previousHash,
          ],
        );
      }
      return result;
    });
  }
  async snapshot(tenant: string) {
    const snapshot = await this.engine(tenant, (e) => e.snapshot(tenant));
    const positions = new Map<
      string,
      { instrument: string; quantity: number; cost: string }
    >();
    for (const o of snapshot.orders.filter((o) => o.state === "filled")) {
      const p = positions.get(o.instrument) ?? {
        instrument: o.instrument,
        quantity: 0,
        cost: "0",
      };
      p.quantity += o.quantity;
      p.cost = new Decimal(p.cost)
        .plus(new Decimal(o.fillPrice!).mul(o.quantity))
        .toFixed(4);
      positions.set(o.instrument, p);
    }
    return {
      ...snapshot,
      storage: "PostgreSQL · durable local storage",
      positions: [...positions.values()],
    };
  }
  async createSession() {
    const token = randomBytes(32).toString("hex");
    await this.db.query(
      "INSERT INTO local_sessions(token_hash,tenant_id,expires_at) VALUES($1,'mk-demo',now()+interval '8 hours')",
      [this.hash(token)],
    );
    await this.engine("mk-demo", (e) =>
      e.record("mk-demo", "auth.local_session", {}),
    );
    return token;
  }
  hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
  async session(token: string) {
    const rows = await this.db.query(
      "SELECT tenant_id,role FROM local_sessions WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL",
      [this.hash(token)],
    );
    return rows[0] as { tenant_id: string; role: string } | undefined;
  }
  async revoke(token: string) {
    await this.db.query(
      "UPDATE local_sessions SET revoked_at=now() WHERE token_hash=$1",
      [this.hash(token)],
    );
  }
  async health() {
    const [row] = await this.db.query(
      "SELECT current_setting('server_version') AS version",
    );
    return {
      status: "ok",
      execution: "paper",
      storage: "postgresql",
      databaseVersion: row.version,
      ai: "unavailable",
    };
  }
}
