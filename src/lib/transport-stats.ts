// transport-stats.ts — parsing, aggregation and distance estimation for the
// Profile page's "transport statistics" section (uses per vehicle, top
// line/route/station, km travelled per mode).
//
// Itinerary items store transport data in meta in one of two shapes:
//  - meta.legs: [{ mode, from, to, ... }]              (outbound/return/flight/car)
//  - meta.mixed_legs: [{ mode, from_stop, to_stop, vehicle }]  (multi-modal legs)
// Both shapes are normalized into a single ParsedLeg[] here.
import { useEffect, useMemo, useState } from "react";

export type ParsedLeg = { mode: string; from: string; to: string; line?: string; city?: string };

export type TransportItemRow = { trip_id: string; kind: string; meta: unknown; location?: string | null };

const LEG_MODES = new Set(["car", "moto", "train", "plane", "ferry", "bus", "metro", "tram", "taxi"]);

function kindMode(kind: string): string | null {
  if (kind === "flight") return "plane";
  if (LEG_MODES.has(kind)) return kind;
  // outbound / return / transfer carry their own per-leg mode instead.
  return null;
}

export function extractLegs(row: { kind: string; meta: unknown; location?: string | null }): ParsedLeg[] {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const out: ParsedLeg[] = [];
  const fallbackMode = kindMode(row.kind);
  const metaMode = typeof meta.mode === "string" ? meta.mode : undefined;
  // The itinerary item's own `location` (e.g. "Budapest") is the best
  // available signal for which city a leg belongs to — station/stop names
  // themselves are too inconsistent (sometimes "City - Stop", sometimes just
  // the stop, sometimes a station code) to reliably parse a city back out.
  const city = typeof row.location === "string" ? row.location.trim() : "";

  const legs = Array.isArray(meta.legs) ? (meta.legs as Record<string, unknown>[]) : [];
  for (const l of legs) {
    const mode = (typeof l.mode === "string" && l.mode) || metaMode || fallbackMode;
    if (!mode) continue;
    const from = typeof l.from === "string" ? l.from.trim() : "";
    const to = typeof l.to === "string" ? l.to.trim() : "";
    if (!from || !to) continue;
    out.push({ mode, from, to, city: city || undefined });
  }

  const mixed = Array.isArray(meta.mixed_legs) ? (meta.mixed_legs as Record<string, unknown>[]) : [];
  for (const l of mixed) {
    const mode = (typeof l.mode === "string" && l.mode) || fallbackMode;
    if (!mode) continue;
    const from = typeof l.from_stop === "string" ? l.from_stop.trim() : "";
    const to = typeof l.to_stop === "string" ? l.to_stop.trim() : "";
    if (!from || !to) continue;
    const line = typeof l.vehicle === "string" ? l.vehicle.trim() : "";
    out.push({ mode, from, to, line: line || undefined, city: city || undefined });
  }

  return out;
}

export type TransportAggregates = {
  vehicleCounts: { mode: string; count: number }[];
  topLines: { mode: string; name: string; city?: string; count: number }[];
  topRoutes: { mode: string; a: string; b: string; count: number }[];
  topStations: { mode: string; name: string; city?: string; count: number }[];
  legsByMode: Record<string, ParsedLeg[]>;
};

// "quale è stata la linea più usata" → bus/metro/tram, keyed by the line ref.
const LINE_MODES = new Set(["bus", "metro", "tram"]);
// "la tratta più usata" → flights/trains AND road/rail-based local transit
// (car's "autostradale" route, metro, bus, tram), keyed by the (unordered)
// endpoint pair.
const ROUTE_MODES = new Set(["plane", "train", "car", "metro", "bus", "tram"]);
// "la stazione più usata" → bus/metro/tram/airport/train, keyed by endpoint name.
const STATION_MODES = new Set(["bus", "metro", "tram", "train", "plane"]);
// A city label is only meaningful next to a LOCAL stop name (bus/metro/tram)
// — train/plane endpoint names already carry enough place context on their
// own (full station/airport names), so no separate city tag is added there.
const CITY_TAGGED_STATION_MODES = new Set(["bus", "metro", "tram"]);
// A "top" pick this rare isn't meaningfully "the most used" anything — drop
// it instead of reporting a single one-off occurrence as a ranking.
const MIN_TOP_COUNT = 2;

// Picks the most frequent city among a key's occurrences (e.g. every city
// tag seen alongside a given bus line ref), used to label a "top X" result
// with its city — falls back to no city if none of its occurrences carried one.
function dominantCity(cityCounts: Map<string, number>): string | undefined {
  const top = [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top?.[0];
}

export function aggregateTransport(rows: { kind: string; meta: unknown; location?: string | null }[]): TransportAggregates {
  const allLegs: ParsedLeg[] = [];
  for (const r of rows) allLegs.push(...extractLegs(r));

  const vehicleMap = new Map<string, number>();
  const legsByMode: Record<string, ParsedLeg[]> = {};
  const lineMap = new Map<string, Map<string, { count: number; cities: Map<string, number> }>>();
  const routeMap = new Map<string, Map<string, { a: string; b: string; count: number }>>();
  const stationMap = new Map<string, Map<string, { count: number; cities: Map<string, number> }>>();

  for (const leg of allLegs) {
    vehicleMap.set(leg.mode, (vehicleMap.get(leg.mode) ?? 0) + 1);
    (legsByMode[leg.mode] ??= []).push(leg);

    if (LINE_MODES.has(leg.mode) && leg.line) {
      const m = lineMap.get(leg.mode) ?? new Map<string, { count: number; cities: Map<string, number> }>();
      const entry = m.get(leg.line) ?? { count: 0, cities: new Map<string, number>() };
      entry.count += 1;
      if (leg.city) entry.cities.set(leg.city, (entry.cities.get(leg.city) ?? 0) + 1);
      m.set(leg.line, entry);
      lineMap.set(leg.mode, m);
    }

    if (ROUTE_MODES.has(leg.mode)) {
      const [a, b] = [leg.from, leg.to].sort((x, y) => x.localeCompare(y));
      const key = `${a}|${b}`;
      const m = routeMap.get(leg.mode) ?? new Map<string, { a: string; b: string; count: number }>();
      const cur = m.get(key);
      if (cur) cur.count += 1;
      else m.set(key, { a, b, count: 1 });
      routeMap.set(leg.mode, m);
    }

    if (STATION_MODES.has(leg.mode)) {
      const m = stationMap.get(leg.mode) ?? new Map<string, { count: number; cities: Map<string, number> }>();
      for (const name of [leg.from, leg.to]) {
        const entry = m.get(name) ?? { count: 0, cities: new Map<string, number>() };
        entry.count += 1;
        if (leg.city) entry.cities.set(leg.city, (entry.cities.get(leg.city) ?? 0) + 1);
        m.set(name, entry);
      }
      stationMap.set(leg.mode, m);
    }
  }

  const vehicleCounts = [...vehicleMap.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);

  const topLines: TransportAggregates["topLines"] = [];
  for (const [mode, m] of lineMap) {
    const top = [...m.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (top && top[1].count >= MIN_TOP_COUNT) {
      topLines.push({ mode, name: top[0], city: dominantCity(top[1].cities), count: top[1].count });
    }
  }

  const topRoutes: TransportAggregates["topRoutes"] = [];
  for (const [mode, m] of routeMap) {
    const top = [...m.values()].sort((a, b) => b.count - a.count)[0];
    if (top && top.count >= MIN_TOP_COUNT) topRoutes.push({ mode, a: top.a, b: top.b, count: top.count });
  }

  const topStations: TransportAggregates["topStations"] = [];
  for (const [mode, m] of stationMap) {
    const top = [...m.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    if (top && top[1].count >= MIN_TOP_COUNT) {
      topStations.push({
        mode,
        name: top[0],
        city: CITY_TAGGED_STATION_MODES.has(mode) ? dominantCity(top[1].cities) : undefined,
        count: top[1].count,
      });
    }
  }

  return { vehicleCounts, topLines, topRoutes, topStations, legsByMode };
}

// ── Distance estimation ─────────────────────────────────────────────────────
// Every leg only stores place NAMES (station/airport/city labels), never
// coordinates, so km travelled has to be estimated in two steps: (1) geocode
// each unique endpoint name, then (2) get the distance BETWEEN the two
// endpoints the same way the trip map draws it — following real roads
// (OSRM) for road-bound modes, following real rail tracks (BRouter) for
// trains, and only falling back to a straight great-circle line for modes
// that genuinely fly/sail point-to-point (plane, ferry). A straight line
// hugely overstates a taxi/car/bus/tram/metro trip in a dense city (short
// real streets vs. a "as the crow flies" chord that can cut across water or
// blocks), which is exactly what produced unrealistic multi-thousand-km taxi
// totals before this fix. If the routing service can't find a route for a
// road/rail leg, that leg is EXCLUDED from the total rather than silently
// falling back to the (potentially wildly wrong) straight-line distance —
// a failure there is usually a sign the two endpoints were geocoded to the
// wrong place entirely (e.g. same-named station in another country), so a
// straight-line guess would just compound the error.
// Resolution is progressive (like the Profile page's own city-extremes
// compass) and successful look-ups are cached in localStorage so repeat
// visits are instant; failed look-ups are only cached in memory for this
// session, so a transient miss (rate limit / timeout) is retried on the
// next visit.

// Road-bound modes: their distance is the real driving/street route (OSRM).
// Metro has no widely-available underground-routing API, so it's treated as
// a road-following approximation too — still far closer to reality than a
// straight chord through several city blocks.
const ROAD_ROUTE_MODES = new Set(["car", "moto", "taxi", "bus", "tram", "metro"]);
// Trains follow the real railway network (BRouter's rail profile).
const RAIL_ROUTE_MODES = new Set(["train"]);
// Planes and ferries genuinely travel point-to-point — great-circle is the
// realistic distance for these, same as how flight distances are normally
// quoted.

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLng * sinDLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const GEO_CACHE_KEY = "voyager.transportPlaceGeocache.v1";
let _placeGeoPersisted: Record<string, { lat: number; lng: number }> = {};
try {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (raw) _placeGeoPersisted = JSON.parse(raw) as Record<string, { lat: number; lng: number }>;
  }
} catch {
  /* ignore */
}
const _memGeo = new Map<string, { lat: number; lng: number } | null>(Object.entries(_placeGeoPersisted));

let _saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistPlaceGeo() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(_placeGeoPersisted));
    } catch {
      /* ignore */
    }
  }, 500);
}

async function photonGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({ q: query, limit: "1" });
    const r = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { features?: Array<{ geometry?: { coordinates?: [number, number] } }> };
    const c = data.features?.[0]?.geometry?.coordinates;
    if (c) return { lat: c[1], lng: c[0] };
  } catch {
    /* ignore */
  }
  return null;
}

async function nominatimGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const params = new URLSearchParams({ q: query, format: "json", limit: "1" });
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const hits = (await r.json()) as Array<{ lat: string; lon: string }>;
    const hit = hits?.[0];
    if (hit) return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  } catch {
    /* ignore */
  }
  return null;
}

async function geocodePlaceCached(rawName: string): Promise<{ lat: number; lng: number } | null> {
  const key = rawName.trim().toLowerCase();
  if (!key) return null;
  if (_memGeo.has(key)) return _memGeo.get(key) ?? null;
  let coords = await photonGeocode(rawName);
  if (!coords) coords = await nominatimGeocode(rawName);
  _memGeo.set(key, coords);
  if (coords) {
    _placeGeoPersisted[key] = coords;
    persistPlaceGeo();
  }
  return coords;
}

// Real driving-route distance between two points, via the same OSRM
// instance the trip map uses to snap car/moto/bus legs to actual roads.
// Returns km, or null if OSRM can't find a route at all (see note above on
// why that's treated as "exclude", not "fall back to a straight line").
async function osrmDrivingDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { routes?: Array<{ distance?: number }> };
    const meters = data.routes?.[0]?.distance;
    return typeof meters === "number" ? meters / 1000 : null;
  } catch {
    /* ignore */
  }
  return null;
}

// Real railway-track distance between two points, via BRouter's rail
// profile (same service the trip map uses to trace train legs on the
// actual tracks). BRouter returns a polyline rather than a bare distance
// figure, so the km total is the sum of its segment lengths.
async function brouterRailDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<number | null> {
  try {
    const url =
      `https://brouter.de/brouter?lonlats=${a.lng},${a.lat}|${b.lng},${b.lat}` +
      `&profile=rail&alternativeidx=0&format=geojson`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { features?: Array<{ geometry?: { coordinates?: number[][] } }> };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += haversineKm(
        { lat: coords[i - 1][1], lng: coords[i - 1][0] },
        { lat: coords[i][1], lng: coords[i][0] },
      );
    }
    return total;
  } catch {
    /* ignore */
  }
  return null;
}

type RouteCategory = "road" | "rail" | "gc";
function routeCategoryFor(mode: string): RouteCategory {
  if (RAIL_ROUTE_MODES.has(mode)) return "rail";
  if (ROAD_ROUTE_MODES.has(mode)) return "road";
  return "gc";
}

const ROUTE_DIST_CACHE_KEY = "voyager.transportRouteDistCache.v1";
let _routeDistPersisted: Record<string, number> = {};
try {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(ROUTE_DIST_CACHE_KEY);
    if (raw) _routeDistPersisted = JSON.parse(raw) as Record<string, number>;
  }
} catch {
  /* ignore */
}
// In-memory cache also holds `null` for this-session failures (excluded
// legs) so they aren't refetched over and over while the page is open, but
// (unlike successes) that null is never written to localStorage — a
// transient routing hiccup should still get a fresh chance next visit.
const _memRouteDist = new Map<string, number | null>(Object.entries(_routeDistPersisted));

let _routeDistSaveTimer: ReturnType<typeof setTimeout> | undefined;
function persistRouteDist() {
  if (_routeDistSaveTimer) clearTimeout(_routeDistSaveTimer);
  _routeDistSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(ROUTE_DIST_CACHE_KEY, JSON.stringify(_routeDistPersisted));
    } catch {
      /* ignore */
    }
  }, 500);
}

function routeDistKey(category: RouteCategory, a: { lat: number; lng: number }, b: { lat: number; lng: number }): string {
  const round = (n: number) => n.toFixed(4);
  return `${category}|${round(a.lat)},${round(a.lng)}|${round(b.lat)},${round(b.lng)}`;
}

async function resolveRouteDistKm(category: RouteCategory, a: { lat: number; lng: number }, b: { lat: number; lng: number }): Promise<number | null> {
  if (category === "gc") return haversineKm(a, b);
  const km = category === "rail" ? await brouterRailDistanceKm(a, b) : await osrmDrivingDistanceKm(a, b);
  return km; // null on failure — caller excludes the leg, see note above.
}

/** Progressively resolves every place name used by `legsByMode`, then the
 *  real road/rail/great-circle distance between each unique pair of
 *  resolved endpoints, and returns the running total of km travelled per
 *  mode. `resolving` is true while background look-ups are still in
 *  flight. */
export function useTransportKm(legsByMode: Record<string, ParsedLeg[]>): {
  kmByMode: Record<string, number>;
  resolving: boolean;
} {
  const allLegs = useMemo(() => Object.values(legsByMode).flat(), [legsByMode]);
  const namesKey = useMemo(() => {
    const set = new Set<string>();
    for (const l of allLegs) {
      if (l.from) set.add(l.from.trim().toLowerCase());
      if (l.to) set.add(l.to.trim().toLowerCase());
    }
    return [...set].sort().join("|");
  }, [allLegs]);

  const [geo, setGeo] = useState<Map<string, { lat: number; lng: number } | null>>(() => new Map(_memGeo));
  const [resolvingPlaces, setResolvingPlaces] = useState(false);

  // Step 1: geocode every unique place name.
  useEffect(() => {
    let alive = true;
    const names = namesKey ? namesKey.split("|").filter(Boolean) : [];
    setGeo(new Map(_memGeo));
    const pending = names.filter((n) => !_memGeo.has(n));
    if (pending.length === 0) {
      setResolvingPlaces(false);
      return;
    }
    setResolvingPlaces(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      for (let i = 0; i < pending.length; i++) {
        if (!alive) break;
        await geocodePlaceCached(pending[i]);
        if (!alive) break;
        setGeo(new Map(_memGeo));
        if (i < pending.length - 1) {
          await new Promise<void>((r) => {
            timer = setTimeout(r, 350);
          });
        }
      }
    })()
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (alive) setResolvingPlaces(false);
      });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  // Step 2: once both endpoints of a leg are geocoded, resolve the real
  // road/rail/great-circle distance for that (unique) endpoint pair.
  const pendingRoutePairs = useMemo(() => {
    const seen = new Set<string>();
    const list: { key: string; category: RouteCategory; a: { lat: number; lng: number }; b: { lat: number; lng: number } }[] = [];
    for (const l of allLegs) {
      const a = geo.get(l.from.trim().toLowerCase());
      const b = geo.get(l.to.trim().toLowerCase());
      if (!a || !b) continue;
      const category = routeCategoryFor(l.mode);
      const key = routeDistKey(category, a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, category, a, b });
    }
    return list;
  }, [allLegs, geo]);
  const routeKeysJoined = useMemo(() => pendingRoutePairs.map((p) => p.key).join(","), [pendingRoutePairs]);

  const [routeDist, setRouteDist] = useState<Map<string, number | null>>(() => new Map(_memRouteDist));
  const [resolvingRoutes, setResolvingRoutes] = useState(false);

  useEffect(() => {
    let alive = true;
    setRouteDist(new Map(_memRouteDist));
    const pending = pendingRoutePairs.filter((p) => !_memRouteDist.has(p.key));
    if (pending.length === 0) {
      setResolvingRoutes(false);
      return;
    }
    setResolvingRoutes(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      for (let i = 0; i < pending.length; i++) {
        if (!alive) break;
        const p = pending[i];
        const km = await resolveRouteDistKm(p.category, p.a, p.b);
        _memRouteDist.set(p.key, km);
        if (km !== null) {
          _routeDistPersisted[p.key] = km;
          persistRouteDist();
        }
        if (!alive) break;
        setRouteDist(new Map(_memRouteDist));
        if (i < pending.length - 1) {
          await new Promise<void>((r) => {
            timer = setTimeout(r, 400);
          });
        }
      }
    })()
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (alive) setResolvingRoutes(false);
      });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKeysJoined]);

  const kmByMode = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [mode, legs] of Object.entries(legsByMode)) {
      let total = 0;
      const category = routeCategoryFor(mode);
      for (const l of legs) {
        const a = geo.get(l.from.trim().toLowerCase());
        const b = geo.get(l.to.trim().toLowerCase());
        if (!a || !b) continue;
        const km = routeDist.get(routeDistKey(category, a, b));
        if (typeof km === "number") total += km;
        // km === null (routing failed) or undefined (not resolved yet) →
        // this leg is excluded from the total rather than guessed at.
      }
      out[mode] = Math.round(total);
    }
    return out;
  }, [legsByMode, geo, routeDist]);

  return { kmByMode, resolving: resolvingPlaces || resolvingRoutes };
}
