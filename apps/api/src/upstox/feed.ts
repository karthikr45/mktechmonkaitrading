import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadSync } from "protobufjs";
import WebSocket from "ws";
import { repositoryRoot } from "../local-config";

export const feedType = loadSync(
  resolve(repositoryRoot(), "apps/api/src/upstox/MarketDataFeed.proto"),
).lookupType("com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse");
type LTPC = { ltp?: number; ltt?: string; cp?: number };
type WireFeed = {
  type?: string;
  currentTs?: string;
  marketInfo?: { segmentStatus?: Record<string, string> };
  feeds?: Record<string, { ltpc?: LTPC }>;
};
export interface Quote {
  instrument: string;
  price: string;
  previousClose: string | null;
  timestamp: string;
  receivedAt: string;
  source: "upstox";
  sequence: number;
}
export type FeedEvent = { event: "status" | "tick"; data: unknown };
export function decodeFeed(bytes: Uint8Array): WireFeed {
  return feedType.toObject(feedType.decode(bytes), {
    longs: String,
    enums: String,
  }) as WireFeed;
}
export function normalizeQuote(
  instrument: string,
  ltpc: LTPC,
  sequence: number,
  now: number,
): Quote | null {
  const timestamp = Number(ltpc.ltt);
  if (
    !Number.isFinite(ltpc.ltp) ||
    (ltpc.ltp ?? 0) <= 0 ||
    !Number.isSafeInteger(timestamp) ||
    timestamp <= 0 ||
    timestamp > now + 60000
  )
    return null;
  return {
    instrument,
    price: String(ltpc.ltp),
    previousClose: Number.isFinite(ltpc.cp) ? String(ltpc.cp) : null,
    timestamp: new Date(timestamp).toISOString(),
    receivedAt: new Date(now).toISOString(),
    source: "upstox",
    sequence,
  };
}
export function authorizedSocketUrl(value: unknown) {
  if (typeof value !== "string")
    throw new Error("Invalid authorization response");
  const url = new URL(value);
  if (
    url.protocol !== "wss:" ||
    !url.hostname.endsWith(".upstox.com") ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Invalid Upstox socket address");
  return url.href;
}

/** One upstream socket per local workspace; credentials never leave this class. */
export class UpstoxFeed {
  private accessToken = "";
  private keys: string[] = [];
  private socket?: WebSocket;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setInterval>;
  private generation = 0;
  private attempts = 0;
  private sequence = 0;
  private lastTransport = 0;
  private listeners = new Set<(event: FeedEvent) => void>();
  private quotes = new Map<string, Quote>();
  private state = "disconnected";
  private message = "Connect Upstox to receive live quotes.";
  private marketStatus: Record<string, string> = {};
  private epoch = randomUUID();
  constructor(
    private dependencies = {
      fetch: globalThis.fetch,
      socket: (url: string) =>
        new WebSocket(url, {
          handshakeTimeout: 10000,
          maxPayload: 1024 * 1024,
        }),
    },
  ) {}
  async researchRequest(
    path: string,
    fallbackToken?: string,
  ): Promise<unknown> {
    if (!/^\/v2\/(news\?|fundamentals\/[A-Z0-9]{12}\/key-ratios$)/.test(path))
      throw new Error("Unsupported research path");
    const credential = this.accessToken || fallbackToken;
    if (!credential) throw new Error("Upstox token is not configured");
    const response = await this.dependencies.fetch(
      `https://api.upstox.com${path}`,
      {
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(12000),
      },
    );
    const { boundedBody } = await import("../news-risk/providers");
    return JSON.parse(await boundedBody(response));
  }
  status() {
    return {
      state: this.state,
      message: this.message,
      source: "upstox",
      epoch: this.epoch,
      instruments: this.keys,
      marketStatus: this.marketStatus,
      quotes: [...this.quotes.values()],
      executionMode: "paper",
      credentialsConfigured: !!this.accessToken,
    };
  }
  subscribe(listener: (event: FeedEvent) => void) {
    this.listeners.add(listener);
    listener({ event: "status", data: this.status() });
    return () => {
      this.listeners.delete(listener);
    };
  }
  private emit(event: FeedEvent) {
    for (const listener of this.listeners) listener(event);
  }
  private setStatus(state: string, message: string) {
    this.state = state;
    this.message = message;
    this.emit({ event: "status", data: this.status() });
  }
  connect(accessToken: string, keys: string[]) {
    this.disconnect();
    this.accessToken = accessToken;
    this.keys = [...new Set(keys)];
    this.epoch = randomUUID();
    this.attempts = 0;
    void this.open(this.generation);
  }
  disconnect() {
    this.generation++;
    clearTimeout(this.retry);
    clearInterval(this.watchdog);
    this.socket?.terminate();
    this.socket = undefined;
    this.accessToken = "";
    this.keys = [];
    this.quotes.clear();
    this.marketStatus = {};
    this.setStatus(
      "disconnected",
      "Upstox disconnected. Stored session credentials cleared.",
    );
  }
  private async open(generation: number) {
    if (generation !== this.generation) return;
    this.setStatus("connecting", "Authorizing Upstox market feed…");
    try {
      const response = await this.dependencies.fetch(
        "https://api.upstox.com/v3/feed/market-data-feed/authorize",
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
          redirect: "error",
        },
      );
      if (generation !== this.generation) return;
      if ([401, 403].includes(response.status)) {
        this.accessToken = "";
        this.setStatus(
          "authorization-required",
          "Upstox rejected the token or market-data access. Supply a valid token and reconnect.",
        );
        return;
      }
      if (!response.ok) throw new Error("Authorization unavailable");
      const body = (await response.json()) as {
        data?: { authorized_redirect_uri?: string };
      };
      if (generation !== this.generation) return;
      const socket = this.dependencies.socket(
        authorizedSocketUrl(body.data?.authorized_redirect_uri),
      );
      this.socket = socket;
      const active = () =>
        generation === this.generation && this.socket === socket;
      socket.on("open", () => {
        if (!active()) return;
        this.lastTransport = Date.now();
        socket.send(
          Buffer.from(
            JSON.stringify({
              guid: randomUUID(),
              method: "sub",
              data: { mode: "ltpc", instrumentKeys: this.keys },
            }),
          ),
        );
        this.setStatus(
          "connected",
          "Upstox connected; awaiting subscribed quotes.",
        );
        this.watchdog = setInterval(() => {
          if (active() && Date.now() - this.lastTransport > 45000)
            socket.terminate();
        }, 5000);
      });
      socket.on("ping", () => {
        if (active()) this.lastTransport = Date.now();
      });
      socket.on("message", (data, binary) => {
        if (!active()) return;
        this.lastTransport = Date.now();
        if (!binary) {
          this.setStatus(
            "feed-error",
            "Unexpected Upstox response. Reconnect or check subscription access.",
          );
          socket.close();
          return;
        }
        try {
          const bytes = Array.isArray(data)
            ? Buffer.concat(data)
            : data instanceof ArrayBuffer
              ? Buffer.from(data)
              : data;
          const decoded = decodeFeed(bytes);
          this.attempts = 0;
          if (decoded.marketInfo?.segmentStatus) {
            this.marketStatus = decoded.marketInfo.segmentStatus;
            this.setStatus("connected", "Upstox market status received.");
          }
          for (const [instrument, feed] of Object.entries(
            decoded.feeds ?? {},
          )) {
            if (!this.keys.includes(instrument) || !feed.ltpc) continue;
            const quote = normalizeQuote(
              instrument,
              feed.ltpc,
              this.sequence + 1,
              Date.now(),
            );
            if (!quote) continue;
            const previous = this.quotes.get(instrument);
            if (
              previous &&
              (quote.timestamp < previous.timestamp ||
                (quote.timestamp === previous.timestamp &&
                  quote.price === previous.price &&
                  quote.previousClose === previous.previousClose))
            )
              continue;
            this.sequence++;
            this.quotes.set(instrument, quote);
            this.emit({ event: "tick", data: quote });
          }
        } catch {
          this.setStatus(
            "feed-error",
            "Unable to decode Upstox feed. Reconnecting…",
          );
          socket.close();
        }
      });
      socket.on("error", () => {
        if (active()) socket.terminate();
      });
      socket.on("close", () => {
        if (!active()) return;
        clearInterval(this.watchdog);
        this.socket = undefined;
        this.schedule(generation);
      });
    } catch {
      if (generation === this.generation) this.schedule(generation);
    }
  }
  private schedule(generation: number) {
    if (++this.attempts > 8) {
      this.setStatus(
        "failed",
        "Upstox reconnect limit reached. Check access and reconnect manually.",
      );
      return;
    }
    const delay =
      Math.min(30000, 1000 * 2 ** (this.attempts - 1)) +
      Math.floor(Math.random() * 500);
    this.setStatus(
      "reconnecting",
      "Upstox connection interrupted; reconnecting with a fresh subscription. Quotes may be stale.",
    );
    this.retry = setTimeout(() => void this.open(generation), delay);
  }
}
