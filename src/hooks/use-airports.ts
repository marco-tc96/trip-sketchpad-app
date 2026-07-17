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
  // OurAirports' own precise reference-point coordinates for the airport —
  // present in the raw dataset (it's the standard OurAirports CSV schema)
  // but not previously declared here since nothing in this module needed
  // them. Now used by `airportCoordsByIata`/`airportCoordsByCity` (see
  // below) as an exact, offline, rate-limit-free source of truth for a
  // leg's airport pin — no live geocoder round-trip needed at all.
  latitude_deg?: number;
  longitude_deg?: number;
};

export type AirportHub = Hub & {
  code: string; // IATA is mandatory for every entry returned by this module
  multiAirportCity: boolean; // true when the city has 2+ commercial airports
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

function toHub(a: Airport, all: Airport[]): AirportHub {
  return {
    code: a.iata_code as string,
    name: a.name,
    city: a.municipality || undefined,
    major: a.type === "large_airport",
    multiAirportCity: hasSiblingAirports(a, all),
  };
}

// Strips generic boilerplate words from an official airport name so we can
// show a short, human label instead of the full legal name (e.g. "Milano
// Malpensa International Airport" -> "Malpensa", "Roma Fiumicino" -> stays
// "Fiumicino" once the city prefix is removed too). This is only used to
// disambiguate airports that share a city — Bologna has just one airport,
// so it's never shown; Milano has two, so "Malpensa" / "Linate" appear.
const BOILERPLATE = /\b(international|airport|aeroporto|aéroport|flughafen|aeropuerto|regional|municipal|county|metropolitan|field|station)\b/gi;

// A handful of well-known airports have an official name far longer than
// the name people actually use day to day (e.g. Fiumicino is officially
// "Leonardo da Vinci–Fiumicino Airport"). These overrides keep the label
// short and recognizable; every other airport falls back to the automatic
// boilerplate-stripping below, which already covers the common case well
// (simple "City Airportname International Airport" patterns).
const SHORT_NAME_OVERRIDES: Record<string, string> = {
  FCO: "Fiumicino",
  CIA: "Ciampino",
  MXP: "Malpensa",
  LIN: "Linate",
  BGY: "Orio al Serio",
  CDG: "Charles de Gaulle",
  ORY: "Orly",
  LHR: "Heathrow",
  LGW: "Gatwick",
  STN: "Stansted",
  LTN: "Luton",
  LCY: "London City",
  JFK: "JFK",
  EWR: "Newark",
  LGA: "LaGuardia",
  HND: "Haneda",
  NRT: "Narita",
};

function shortAirportName(a: AirportHub): string {
  if (SHORT_NAME_OVERRIDES[a.code]) return SHORT_NAME_OVERRIDES[a.code];
  let n = a.name;
  // Drop the city name itself if it's a prefix/part of the official name
  // ("Roma Fiumicino" with city "Roma" -> "Fiumicino").
  if (a.city) {
    const cityRe = new RegExp(`\\b${a.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    n = n.replace(cityRe, "").trim();
  }
  n = n.replace(BOILERPLATE, "").replace(/[-–—,/]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return n || a.name;
}

let _cityCountCache: Map<string, number> | null = null;
function cityAirportCounts(all: Airport[]): Map<string, number> {
  if (_cityCountCache) return _cityCountCache;
  const counts = new Map<string, number>();
  for (const a of all) {
    if (!isUsable(a)) continue;
    const key = `${(a.iso_country ?? "").toUpperCase()}|${(a.municipality ?? "").toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  _cityCountCache = counts;
  return counts;
}

function hasSiblingAirports(a: Airport, all: Airport[] | null): boolean {
  if (!all || !a.municipality) return false;
  const counts = cityAirportCounts(all);
  const key = `${(a.iso_country ?? "").toUpperCase()}|${a.municipality.toLowerCase()}`;
  return (counts.get(key) ?? 0) > 1;
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
    out.push(toHub(a, all));
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
      out.push(toHub(a, all));
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

// Single display/storage format, used everywhere (journey card, combobox
// list, saved value) — no more separate desktop/mobile variants. Rule:
//   - city has only one commercial airport  -> "IATA - City"        (e.g. "BLQ - Bologna")
//   - city has 2+ commercial airports       -> "IATA - City Short"  (e.g. "MXP - Milano Malpensa")
// This keeps single-airport cities short while disambiguating cities like
// Milano (Malpensa/Linate) or Roma (Fiumicino/Ciampino) that would
// otherwise collide on the same city name.
export function formatAirport(a: AirportHub): string {
  if (!a.city) return `${a.code} - ${a.name}`;
  if (!a.multiAirportCity) return `${a.code} - ${a.city}`;
  return `${a.code} - ${a.city} ${shortAirportName(a)}`.trim();
}

// ── Exact, offline coordinates (no live geocoder needed) ────────────────────
// The map page (trip-map.tsx) used to resolve a plane leg's pin purely via a
// live Overpass lookup by IATA code (or, failing that, a free-text geocode of
// the leg's label) — reliable most of the time, but a network hiccup/timeout
// silently fell through to a much fuzzier text search that could land on the
// wrong feature entirely (e.g. a same-named town instead of the airport). The
// airports-json dataset already used everywhere else in the app for airport
// data ALSO carries each airport's own precise reference-point coordinates,
// so the map can use those directly — no network round-trip, no rate limit,
// no ambiguity — and only fall back to live geocoding if a code truly isn't
// in the dataset (extremely rare for any airport with scheduled service).
export async function airportCoordsByIata(code: string): Promise<{ lat: number; lng: number } | null> {
  const iata = (code ?? "").trim().toUpperCase();
  if (!IATA_RE.test(iata)) return null;
  const all = await loadAirports();
  const a = all.find((x) => (x.iata_code ?? "").toUpperCase() === iata);
  if (!a || typeof a.latitude_deg !== "number" || typeof a.longitude_deg !== "number") return null;
  return { lat: a.latitude_deg, lng: a.longitude_deg };
}

// Fallback for a plane leg whose saved label has no parseable IATA code at
// all (e.g. an older leg saved as plain "Barcelona" or "El Prat" before the
// "IATA - City" format existed) — matches the query text against airports'
// own municipality/name fields instead. Only returns a result when exactly
// ONE usable airport matches, so an ambiguous multi-airport city (e.g.
// "Milano") is deliberately left unresolved here rather than guessing.
export async function airportCoordsByPlaceName(query: string): Promise<{ lat: number; lng: number } | null> {
  const q = (query ?? "").trim().toLowerCase();
  if (q.length < 2) return null;
  const all = await loadAirports();
  const matches = all.filter((a) => {
    if (!isUsable(a)) return false;
    if (typeof a.latitude_deg !== "number" || typeof a.longitude_deg !== "number") return false;
    const hay = `${a.name} ${a.municipality ?? ""}`.toLowerCase();
    return hay.includes(q) || q.includes((a.municipality ?? "").toLowerCase().trim() || "\0");
  });
  if (matches.length !== 1) return null;
  return { lat: matches[0].latitude_deg as number, lng: matches[0].longitude_deg as number };
}
