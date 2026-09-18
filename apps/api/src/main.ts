import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  Module,
  Controller,
  Get,
  Header,
  Post,
  Body,
  Param,
  Req,
  Res,
  UnauthorizedException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  ApiBearerAuth,
  ApiBody,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sse } from "./market-stream";
import { UpstoxFeed } from "./upstox/feed";
import { LocalStore } from "./persistence";
import { loadLocalEnvironment } from "./local-config";
import { Environment } from "../../../packages/config/src/index";
import { Strategy } from "../../../packages/strategy-dsl/src/index";
loadLocalEnvironment();
const store = new LocalStore();
const upstoxFeeds = new Map<string, UpstoxFeed>();
function upstox(tenantId: string) {
  let feed = upstoxFeeds.get(tenantId);
  if (!feed) {
    feed = new UpstoxFeed();
    upstoxFeeds.set(tenantId, feed);
  }
  return feed;
}
function token(req: Request) {
  return req.headers.authorization?.replace(/^Bearer /, "") ?? "";
}
async function tenant(req: Request) {
  const s = await store.session(token(req));
  if (!s)
    throw new UnauthorizedException(
      "Local session expired; reload to reconnect",
    );
  return s.tenant_id;
}
async function validated<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedException || e instanceof BadRequestException)
      throw e;
    if (e instanceof z.ZodError)
      throw new BadRequestException("Invalid request fields");
    if (
      e instanceof Error &&
      /Idempotency|Order |Instrument|Short selling/.test(e.message)
    )
      throw new BadRequestException(e.message);
    throw new ServiceUnavailableException(
      "Operation could not complete. Check local service health.",
    );
  }
}
@ApiBearerAuth()
@Controller("v1")
class Api {
  @Get("health") async health() {
    try {
      return await store.health();
    } catch {
      throw new ServiceUnavailableException("PostgreSQL unavailable");
    }
  }
  @Post("demo-session") async session(@Req() req: Request) {
    if (
      req.headers.origin &&
      ![
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        process.env.WEB_ORIGIN ?? "http://127.0.0.1:3200",
      ].includes(req.headers.origin)
    )
      throw new UnauthorizedException();
    return {
      token: await store.createSession(),
      expiresIn: 28800,
      role: "local-owner",
      warning:
        "Local paper workspace. Production identity and MFA are not enabled.",
    };
  }
  @Post("logout") async logout(@Req() req: Request) {
    const t = await tenant(req);
    upstoxFeeds.get(t)?.disconnect();
    await store.revoke(token(req));
    return { revoked: true };
  }
  @Get("brokers/upstox") async upstoxStatus(@Req() req: Request) {
    return upstox(await tenant(req)).status();
  }
  @Post("brokers/upstox/connect") async connectUpstox(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return validated(async () => {
      const t = await tenant(req);
      const input = z
        .object({
          accessToken: z
            .string()
            .trim()
            .min(10)
            .max(8192)
            .regex(/^[^\s]+$/)
            .optional(),
          instrumentKeys: z
            .array(
              z
                .string()
                .min(3)
                .max(120)
                .regex(/^[A-Z_]+\|[^|\r\n]+$/),
            )
            .min(1)
            .max(50),
        })
        .strict()
        .parse(body);
      const accessToken =
        input.accessToken ??
        (t === "mk-demo" ? process.env.UPSTOX_ACCESS_TOKEN : undefined);
      if (!accessToken)
        throw new BadRequestException(
          "Enter an Upstox access token or configure UPSTOX_ACCESS_TOKEN in your local .env.",
        );
      await store.scoped(t, (m) =>
        store.record(m, t, "broker.connection.requested", {
          broker: "upstox",
          instruments: input.instrumentKeys,
        }),
      );
      upstox(t).connect(accessToken, input.instrumentKeys);
      return upstox(t).status();
    });
  }
  @Post("brokers/upstox/disconnect") async disconnectUpstox(
    @Req() req: Request,
  ) {
    const t = await tenant(req);
    upstox(t).disconnect();
    await store.scoped(t, (m) =>
      store.record(m, t, "broker.disconnected", { broker: "upstox" }),
    );
    return upstox(t).status();
  }
  private streams = new Map<string, number>();
  @Get("market/stream") async marketStream(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const t = await tenant(req);
    if ((this.streams.get(t) ?? 0) >= 5) {
      res
        .status(429)
        .json({ message: "Maximum five market streams per workspace" });
      return;
    }
    this.streams.set(t, (this.streams.get(t) ?? 0) + 1);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let closed = false;
    let checking = false;
    let count = 0;
    const resources: {
      timer?: ReturnType<typeof setInterval>;
      unsubscribe?: () => void;
    } = {};
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(resources.timer);
      resources.unsubscribe?.();
      const count = (this.streams.get(t) ?? 1) - 1;
      if (count) this.streams.set(t, count);
      else this.streams.delete(t);
    };
    const write = (event: string, data: unknown) => {
      if (closed) return;
      if (!res.write(sse(event, data))) {
        cleanup();
        res.end();
      }
    };
    res.once("close", cleanup);
    resources.unsubscribe = upstox(t).subscribe(({ event, data }) =>
      write(event, data),
    );
    if (closed) {
      resources.unsubscribe();
      return;
    }
    resources.timer = setInterval(async () => {
      if (checking || closed) return;
      checking = true;
      try {
        if (count++ % 5 === 0 && !(await store.session(token(req)))) {
          write("session-expired", { message: "Reload to reconnect" });
          cleanup();
          res.end();
          return;
        }
        write("heartbeat", { timestamp: new Date().toISOString() });
      } catch {
        cleanup();
        res.end();
      } finally {
        checking = false;
      }
    }, 1000);
  }
  @Get("dashboard") async dashboard(@Req() req: Request) {
    return store.snapshot(await tenant(req));
  }
  @Post("demo-replay") async replay(@Req() req: Request) {
    const t = await tenant(req);
    return store.engine(t, (e) => e.runReplay(t));
  }
  @ApiBody({
    schema: {
      type: "object",
      required: [
        "instrument",
        "side",
        "quantity",
        "limitPrice",
        "idempotencyKey",
      ],
      properties: {
        instrument: { type: "string", enum: ["DEMO-NIFTY"] },
        side: { type: "string", enum: ["BUY"] },
        quantity: { type: "integer" },
        limitPrice: { type: "string" },
        idempotencyKey: { type: "string" },
      },
    },
  })
  @Post("orders")
  async draft(@Req() req: Request, @Body() body: unknown) {
    return validated(async () => {
      const t = await tenant(req);
      return store.engine(t, (e) => e.draft(t, body));
    });
  }
  @Post("orders/:id/approve") async approve(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    return validated(async () => {
      const t = await tenant(req);
      return store.engine(t, (e) => e.approve(t, id));
    });
  }
  @Post("kill-switch") async kill(@Req() req: Request, @Body() body: unknown) {
    return validated(async () => {
      const t = await tenant(req);
      const data = z.object({ enabled: z.boolean() }).strict().parse(body);
      return store.engine(t, (e) => e.kill(t, data.enabled));
    });
  }
  @Get("strategies") async strategies(@Req() req: Request) {
    const t = await tenant(req);
    return store.scoped(t, (m) =>
      m.query(
        "SELECT id,version,definition,created_at FROM saved_strategies ORDER BY created_at DESC",
      ),
    );
  }
  @Post("strategies") async saveStrategy(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return validated(async () => {
      const t = await tenant(req);
      const strategy = Strategy.parse(body);
      const id = randomUUID();
      await store.scoped(t, async (m) => {
        await m.query(
          "INSERT INTO saved_strategies(tenant_id,id,version,definition) VALUES($1,$2,1,$3)",
          [t, id, JSON.stringify(strategy)],
        );
        await store.record(m, t, "strategy.saved", { id, version: 1 });
      });
      return { id, version: 1, definition: strategy };
    });
  }
  @Get("journal") async journal(@Req() req: Request) {
    const t = await tenant(req);
    return store.scoped(t, (m) =>
      m.query(
        "SELECT id,order_id,note,tags,created_at FROM journal_entries ORDER BY created_at DESC LIMIT 200",
      ),
    );
  }
  @Post("journal") async saveJournal(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    return validated(async () => {
      const t = await tenant(req);
      const data = z
        .object({
          note: z.string().trim().min(1).max(10000),
          orderId: z.string().uuid().optional(),
          tags: z.array(z.string().max(30)).max(20).default([]),
        })
        .strict()
        .parse(body);
      const id = randomUUID();
      await store.scoped(t, async (m) => {
        await m.query(
          "INSERT INTO journal_entries(tenant_id,id,order_id,note,tags) VALUES($1,$2,$3,$4,$5)",
          [t, id, data.orderId ?? null, data.note, JSON.stringify(data.tags)],
        );
        await store.record(m, t, "journal.created", { id });
      });
      return { id };
    });
  }
  @Post("research/:kind") async research(
    @Req() req: Request,
    @Param("kind") kind: string,
    @Body() body: unknown,
  ) {
    return validated(async () => {
      const t = await tenant(req);
      const routes: Record<string, string> = {
        backtests: "backtests",
        indicators: "indicators",
        options: "options/price",
        payoff: "options/payoff",
      };
      if (!routes[kind])
        throw new BadRequestException("Unsupported research operation");
      const response = await fetch(
        `http://127.0.0.1:${process.env.ANALYTICS_PORT ?? 8200}/v1/${routes[kind]}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!response.ok) throw new BadRequestException("Invalid research input");
      const result = await response.json();
      const id = randomUUID();
      await store.scoped(t, async (m) => {
        await m.query(
          "INSERT INTO research_runs(tenant_id,id,kind,request,result) VALUES($1,$2,$3,$4,$5)",
          [t, id, kind, JSON.stringify(body), JSON.stringify(result)],
        );
        await store.record(m, t, "research.completed", { id, kind });
      });
      return { ...result, runId: id };
    });
  }
  @Get("research") async researchHistory(@Req() req: Request) {
    const t = await tenant(req);
    return store.scoped(t, (m) =>
      m.query(
        "SELECT id,kind,result,created_at FROM research_runs ORDER BY created_at DESC LIMIT 50",
      ),
    );
  }
  @Get("operations") async operations(@Req() req: Request) {
    await tenant(req);
    let analytics = "unavailable";
    try {
      const r = await fetch(
        `http://127.0.0.1:${process.env.ANALYTICS_PORT ?? 8200}/health`,
        { signal: AbortSignal.timeout(2000) },
      );
      if (r.ok) analytics = "configured";
    } catch {}
    return {
      database: await store.health(),
      analytics,
      ai: "unavailable",
      brokers: "paper only",
      extensions: "pgvector and TimescaleDB unavailable on this local server",
    };
  }
  @Header("Content-Type", "text/plain; version=0.0.4")
  @Get("metrics")
  metrics() {
    return "mk_paper_mode 1\nmk_postgres_storage 1\n";
  }
}
@Module({ controllers: [Api] })
class AppModule {}
async function main() {
  Environment.parse(process.env);
  await store.init();
  const app = await NestFactory.create(AppModule);
  const requests = new Map<string, { count: number; reset: number }>();
  app.use((req: Request, res: Response, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    const key = req.ip ?? "loopback";
    const now = Date.now();
    const budget = requests.get(key);
    if (!budget || budget.reset <= now)
      requests.set(key, { count: 1, reset: now + 60000 });
    else if (++budget.count > 180) {
      res.status(429).json({ message: "Local API request limit reached" });
      return;
    }
    next();
  });
  const config = new DocumentBuilder()
    .setTitle("MKTechMonk Local PostgreSQL API")
    .setVersion("1")
    .addBearerAuth()
    .build();
  SwaggerModule.setup(
    "api-docs",
    app,
    SwaggerModule.createDocument(app, config),
  );
  await app.listen(
    Number(process.env.PORT ?? process.env.API_PORT ?? 4200),
    "127.0.0.1",
  );
  const shutdown = async () => {
    for (const feed of upstoxFeeds.values()) feed.disconnect();
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}
main().catch(() => {
  console.error("API startup failed. Verify .env and run pnpm db:migrate.");
  process.exitCode = 1;
});
