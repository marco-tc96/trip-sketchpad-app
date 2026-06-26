import { useQuery } from "@tanstack/react-query";
import type { Hub, HubKind } from "@/lib/transport-hubs";

// Map our hub kinds to Nominatim feature filters. Nominatim "amenity" /
// "aeroway" tags cover airports and stations worldwide.
const KIND_QUERY: Record<HubKind, string> = {
  airport: "aerodrome airport",
  train: "railway station",
  bus: "bus station",
  ferry: "ferry terminal port",
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

async function searchNominatim(kind: HubKind, query: string): Promise<Hub[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "15");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("q", `${q} ${KIND_QUERY[kind]}`);
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

export function useRemoteHubs(kind: HubKind | null, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["remote-hubs", kind, q.toLowerCase()],
    queryFn: () => (kind ? searchNominatim(kind, q) : Promise.resolve([])),
    enabled: !!kind && q.length >= 2,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
  });
}

export function modeToKind(mode: string): HubKind | null {
  if (mode === "plane") return "airport";
  if (mode === "train") return "train";
  if (mode === "bus") return "bus";
  if (mode === "ferry") return "ferry";
  return null;
}