import { expect, it } from "vitest";
import { SSEParser } from "./sse";
it("parses fragmented and coalesced SSE frames", () => {
  const parser = new SSEParser();
  expect(parser.push('event: tick\ndata: {"pri')).toEqual([]);
  expect(parser.push('ce":"12.3"}\n\nevent: heartbeat\ndata: {}\n\n')).toEqual([
    { event: "tick", data: { price: "12.3" } },
    { event: "heartbeat", data: {} },
  ]);
});
it("bounds incomplete frames", () => {
  expect(() => new SSEParser().push("x".repeat(2 * 1024 * 1024 + 1))).toThrow();
});
