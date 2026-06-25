import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const liveCache = new Map<string, { rate: number; at: number }>();
const avgCache = new Map<string, { rate: number; at: number }>();
const TTL = 6 * 60 * 60 * 1000; // 6h

export const getFxRate = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        from: z.string().length(3).toUpperCase(),
        to: z.string().length(3).toUpperCase(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.from === data.to) return { rate: 1, source: "identity" as const };
    const key = `${data.from}_${data.to}`;
    const hit = liveCache.get(key);
    if (hit && Date.now() - hit.at < TTL)
      return { rate: hit.rate, source: "cache" as const };
    try {
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=${data.from}&symbols=${data.to}`,
        { signal: AbortSignal.timeout(5000) },
      );
      const json = (await res.json()) as { rates?: Record<string, number> };
      const rate = json.rates?.[data.to];
      if (typeof rate === "number" && rate > 0) {
        liveCache.set(key, { rate, at: Date.now() });
        return { rate, source: "live" as const };
      }
      throw new Error("no rate");
    } catch {
      return { rate: null as number | null, source: "unavailable" as const };
    }
  });

/**
 * Average exchange rate over a date range. Uses Frankfurter's free timeseries
 * endpoint which supports historical legacy currencies (HRK, etc).
 * For dates in the future, falls back to the latest live rate.
 */
export const getFxAverage = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        from: z.string().length(3).toUpperCase(),
        to: z.string().length(3).toUpperCase(),
        start: z.string(),
        end: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.from === data.to)
      return { rate: 1, source: "identity" as const, samples: 0 };
    const today = new Date().toISOString().slice(0, 10);
    const start = data.start;
    const end = data.end > today ? today : data.end;
    if (start > today) {
      // Future trip — fall back to live rate.
      const key = `${data.from}_${data.to}_live`;
      const hit = avgCache.get(key);
      if (hit && Date.now() - hit.at < TTL)
        return { rate: hit.rate, source: "cache" as const, samples: 0 };
      try {
        const r = await fetch(
          `https://api.frankfurter.dev/v1/latest?base=${data.from}&symbols=${data.to}`,
          { signal: AbortSignal.timeout(5000) },
        );
        const j = (await r.json()) as { rates?: Record<string, number> };
        const rate = j.rates?.[data.to];
        if (typeof rate === "number" && rate > 0) {
          avgCache.set(key, { rate, at: Date.now() });
          return { rate, source: "live" as const, samples: 0 };
        }
      } catch {}
      return { rate: null, source: "unavailable" as const, samples: 0 };
    }
    const key = `${data.from}_${data.to}_${start}_${end}`;
    const hit = avgCache.get(key);
    if (hit && Date.now() - hit.at < TTL)
      return { rate: hit.rate, source: "cache" as const, samples: 0 };
    try {
      const url = `https://api.frankfurter.dev/v1/${start}..${end}?base=${data.from}&symbols=${data.to}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const j = (await r.json()) as { rates?: Record<string, Record<string, number>> };
      const days = Object.values(j.rates ?? {});
      const vals = days
        .map((d) => d?.[data.to])
        .filter((n): n is number => typeof n === "number" && n > 0);
      if (vals.length > 0) {
        const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
        avgCache.set(key, { rate: avg, at: Date.now() });
        return { rate: avg, source: "historical" as const, samples: vals.length };
      }
      throw new Error("no rates");
    } catch {
      return { rate: null, source: "unavailable" as const, samples: 0 };
    }
  });