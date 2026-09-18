import type { Tick } from "../../contracts/src/index";
export function replay(seed = 42, count = 120): Tick[] {
  let state = seed;
  let price = 2250000;
  return Array.from({ length: count }, (_, i) => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    price += (state % 1801) - 850;
    return {
      instrument: "DEMO-NIFTY",
      price: (price / 100).toFixed(2),
      timestamp: new Date(Date.UTC(2026, 0, 5, 4, 0, i)).toISOString(),
      sequence: i + 1,
      source: "synthetic",
    };
  });
}
export class FeedCursor {
  private last = 0;
  accept(t: Tick) {
    if (t.sequence <= this.last) return { accepted: false, gap: false };
    const gap = this.last > 0 && t.sequence !== this.last + 1;
    this.last = t.sequence;
    return { accepted: true, gap };
  }
}
