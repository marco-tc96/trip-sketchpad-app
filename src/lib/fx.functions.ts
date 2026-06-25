import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const cache = new Map<string, { rate: number; at: number }>();
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
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL)
      return { rate: hit.rate, source: "cache" as const };
    try {
      const res = await fetch(
        `https://api.exchangerate.host/convert?from=${data.from}&to=${data.to}`,
        { signal: AbortSignal.timeout(5000) },
      );
      const json = (await res.json()) as { result?: number; info?: { rate?: number } };
      const rate = json.result ?? json.info?.rate;
      if (typeof rate === "number" && rate > 0) {
        cache.set(key, { rate, at: Date.now() });
        return { rate, source: "live" as const };
      }
      throw new Error("no rate");
    } catch {
      return { rate: null as number | null, source: "unavailable" as const };
    }
  });