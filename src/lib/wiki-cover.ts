// Lightweight Wikipedia thumbnail lookup. Returns an https image URL or null.
// CORS is enabled on Wikipedia REST API, safe to call directly from the client.

const memory = new Map<string, string | null>();

// Reject Wikipedia thumbnails that are obviously flags, maps, coats of arms or
// other non-photographic page imagery — we only want photos for trip covers.
const BAD_IMAGE = /flag_of|flag-|\/flag|map_of|locator|location_map|orthographic|coat_of_arms|emblem|seal_of|globe/i;

function localePrefix(): string {
  if (typeof navigator === "undefined") return "en";
  const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
  return ["it", "en", "fr", "de", "es", "pt", "ja", "ko", "zh"].includes(lang) ? lang : "en";
}

async function lookupOnce(lang: string, query: string): Promise<string | null> {
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      query,
    )}?redirect=true`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      originalimage?: { source: string };
      thumbnail?: { source: string };
    };
    const candidate = j.originalimage?.source ?? j.thumbnail?.source ?? null;
    if (!candidate) return null;
    if (BAD_IMAGE.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

export async function fetchCityCover(query: string): Promise<string | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;
  if (memory.has(key)) return memory.get(key) ?? null;

  const lang = localePrefix();
  // Try local Wikipedia first, then English fallback.
  let url = await lookupOnce(lang, query);
  if (!url && lang !== "en") url = await lookupOnce("en", query);
  memory.set(key, url);
  return url;
}