import { useQuery } from "@tanstack/react-query";
import type { Hub, HubKind } from "@/lib/transport-hubs";

// Map our hub kinds to Nominatim feature filters. Nominatim "amenity" /
// "aeroway" tags cover airports and stations worldwide. "toll" targets
// motorway toll booths/gates (barrier=toll_booth in OSM) — used by the
// car/moto outbound/return journey picker so a road-trip leg's from/to can
// be anchored to a real highway toll booth instead of a whole city.
const KIND_QUERY: Record<HubKind, string> = {
  train: "railway station",
  bus: "bus station",
  ferry: "ferry terminal port",
  toll: "toll booth motorway",
  metro: "metro station subway station",
  tram: "tram stop",
};

type NominatimItem = {
  display_name: string;
  name?: string;
  type?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    country_code?: string;
    aeroway?: string;
  };
  extratags?: { iata?: string; icao?: string };
};

// `countryIso`, when given, is passed through as Nominatim's `countrycodes`
// filter — for train mode specifically we ask the user to pick a country
// FIRST (trains connect cities on a national network, not a single city's
// points), so once a country is chosen the live search should return
// stations from exactly that country rather than a global, unscoped match.
async function searchNominatim(kind: HubKind, query: string, countryIso?: string): Promise<Hub[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "15");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("q", `${q} ${KIND_QUERY[kind]}`);
  if (countryIso) url.searchParams.set("countrycodes", countryIso.toLowerCase());
  const r = await fetch(url.toString(), {
    headers: { "Accept-Language": "it,en" },
  });
  if (!r.ok) return [];
  const data = (await r.json()) as NominatimItem[];
  const out: Hub[] = [];
  const seen = new Set<string>();
  for (const it of data) {
    const name = it.name || it.display_name.split(",")[0];
    if (!name) continue;
    const code = it.extratags?.iata || it.extratags?.icao;
    const city = it.address?.city || it.address?.town || it.address?.village;
    const k = `${code ?? ""}|${name}|${city ?? ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ code, name, city });
  }
  return out;
}

export function useRemoteHubs(kind: HubKind | null, query: string, countryIso?: string) {
  const q = query.trim();
  // 3 characters, not 2: short enough to feel instant, long enough that
  // Nominatim's token-based matching returns something relevant instead of
  // mostly noise (or nothing at all) for a 1-2 letter fragment. The LOCAL
  // hub list callers show alongside this is unaffected — it already matches
  // from the first character since it's a plain in-memory filter.
  return useQuery({
    queryKey: ["remote-hubs", kind, q.toLowerCase(), countryIso ?? ""],
    queryFn: () => (kind ? searchNominatim(kind, q, countryIso) : Promise.resolve([])),
    enabled: !!kind && q.length >= 3,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
  });
}

export function modeToKind(mode: string): HubKind | null {
  if (mode === "train") return "train";
  if (mode === "bus") return "bus";
  if (mode === "ferry") return "ferry";
  // metro/tram previously had no HubKind at all, so useRemoteHubs was always
  // disabled (kind === null) for those two modes — the station combobox
  // showed zero live suggestions no matter what the user typed. Added so a
  // metro/tram leg gets the same "search a real stop" experience as
  // train/bus/ferry.
  if (mode === "metro") return "metro";
  if (mode === "tram") return "tram";
  return null;
}
