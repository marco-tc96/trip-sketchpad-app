import { useEffect, useState } from "react";
import type { Hub } from "@/lib/transport-hubs";

// Airports are sourced exclusively from the `airports-json` package — a
// global, ready-made dataset (no more hand-written country tables, no more
// live remote lookup needed for planes). Only airports with a real IATA
// code are kept: those are the ones with scheduled commercial passenger
// service, which is what matters for a trip planner. Heliports, closed
// fields and private airstrips without an IATA code are filtered out.

type Airport = {
  name: string;
  iata_code?: string;
  gps_code?: string;
  iso_country?: string;
  municipality?: string;
  type?: string;
  scheduled_service?: string;
};

export type AirportHub = Hub & {
  code: string; // IATA is mandatory for every entry returned by this module
};

let _cache: Airport[] | null = null;
let _loading: Promise<Airport[]> | null = null;

async function loadAirports(): Promise<Airport[]> {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = import("airports-json").then((m) => {
    const mod = m as unknown as { airports?: Airport[]; default?: { airports?: Airport[] } };
    _cache = mod.airports ?? mod.default?.airports ?? [];
    return _cache;
  });
  return _loading;
}

const IATA_RE = /^[A-Z]{3}$/;

function hasRealIata(a: Airport): boolean {
  return !!a.iata_code && IATA_RE.test(a.iata_code);
}

function isUsable(a: Airport): boolean {
  if (a.type === "closed" || a.type === "heliport" || a.type === "seaplane_base") return false;
  return hasRealIata(a);
}

function toHub(a: Airport): AirportHub {
  return {
    code: a.iata_code as string,
    name: a.name,
    city: a.municipality || undefined,
    major: a.type === "large_airport",
  };
}

export function useAirports(enabled = true) {
  const [data, setData] = useState<Airport[] | null>(_cache);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    loadAirports().then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [enabled, data]);
  return data;
}

export function airportsForCountries(all: Airport[] | null, isoList: string[]): AirportHub[] {
  if (!all) return [];
  const set = new Set(isoList.map((c) => c.toUpperCase()));
  const out: AirportHub[] = [];
  for (const a of all) {
    if (!a.iso_country || !set.has(a.iso_country)) continue;
    if (!isUsable(a)) continue;
    out.push(toHub(a));
  }
  // Major airports first, then alphabetical by city for easier scanning.
  out.sort(
    (x, y) => Number(!!y.major) - Number(!!x.major) || (x.city ?? x.name).localeCompare(y.city ?? y.name),
  );
  return out;
}

export function airportsSearch(all: Airport[] | null, query: string, limit = 50): AirportHub[] {
  if (!all) return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: AirportHub[] = [];
  for (const a of all) {
    if (!isUsable(a)) continue;
    const hay = `${a.name} ${a.municipality ?? ""} ${a.iata_code ?? ""}`.toLowerCase();
    if (hay.includes(q)) {
      out.push(toHub(a));
      if (out.length >= limit) break;
    }
  }
  // Exact / prefix IATA matches first (typing "FCO" should surface Fiumicino
  // immediately even among hundreds of text matches).
  out.sort((x, y) => {
    const xExact = x.code.toLowerCase() === q ? 0 : x.code.toLowerCase().startsWith(q) ? 1 : 2;
    const yExact = y.code.toLowerCase() === q ? 0 : y.code.toLowerCase().startsWith(q) ? 1 : 2;
    return xExact - yExact;
  });
  return out;
}

// Desktop: full airport name — "FCO - Roma / Roma Fiumicino"
export function formatAirportFull(a: AirportHub): string {
  const city = a.city ?? a.name;
  return `${a.code} - ${city} / ${a.name}`;
}

// Mobile: abbreviated, IATA always present — "FCO - Roma"
// Falls back to the airport name when no city is known.
export function formatAirportCompact(a: AirportHub): string {
  return `${a.code} - ${a.city ?? a.name}`;
}

// Single entry point used by the combobox: picks the right format for the
// current viewport. `isMobile` is expected to come from useIsMobile().
export function formatAirport(a: AirportHub, isMobile: boolean): string {
  return isMobile ? formatAirportCompact(a) : formatAirportFull(a);
}
