import type { Article } from "./contracts";
import type { Quote } from "../global-markets/service";

// Prices are observations from the provider, never model-generated market facts.
export function marketEvidence(quotes: Quote[], now = Date.now()): Article[] {
  return quotes
    .filter((q) => {
      if (
        q.state !== "available" ||
        !q.asOf ||
        !Number.isFinite(q.price) ||
        !Number.isFinite(q.changePct)
      )
        return false;
      const age = now - Date.parse(q.asOf);
      return (
        Number.isFinite(age) &&
        age >= -60000 &&
        age <= (q.session?.startsWith("Open") ? 20 * 60000 : 96 * 3600000)
      );
    })
    .map((q) => ({
      id: `market:${q.id}:${q.asOf}`,
      title: `${q.name} · ${q.group} · ${q.session}`,
      summary: `Provider observation: ${q.name}. Price ${q.price} ${q.currency ?? "(unit not supplied)"}. Change ${q.changePct?.toFixed(4)}% versus provider previous close. Observation time ${q.asOf}. Session: ${q.session}. Data latency is not independently verified. This is not a forecast.`,
      url: "https://twelvedata.com/docs",
      publishedAt: q.asOf!,
      source: "Twelve Data quote snapshot",
      instruments: [q.id],
    }));
}
