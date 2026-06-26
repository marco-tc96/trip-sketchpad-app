import { useEffect, useState } from "react";
import type { Hub } from "@/lib/transport-hubs";

type Airport = {
  name: string;
  iata_code?: string;
  gps_code?: string;
  iso_country?: string;
  municipality?: string;
  type?: string;
  scheduled_service?: string;
};

let _cache: Airport[] | null = null;
let _loading: Promise<Airport[]> | null = null;

async function loadAirports(): Promise<Airport[]> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = import("airports-json").then((m) => {
    const mod = (m as unknown as { airports?: Airport[]; default?: { airports?: Airport[] } });
    _cache = mod.airports ?? mod.default?.airports ?? [];
    return _cache;
  });
  return _loading;
}

function toHub(a: Airport): Hub {
  const code = a.iata_code || a.gps_code || undefined;
  return {
    code: code && code.length <= 4 ? code : undefined,
    name: a.name,
    city: a.municipality || undefined,
    major: a.type === "large_airport",
  };
}

export function useAirports(enabled: boolean) {
  const [data, setData] = useState<Airport[] | null>(_cache);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    loadAirports().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [enabled, data]);
  return data;
}

export function airportsForCountries(all: Airport[] | null, isoList: string[]): Hub[] {
  if (!all) return [];
  const set = new Set(isoList.map((c) => c.toUpperCase()));
  const out: Hub[] = [];
  for (const a of all) {
    if (!a.iso_country || !set.has(a.iso_country)) continue;
    if (a.type === "closed" || a.type === "heliport" || a.type === "seaplane_base") continue;
    out.push(toHub(a));
  }
  // Major first, then alpha.
  out.sort((x, y) => Number(!!y.major) - Number(!!x.major) || x.name.localeCompare(y.name));
  return out;
}

export function airportsSearch(all: Airport[] | null, query: string, limit = 50): Hub[] {
  if (!all) return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: Hub[] = [];
  for (const a of all) {
    if (a.type === "closed" || a.type === "heliport" || a.type === "seaplane_base") continue;
    const hay = `${a.name} ${a.municipality ?? ""} ${a.iata_code ?? ""} ${a.gps_code ?? ""}`.toLowerCase();
    if (hay.includes(q)) {
      out.push(toHub(a));
      if (out.length >= limit) break;
    }
  }
  return out;
}