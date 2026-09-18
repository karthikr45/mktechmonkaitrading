import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import {
  authorizedSocketUrl,
  decodeFeed,
  feedType,
  normalizeQuote,
  UpstoxFeed,
} from "./feed";
class Socket extends EventEmitter {
  send = vi.fn();
  terminate() {
    this.emit("close");
  }
  close() {
    this.emit("close");
  }
}
const key = "NSE_INDEX|Nifty 50";
const authorize = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({
        data: {
          authorized_redirect_uri:
            "wss://feed.upstox.com/stream?secret=redacted",
        },
      }),
    ),
  );
afterEach(() => vi.useRealTimers());
describe("Upstox V3 market transport", () => {
  it("decodes binary LTPC and retains exchange timestamps", () => {
    const bytes = feedType
      .encode(
        feedType.fromObject({
          type: "live_feed",
          feeds: {
            [key]: { ltpc: { ltp: 25000.15, ltt: "1789730000000", cp: 24900 } },
          },
        }),
      )
      .finish();
    const decoded = decodeFeed(bytes);
    expect(decoded.feeds?.[key].ltpc?.ltt).toBe("1789730000000");
    const quote = normalizeQuote(
      key,
      decoded.feeds![key].ltpc!,
      1,
      1789730001000,
    );
    expect(quote?.price).toBe("25000.15");
    expect(quote?.source).toBe("upstox");
    expect(quote?.timestamp).not.toBe(quote?.receivedAt);
    expect(
      normalizeQuote(key, { ltp: -1, ltt: "1789730000000" }, 1, 1789730001000),
    ).toBeNull();
    expect(
      normalizeQuote(
        key,
        { ltp: 1, ltt: "999999999999999999" },
        1,
        1789730001000,
      ),
    ).toBeNull();
  });
  it("rejects non-Upstox or insecure authorized URLs", () => {
    for (const url of [
      "ws://feed.upstox.com",
      "wss://upstox.com.attacker.test",
      "wss://localhost",
      "wss://user:pass@feed.upstox.com",
    ])
      expect(() => authorizedSocketUrl(url)).toThrow();
    expect(authorizedSocketUrl("wss://feed.upstox.com/path")).toBe(
      "wss://feed.upstox.com/path",
    );
  });
  it("subscribes in binary, suppresses duplicate/older ticks and shares the upstream", async () => {
    const socket = new Socket();
    const create = vi.fn(() => socket as unknown as WebSocket);
    const feed = new UpstoxFeed({ fetch: authorize, socket: create });
    const a = vi.fn(),
      b = vi.fn();
    feed.subscribe(a);
    const unsubscribe = feed.subscribe(b);
    feed.connect("private-token", [key]);
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    socket.emit("open");
    expect(Buffer.isBuffer(socket.send.mock.calls[0][0])).toBe(true);
    expect(JSON.parse(socket.send.mock.calls[0][0].toString()).data).toEqual({
      mode: "ltpc",
      instrumentKeys: [key],
    });
    const tick = {
      feeds: { [key]: { ltpc: { ltp: 25000, ltt: String(Date.now()) } } },
    };
    const bytes = feedType.encode(feedType.fromObject(tick)).finish();
    socket.emit("message", Buffer.from(bytes), true);
    socket.emit("message", Buffer.from(bytes), true);
    expect(a.mock.calls.filter(([e]) => e.event === "tick")).toHaveLength(1);
    expect(b.mock.calls.filter(([e]) => e.event === "tick")).toHaveLength(1);
    expect(JSON.stringify(feed.status())).not.toContain("private-token");
    unsubscribe();
    feed.disconnect();
    expect(feed.status().quotes).toEqual([]);
    expect(feed.status().credentialsConfigured).toBe(false);
  });
  it("stops retrying rejected credentials", async () => {
    const create = vi.fn();
    const request = vi.fn(async () => new Response("", { status: 401 }));
    const feed = new UpstoxFeed({ fetch: request, socket: create });
    feed.connect("expired-token", [key]);
    await vi.waitFor(() =>
      expect(feed.status().state).toBe("authorization-required"),
    );
    expect(create).not.toHaveBeenCalled();
    expect(feed.status().credentialsConfigured).toBe(false);
    feed.disconnect();
  });
  it("reauthorizes and resubscribes after a broken connection", async () => {
    vi.useFakeTimers();
    const sockets: Socket[] = [];
    const request = vi.fn(authorize);
    const feed = new UpstoxFeed({
      fetch: request,
      socket: () => {
        const s = new Socket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    });
    feed.connect("token", [key]);
    await vi.advanceTimersByTimeAsync(1);
    sockets[0].emit("open");
    sockets[0].emit("close");
    expect(feed.status().state).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(1600);
    expect(sockets).toHaveLength(2);
    sockets[1].emit("open");
    expect(sockets[1].send).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
    feed.disconnect();
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not open a socket after disconnect during authorization", async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const create = vi.fn();
    const feed = new UpstoxFeed({ fetch: () => pending, socket: create });
    feed.connect("token", [key]);
    feed.disconnect();
    finish(await authorize());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(create).not.toHaveBeenCalled();
  });
});
