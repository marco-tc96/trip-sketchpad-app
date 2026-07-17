// transport-stats.ts — parsing, aggregation and distance estimation for the
// Profile page's "transport statistics" section (uses per vehicle, top
// line/route/station, km travelled per mode).
//
// Itinerary items store transport data in meta in one of two shapes:
//  - meta.legs: [{ mode, from, to, ... }]              (outbound/return/flight/car)
//  - meta.mixed_legs: [{ mode, from_stop, to_stop, vehicle }]  (multi-modal legs)
// Both shapes are normalized into a single ParsedLeg[] here.
import { useEffect, useMemo, useState } from "react";

export type ParsedLeg = { mode: string; from: string; to: string; line?: string };

export type TransportItemRow = { trip_id: string; kind: string; meta: unknown };

const LEG_MODES = new Set(["car", "moto", "train", "plane", "ferry", "bus", "metro", "tram", "taxi"]);

function kindMode(kind: string): string | null {
  if (kind === "flight") return "plane";
  if (LEG_MODES.has(kind)) return kind;
  // outbound / return / transfer carry their own per-leg mode instead.
  return null;
}

export function extractLegs(row: { kind: string; meta: unknown }): ParsedLeg[] {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const out: ParsedLeg[] = [];
  const fallbackMode = kindMode(row.kind);
  const metaMode = typeof meta.mode === "string" ? meta.mode : undefined;

  const legs = Array.isArray(meta.legs) ? (meta.legs as Record<string, unknown>[]) : [];
  for (const l of legs) {
    const mode = (typeof l.mode === "string" && l.mode) || metaMode || fallbackMode;
    if (!mode) continue;
    const from = typeof l.from === "string" ? l.from.trim() : "";
    const to = typeof l.to === "string" ? l.to.trim() : "";
    if (!from || !to) continue;
    out.push({ mode, from, to });
  }

  const mixed = Array.isArray(meta.mixed_legs) ? (meta.mixed_legs as Record<string, unknown>[]) : [];
  for (const l of mixed) {
    const mode = (typeof l.mode === "string" && l.mode) || fallbackMode;
    if (!mode) continue;
    const from = typeof l.from_stop === "string" ? l.from_stop.trim() : "";
    const to = typeof l.to_stop === "string" ? l.to_stop.trim() : "";
    if (!from || !to) continue;
    const line = typeof l.vehicle === "string" ? l.vehicle.trim() : "";
    out.push({ mode, from, to, line: line || undefined });
  }

  return out;
}

export type TransportAggregates = {
  vehicleCounts: { mode: string; count: number }[];
  topLines: { mode: string; name: string; count: number }[];
  topRoutes: { mode: string; a: string; b: string; count: number }[];
  topStations: { mode: string; name: string; count: number }[];
  legsByMode: Record<string, ParsedLeg[]>;
};

// "quale è stata la linea più usata" → bus/metro/tram, keyed by the line ref.
const LINE_MODES = new Set(["bus", "metro", "tram"]);
// "la tratta più usata" → flights/trains, keyed by the (unordered) endpoint pair.
const ROUTE_MODES = new Set(["plane", "train"]);
// "la stazione più usata" → bus/metro/tram/airport/train, keyed by endpoint name.
const STATION_MODES = new Set(["bus", "metro", "tram", "train", "plane"]);

export function aggregateTransport(rows: { kind: string; meta: unknown }[]): TransportAggregates {
  const allLegs: ParsedLeg[] = [];
  for (const r of rows) allLegs.push(...extractLegs(r));

  const vehicleMap = new Map<string, number>();
  const legsByMode: Record<string, ParsedLeg[]> = {};
  const lineMap = new Map<string, Map<string, number>>();
  const routeMap = new Map<string, Map<string, { a: string; b: string; count: number }>>();
  const stationMap = new Map<string, Map<string, number>>();

  for (const leg of allLegs) {
    vehicleMap.set(leg.mode, (vehicleMap.get(leg.mode) ?? 0) + 1);
    (legsByMode[leg.mode] ??= []).push(leg);

    if (LINE_MODES.has(leg.mode) && leg.line) {
      const m = lineMap.get(leg.mode) ?? new Map<string, number>();
      m.set(leg.line, (m.get(leg.line) ?? 0) + 1);
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
      const m = stationMap.get(leg.mode) ?? new Map<string, number>();
      m.set(leg.from, (m.get(leg.from) ?? 0) + 1);
      m.set(leg.to, (m.get(leg.to) ?? 0) + 1);
      stationMap.set(leg.mode, m);
    }
  }

  const vehicleCounts = [...vehicleMap.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count);

  const topLines: TransportAggregates["topLines"] = [];
  for (const [mode, m] of lineMap) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) topLines.push({ mode, name: top[0], count: top[1] });
  }

  const topRoutes: TransportAggregates["topRoutes"] = [];
  for (const [mode, m] of routeMap) {
    const top = [...m.values()].sort((a, b) => b.count - a.count)[0];
    if (top) topRoutes.push({ mode, a: top.a, b: top.b, count: top.count });
  }

  const topStations: TransportAggregates["topStations"] = [];
  for (const [mode, m] of stationMap) {
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) topStations.push({ mode, name: top[0], count: top[1] });
  }

  return { vehicleCounts, topLines, topRoutes, topStations, legsByMode };
}

// ── Distance estimation ─────────────────────────────────────────────────────
// Every leg only stores place NAMES (station/airport/city labels), never
// coordinates, so km travelled has to be estimated by geocoding each unique
// endpoint name and summing haversine distances. Resolution is progressive
// (like the Profile page's own city-extremes compass) and successful
// look-ups are cached in localStorage so repeat visits are instant; failed
// look-ups are only cached in memory for this session, so a transient miss
// (rate limit / timeout) is retried on the next visit.

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

/** Progressively resolves every place name used by `legsByMode` and returns
 *  the running total of km travelled per mode. `resolving` is true while
 *  background look-ups are still in flight. */
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
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let alive = true;
    const names = namesKey ? namesKey.split("|").filter(Boolean) : [];
    setGeo(new Map(_memGeo));
    const pending = names.filter((n) => !_memGeo.has(n));
    if (pending.length === 0) {
      setResolving(false);
      return;
    }
    setResolving(true);
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
        if (alive) setResolving(false);
      });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  const kmByMode = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [mode, legs] of Object.entries(legsByMode)) {
      let total = 0;
      for (const l of legs) {
        const a = geo.get(l.from.trim().toLowerCase());
        const b = geo.get(l.to.trim().toLowerCase());
        if (a && b) total += haversineKm(a, b);
      }
      out[mode] = Math.round(total);
    }
    return out;
  }, [legsByMode, geo]);

  return { kmByMode, resolving };
}
