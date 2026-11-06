"use client";
import { useState } from "react";
export type ChartBar = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema20: number | null;
  ema50: number | null;
  rsi: number | null;
};
export default function PriceChart({
  frames,
  symbol,
  streaming = false,
}: {
  frames: { frame: string; chart?: ChartBar[] }[];
  symbol: string;
  streaming?: boolean;
}) {
  const [frame, setFrame] = useState(frames[0]?.frame ?? "5m"),
    [hover, setHover] = useState<number>();
  const bars = frames.find((f) => f.frame === frame)?.chart ?? [];
  const selected = bars[hover ?? bars.length - 1];
  const prices = bars.flatMap((b) => [
    b.low,
    b.high,
    ...[b.ema20, b.ema50].filter((n): n is number => n !== null),
  ]);
  const low = Math.min(...prices),
    high = Math.max(...prices),
    span = high - low || high * 0.01 || 1;
  const min = low - span * 0.08,
    max = high + span * 0.08;
  const x = (i: number) => 60 + ((i + 0.5) * 820) / Math.max(bars.length, 1);
  const y = (p: number) => 30 + ((max - p) / (max - min)) * 300;
  const width = Math.max(
    1,
    Math.min(8, (820 / Math.max(bars.length, 1)) * 0.65),
  );
  const maxVolume = Math.max(1, ...bars.map((b) => b.volume));
  const line = (key: "ema20" | "ema50" | "rsi", scale: (n: number) => number) =>
    bars
      .map((b, i) => (b[key] === null ? null : `${x(i)},${scale(b[key]!)}`))
      .filter(Boolean)
      .join(" ");
  const stamp = (s: string) =>
    new Date(s).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <section aria-label={`${symbol} price chart`}>
      <h3>
        {symbol} ·{" "}
        {streaming
          ? "Streaming provider candles and volume"
          : "Candlesticks, EMA, volume and RSI"}
      </h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {frames.map((f) => (
          <button
            key={f.frame}
            aria-pressed={frame === f.frame}
            onClick={() => {
              setFrame(f.frame);
              setHover(undefined);
            }}
          >
            {f.frame}
          </button>
        ))}
      </div>
      <p>
        {streaming
          ? "Provider one-minute candles received over the live feed. The current interval may change. Only received bars are shown; missed intervals are not filled. Indicators require the separate historical analysis."
          : "Completed provider candles · snapshot, not a live tick chart. Hover or focus a candle for its values. EMA20: yellow · EMA50: blue."}
      </p>
      {!bars.length ? (
        <p>No verified candles for this timeframe.</p>
      ) : (
        <>
          <p aria-live="polite">
            {selected &&
              `${stamp(selected.time)} IST · O ${selected.open.toFixed(2)} · H ${selected.high.toFixed(2)} · L ${selected.low.toFixed(2)} · C ${selected.close.toFixed(2)} · Volume ${selected.volume.toLocaleString("en-IN")}${streaming ? "" : ` · RSI ${selected.rsi?.toFixed(2) ?? "Unavailable"}`}`}
          </p>
          <div style={{ overflowX: "auto" }}>
            <svg
              viewBox={streaming ? "0 0 960 460" : "0 0 960 560"}
              style={{
                width: "100%",
                minWidth: 640,
                background: "var(--bg)",
                borderRadius: 8,
              }}
              role="img"
              aria-label={`${symbol} ${frame} ${streaming ? "provider candlesticks and volume" : "candlesticks with EMA20, EMA50, volume and RSI"}. ${bars.length} ${streaming ? "received provider" : "completed"} candles.`}
            >
              {[0, 1, 2, 3, 4].map((i) => {
                const value = max - ((max - min) * i) / 4;
                return (
                  <g key={i}>
                    <line
                      x1="60"
                      x2="880"
                      y1={y(value)}
                      y2={y(value)}
                      stroke="var(--line)"
                    />
                    <text
                      x="886"
                      y={y(value) + 4}
                      fill="currentColor"
                      fontSize="11"
                    >
                      {value.toFixed(2)}
                    </text>
                  </g>
                );
              })}
              {bars.map((b, i) => (
                <g
                  key={b.time}
                  tabIndex={0}
                  onFocus={() => setHover(i)}
                  onMouseEnter={() => setHover(i)}
                  aria-label={`${stamp(b.time)} open ${b.open} high ${b.high} low ${b.low} close ${b.close}`}
                >
                  <title>
                    {stamp(b.time)} IST: O {b.open} H {b.high} L {b.low} C{" "}
                    {b.close}
                  </title>
                  <rect
                    x={x(i) - width}
                    y="30"
                    width={width * 2}
                    height="300"
                    fill="transparent"
                  />
                  <line
                    x1={x(i)}
                    x2={x(i)}
                    y1={y(b.high)}
                    y2={y(b.low)}
                    stroke={b.close >= b.open ? "#36c99b" : "#ef7272"}
                  />
                  <rect
                    x={x(i) - width / 2}
                    width={width}
                    y={Math.min(y(b.open), y(b.close))}
                    height={Math.max(1, Math.abs(y(b.open) - y(b.close)))}
                    fill={b.close >= b.open ? "#36c99b" : "#ef7272"}
                  />
                  <rect
                    x={x(i) - width / 2}
                    width={width}
                    y={410 - (b.volume / maxVolume) * 55}
                    height={(b.volume / maxVolume) * 55}
                    fill={b.close >= b.open ? "#36c99b" : "#ef7272"}
                    opacity=".6"
                  />
                </g>
              ))}
              <polyline
                points={line("ema20", y)}
                fill="none"
                stroke="#e8bf58"
                strokeWidth="1.5"
                pointerEvents="none"
              />
              <polyline
                points={line("ema50", y)}
                fill="none"
                stroke="#68b6ff"
                strokeWidth="1.5"
                pointerEvents="none"
              />
              <text x="8" y="370" fill="currentColor" fontSize="11">
                VOL
              </text>
              {!streaming && (
                <>
                  <text x="8" y="460" fill="currentColor" fontSize="11">
                    RSI14
                  </text>
                  {[30, 50, 70].map((v) => (
                    <g key={v}>
                      <line
                        x1="60"
                        x2="880"
                        y1={525 - v * 0.85}
                        y2={525 - v * 0.85}
                        stroke="var(--line)"
                        strokeDasharray="4 4"
                      />
                      <text
                        x="886"
                        y={529 - v * 0.85}
                        fill="currentColor"
                        fontSize="11"
                      >
                        {v}
                      </text>
                    </g>
                  ))}
                  <polyline
                    points={line("rsi", (v) => 525 - v * 0.85)}
                    fill="none"
                    stroke="#c5a1ff"
                    strokeWidth="1.5"
                  />
                </>
              )}
              {[
                ...new Set([
                  0,
                  Math.floor((bars.length - 1) / 2),
                  bars.length - 1,
                ]),
              ].map((i, j) => (
                <text
                  key={j}
                  x={x(i)}
                  y={streaming ? 448 : 548}
                  textAnchor={j === 0 ? "start" : j === 2 ? "end" : "middle"}
                  fill="currentColor"
                  fontSize="10"
                >
                  {stamp(bars[i].time)}
                </text>
              ))}
            </svg>
          </div>
        </>
      )}
    </section>
  );
}
