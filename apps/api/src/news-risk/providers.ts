import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { Article, SettingsValue } from "./contracts";
export function safeLink(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Unsafe article URL");
  return url.href;
}
export function articleId(url: string) {
  const u = new URL(safeLink(url));
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith("utm_")) u.searchParams.delete(key);
  u.searchParams.sort();
  return createHash("sha256").update(u.href).digest("hex");
}
export async function boundedBody(response: Response, limit = 2 * 1024 * 1024) {
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Provider access denied or token expired"
        : "Provider request failed",
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
const newsResponse = z.object({
  status: z.literal("success"),
  data: z.record(
    z.string(),
    z.array(
      z.object({
        heading: z.string().max(2000),
        summary: z.string().max(20000),
        article_link: z.string(),
        published_time: z.number().int().positive(),
      }),
    ),
  ),
  metadata: z.object({
    page: z.object({ total_pages: z.number().int().nonnegative() }),
  }),
});
export function parseNews(body: unknown, keys: string[], now = Date.now()) {
  const parsed = newsResponse.parse(body);
  const items = new Map<string, Article>();
  for (const [key, rows] of Object.entries(parsed.data)) {
    if (!keys.includes(key)) continue;
    for (const row of rows) {
      if (row.published_time > now + 60000)
        throw new Error("Future publication time");
      const url = safeLink(row.article_link),
        id = articleId(url);
      const old = items.get(id);
      items.set(id, {
        id,
        title: row.heading,
        summary: row.summary,
        url,
        publishedAt: new Date(row.published_time).toISOString(),
        source: "Upstox News",
        instruments: [...new Set([...(old?.instruments ?? []), key])],
      });
    }
  }
  return {
    items: [...items.values()],
    pages: parsed.metadata.page.total_pages,
  };
}
export async function getUpstoxNews(
  request: (path: string) => Promise<unknown>,
  keys: string[],
) {
  const items: Article[] = [];
  let totalPages = 1;
  for (let page = 1; page <= Math.min(totalPages, 3); page++) {
    const params = new URLSearchParams({
      category: "instrument_keys",
      instrument_keys: keys.join(","),
      page_number: String(page),
      page_size: "100",
    });
    const result = parseNews(await request(`/v2/news?${params}`), keys);
    items.push(...result.items);
    totalPages = result.pages;
  }
  return { items, truncated: totalPages > 3 };
}
export const RatioResponse = z.object({
  status: z.literal("success"),
  data: z
    .array(
      z.object({
        name: z.string().max(100),
        company_value: z.string().max(100),
        sector_value: z.string().max(100),
      }),
    )
    .max(100),
});
export function parseRss(
  xml: string,
  source: string,
  watchlist: SettingsValue["watchlist"],
): Article[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Unsafe XML");
  const parsed = new XMLParser({
    processEntities: false,
    ignoreAttributes: true,
  }).parse(xml);
  if (!parsed.rss?.channel) throw new Error("Expected RSS channel");
  const rows = parsed.rss.channel.item
    ? Array.isArray(parsed.rss.channel.item)
      ? parsed.rss.channel.item
      : [parsed.rss.channel.item]
    : [];
  return rows.slice(0, 300).flatMap((row: Record<string, unknown>) => {
    if (typeof row.title !== "string" || typeof row.link !== "string")
      return [];
    const title = row.title.replace(/<[^>]*>/g, "").slice(0, 2000);
    const summary = String(row.description ?? "")
      .replace(/<[^>]*>/g, "")
      .slice(0, 4000);
    const text = `${title} ${summary}`.toLocaleLowerCase();
    const instruments = watchlist
      .filter((w) =>
        [w.name, ...w.aliases].some((alias) =>
          text.includes(alias.toLocaleLowerCase()),
        ),
      )
      .map((w) => w.key);
    const timestamp = Date.parse(String(row.pubDate ?? ""));
    try {
      const url = safeLink(row.link);
      return [
        {
          id: articleId(url),
          title,
          summary,
          url,
          publishedAt:
            Number.isFinite(timestamp) && timestamp <= Date.now() + 60000
              ? new Date(timestamp).toISOString()
              : null,
          source,
          instruments,
        },
      ];
    } catch {
      return [];
    }
  });
}
export function rssSources() {
  const sources = (
    process.env.NEWS_RSS_URLS ??
    "https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml,https://www.moneycontrol.com/rss/business.xml"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return sources.slice(0, 5).map((value) => {
    const u = new URL(safeLink(value));
    if (
      ![
        "www.nseindia.com",
        "nsearchives.nseindia.com",
        "www.moneycontrol.com",
        "www.bseindia.com",
      ].includes(u.hostname) ||
      (u.port && u.port !== "443")
    )
      throw new Error("RSS host not allowed");
    return { url: u.href, name: u.hostname };
  });
}

export function rssFreshness(items: Article[], now = Date.now()) {
  const latest = items
    .map((a) => a.publishedAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  return {
    latest: latest ?? null,
    stale: !latest || now - Date.parse(latest) > 72 * 60 * 60 * 1000,
  };
}
