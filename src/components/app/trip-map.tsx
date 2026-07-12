import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeCity } from "@/lib/country-data";
import { withRomanization, registerEnName } from "@/lib/romanize";

export type MapCity = { name: string; country: string; lat?: number; lng?: number };
export type MapRoute = { from: string; to: string; mode: string; country?: string; line?: string; city?: string };

// Approximate country centroids (lat, lng) keyed by ISO-2.
// Used as a fallback when no city coordinates are available.
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  AF: [33.939, 67.710], AL: [41.153, 20.168], DZ: [28.034, 1.660],
  AD: [42.546, 1.602], AO: [-11.203, 17.874], AG: [17.061, -61.796],
  AR: [-38.416, -63.617], AM: [40.069, 45.038], AU: [-25.274, 133.775],
  AT: [47.516, 14.550], AZ: [40.143, 47.577], BS: [25.034, -77.396],
  BH: [25.930, 50.638], BD: [23.685, 90.356], BB: [13.194, -59.543],
  BY: [53.710, 27.953], BE: [50.504, 4.470], BZ: [17.190, -88.498],
  BJ: [9.308, 2.316], BT: [27.514, 90.434], BO: [-16.290, -63.589],
  BA: [43.916, 17.679], BW: [-22.328, 24.685], BR: [-14.235, -51.925],
  BN: [4.535, 114.728], BG: [42.734, 25.486], BF: [12.365, -1.562],
  BI: [-3.373, 29.919], CV: [16.002, -24.013], KH: [12.566, 104.991],
  CM: [3.848, 11.502], CA: [56.130, -106.347], CF: [6.611, 20.939],
  TD: [15.454, 18.732], CL: [-35.675, -71.543], CN: [35.862, 104.195],
  CO: [4.571, -74.297], KM: [-11.875, 43.872], CG: [-0.228, 15.828],
  CD: [-4.038, 21.759], CR: [9.749, -83.753], CI: [7.540, -5.547],
  HR: [45.100, 15.200], CU: [21.522, -77.781], CY: [35.126, 33.430],
  CZ: [49.817, 15.473], DK: [56.264, 9.502], DJ: [11.825, 42.590],
  DM: [15.415, -61.371], DO: [18.736, -70.163], EC: [-1.831, -78.183],
  EG: [26.821, 30.802], SV: [13.794, -88.897], GQ: [1.651, 10.268],
  ER: [15.179, 39.782], EE: [58.595, 25.014], SZ: [-26.523, 31.466],
  ET: [9.145, 40.490], FJ: [-16.578, 179.414], FI: [61.924, 25.748],
  FR: [46.228, 2.214], GA: [-0.804, 11.609], GM: [13.443, -15.310],
  GE: [42.315, 43.357], DE: [51.166, 10.452], GH: [7.947, -1.023],
  GR: [39.074, 21.824], GL: [71.707, -42.604], GD: [12.117, -61.679],
  GT: [15.783, -90.231], GN: [9.946, -9.697], GW: [11.804, -15.180],
  GY: [4.860, -58.930], HT: [18.971, -72.285], VA: [41.903, 12.453],
  HN: [15.200, -86.242], HK: [22.396, 114.109], HU: [47.162, 19.503],
  IS: [64.963, -19.021], IN: [20.594, 78.963], ID: [-0.789, 113.921],
  IR: [32.428, 53.688], IQ: [33.223, 43.679], IE: [53.413, -8.244],
  IL: [31.046, 34.852], IT: [41.872, 12.567], JM: [18.110, -77.298],
  JP: [36.205, 138.253], JO: [30.585, 36.238], KZ: [48.020, 66.924],
  KE: [-0.024, 37.906], KI: [-3.370, -168.734], KP: [40.340, 127.510],
  KR: [35.908, 127.767], KW: [29.312, 47.482], KG: [41.204, 74.766],
  LA: [19.856, 102.495], LV: [56.880, 24.603], LB: [33.855, 35.862],
  LS: [-29.610, 28.234], LR: [6.428, -9.429], LY: [26.335, 17.228],
  LI: [47.166, 9.555], LT: [55.169, 23.881], LU: [49.815, 6.130],
  MO: [22.199, 113.544], MG: [-18.767, 46.869], MW: [-13.254, 34.302],
  MY: [4.210, 101.976], MV: [3.203, 73.221], ML: [17.571, -3.996],
  MT: [35.937, 14.375], MH: [7.131, 171.184], MR: [21.008, -10.941],
  MU: [-20.348, 57.552], MX: [23.635, -102.553], FM: [7.426, 150.551],
  MD: [47.412, 28.370], MC: [43.750, 7.413], MN: [46.862, 103.847],
  ME: [42.709, 19.374], MA: [31.792, -7.093], MZ: [-18.666, 35.530],
  MM: [21.914, 95.956], NA: [-22.958, 18.490], NR: [-0.523, 166.932],
  NP: [28.395, 84.124], NL: [52.133, 5.291], NZ: [-40.901, 174.886],
  NI: [12.865, -85.207], NE: [17.608, 8.082], NG: [9.082, 8.675],
  MK: [41.609, 21.745], NO: [60.472, 8.469], OM: [21.513, 55.923],
  PK: [30.375, 69.345], PW: [7.515, 134.583], PS: [31.952, 35.233],
  PA: [8.538, -80.782], PG: [-6.315, 143.956], PY: [-23.443, -58.444],
  PE: [-9.190, -75.015], PH: [12.880, 121.774], PL: [51.919, 19.145],
  PT: [39.400, -8.224], QA: [25.355, 51.184], RO: [45.943, 24.967],
  RU: [61.524, 105.319], RW: [-1.940, 29.874], SM: [43.942, 12.458],
  SA: [23.886, 45.079], SN: [14.497, 14.452], RS: [44.017, 21.006],
  SC: [-4.680, 55.492], SL: [8.461, -11.780], SG: [1.352, 103.820],
  SK: [48.669, 19.699], SI: [46.151, 14.995], SB: [-9.646, 160.156],
  SO: [5.152, 46.200], ZA: [-30.559, 22.938], SS: [4.885, 31.571],
  ES: [40.464, -3.749], LK: [7.873, 80.772], SD: [12.863, 30.218],
  SR: [3.919, -56.028], SE: [60.128, 18.644], CH: [46.818, 8.228],
  SY: [34.802, 38.997], TW: [23.698, 120.961], TJ: [38.861, 71.276],
  TZ: [-6.369, 34.889], TH: [15.870, 100.993], TL: [-8.874, 125.728],
  TG: [8.620, 0.825], TO: [-21.179, -175.198], TT: [10.692, -61.223],
  TN: [33.887, 9.537], TR: [38.964, 35.243], TM: [38.970, 59.556],
  TV: [-7.110, 177.649], UG: [1.373, 32.290], UA: [48.379, 31.166],
  AE: [23.424, 53.848], GB: [55.378, -3.436], US: [37.090, -95.713],
  UY: [-32.523, -55.766], UZ: [41.377, 64.585], VU: [-15.377, 166.959],
  VE: [6.424, -66.590], VN: [14.058, 108.277], YE: [15.553, 48.516],
  ZM: [-13.134, 27.849], ZW: [-19.015, 29.155],
};

// Colour (and optional dash pattern) per transport mode — matches the colours
// used in the timeline activity list: amber train, sky bus, violet metro,
// emerald tram; everything else uses the app's primary (warm) colour, same as
// the transport icon circles there.
const PRIMARY = "oklch(0.66 0.14 38)";
const MODE_STYLE: Record<string, { color: string; dash?: string }> = {
  train:    { color: "#f59e0b" },              // amber-500
  bus:      { color: "#0ea5e9" },              // sky-500
  metro:    { color: "#8b5cf6" },              // violet-500
  tram:     { color: "#10b981" },              // emerald-500
  plane:    { color: PRIMARY, dash: "2 8" },   // primary, dotted
  ferry:    { color: PRIMARY, dash: "8 6" },   // primary, dashed
  car:      { color: PRIMARY },
  moto:     { color: PRIMARY },
  transfer: { color: PRIMARY },
};
const modeStyle = (mode: string) => MODE_STYLE[mode] ?? { color: PRIMARY };

// Ground modes whose path we snap to real roads via OSRM; plane/ferry stay
// straight (dotted/dashed) since there are no roads to follow.
const GROUND_MODES = new Set(["car", "moto"]);

// Ask OSRM for a road-following geometry between two points. Returns the full
// polyline ([lat,lng][]) or null on failure (caller falls back to a straight line).
async function fetchRoadPath(
  a: [number, number],
  b: [number, number],
): Promise<[number, number][] | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    }
  } catch { /* ignore */ }
  return null;
}

// ── Real transit-line geometry (metro/tram/bus/train) from OSM via Overpass ──
const TRANSIT_MODES = new Set(["bus", "metro", "tram", "train"]);
const OSM_ROUTE_MODE: Record<string, string> = { bus: "bus", metro: "subway", tram: "tram", train: "train" };

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const _areaCache = new Map<string, string>();

async function overpassFetch(query: string, timeoutMs = 25000): Promise<{ elements: unknown[] }> {
  const body = `data=${encodeURIComponent(query)}`;
  const attempts = OVERPASS_MIRRORS.map((url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { elements: unknown[] };
      })
      .finally(() => clearTimeout(timer));
  });
  return Promise.any(attempts);
}

async function getAreaQuery(city: string): Promise<string> {
  if (_areaCache.has(city)) return _areaCache.get(city)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=5&addressdetails=0`,
      { headers: { Accept: "application/json" } },
    );
    const hits = (await r.json()) as Array<{ osm_type: string; osm_id: string; class: string; type: string }>;
    const rel =
      hits.find((h) => h.osm_type === "relation" && h.class === "boundary" && h.type === "administrative") ??
      hits.find((h) => h.osm_type === "relation" && ["place", "boundary"].includes(h.class));
    if (rel) {
      const q = `area(${3600000000 + parseInt(rel.osm_id)})->.c`;
      _areaCache.set(city, q);
      return q;
    }
  } catch { /* fall through */ }
  const fallback = `area["name"="${city}"]["boundary"="administrative"]->.c`;
  _areaCache.set(city, fallback);
  return fallback;
}

type LL = [number, number];
const _near = (p: LL, q: LL) => Math.abs(p[0] - q[0]) < 1e-4 && Math.abs(p[1] - q[1]) < 1e-4;

// Stitch the route's way segments into one continuous ordered polyline,
// flipping ways whose direction doesn't match so the path stays connected.
function stitchWays(ways: LL[][]): LL[] {
  const list = ways.filter((w) => w.length >= 2);
  if (list.length === 0) return [];
  const used = new Array(list.length).fill(false);
  let path = list[0].slice();
  used[0] = true;
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < list.length; k++) {
      if (used[k]) continue;
      const w = list[k];
      const start = path[0];
      const end = path[path.length - 1];
      const ws = w[0];
      const we = w[w.length - 1];
      if (_near(end, ws)) { path = path.concat(w.slice(1)); used[k] = true; changed = true; }
      else if (_near(end, we)) { path = path.concat(w.slice().reverse().slice(1)); used[k] = true; changed = true; }
      else if (_near(start, we)) { path = w.slice().concat(path.slice(1)); used[k] = true; changed = true; }
      else if (_near(start, ws)) { path = w.slice().reverse().concat(path.slice(1)); used[k] = true; changed = true; }
    }
  }
  return path;
}

export type TransitLine = { path: LL[]; stops: Array<{ name: string; ll: LL }> };

// Fetch the real OSM geometry of a transit line: its continuous polyline PLUS
// the ordered stops (name + coordinates) read from the route relation itself —
// so transit stops never depend on ambiguous global geocoding.
async function fetchTransitGeometry(city: string, mode: string, ref: string): Promise<TransitLine> {
  const empty: TransitLine = { path: [], stops: [] };
  const osmMode = OSM_ROUTE_MODE[mode];
  if (!osmMode || !city || !ref) return empty;
  const areaQ = await getAreaQuery(city);
  const modes = osmMode === "subway" ? ["subway", "metro"] : [osmMode];
  const clauses = modes
    .map((m) => `relation["type"="route"]["route"="${m}"]["ref"="${ref}"](area.c)`)
    .join(";");
  // `.r out geom` → way geometries; `node(r.r) out tags` → member node names
  // (name / name:en) with coordinates, used to label & English-ify the stops.
  const q = `[out:json][timeout:60];${areaQ};(${clauses};)->.r;.r out geom;node(r.r);out tags;`;
  const data = (await overpassFetch(q)) as {
    elements: Array<{
      type: string;
      id?: number;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
      members?: Array<{ type: string; ref?: number; role?: string; geometry?: Array<{ lat: number; lon: number }> }>;
    }>;
  };
  const nodeInfo = new Map<number, { name: string; ll: LL }>();
  for (const el of data.elements) {
    if (el.type === "node" && typeof el.id === "number" && el.tags?.name && typeof el.lat === "number" && typeof el.lon === "number") {
      nodeInfo.set(el.id, { name: el.tags.name, ll: [el.lat, el.lon] });
      registerEnName(el.tags.name, el.tags["name:en"] || el.tags["int_name"]);
    }
  }
  let best: TransitLine = empty;
  for (const el of data.elements) {
    if (el.type !== "relation" || !el.members) continue;
    const ways = el.members
      .filter((m) => m.type === "way" && Array.isArray(m.geometry))
      .map((m) => (m.geometry as Array<{ lat: number; lon: number }>).map((g) => [g.lat, g.lon] as LL));
    const path = stitchWays(ways);
    const stops: Array<{ name: string; ll: LL }> = [];
    const seen = new Set<string>();
    for (const m of el.members) {
      const role = m.role ?? "";
      if (!(role.startsWith("stop") || role.startsWith("platform"))) continue;
      if (m.type !== "node" || typeof m.ref !== "number") continue;
      const info = nodeInfo.get(m.ref);
      if (!info) continue;
      const k = info.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k); stops.push(info);
    }
    if (path.length + stops.length > best.path.length + best.stops.length) best = { path, stops };
  }
  return best;
}

// Accent/space-insensitive stop-name matcher against the relation's own stops.
const _normName = (s: string) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, "");
function matchStop(stops: Array<{ name: string; ll: LL }>, raw: string): { name: string; ll: LL } | null {
  const q = _normName(cleanPlace(raw));
  if (!q) return null;
  return stops.find((s) => {
    const n = _normName(s.name);
    return n === q || n.includes(q) || q.includes(n);
  }) ?? null;
}

function nearestIdx(path: LL[], pt: LL): number {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < path.length; i++) {
    const dx = path[i][0] - pt[0];
    const dy = path[i][1] - pt[1];
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Keep only the portion of the line between the boarding and alighting stops.
function trimPath(path: LL[], a: LL, b: LL): LL[] {
  if (path.length < 2) return path;
  let i = nearestIdx(path, a);
  let j = nearestIdx(path, b);
  if (i > j) { const t = i; i = j; j = t; }
  const seg = path.slice(i, j + 1);
  return seg.length >= 2 ? seg : path;
}

// Free-form geocoder for route endpoints (airports, stations, stops, streets).
// geocodeCity() is city-structured and fails on these, so we hit Nominatim's
// search endpoint with the full place name (+ an optional country filter).
const AIRPORT_RE = /(airport|aeroporto|aeropuerto|aéroport|aeroport|flughafen|repülőtér|luchthaven|lotnisko|공항|空港|机场|機場)/i;

async function geocodePlace(query: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const isAirport = AIRPORT_RE.test(q);
  try {
    const params = new URLSearchParams({ q, format: "json", limit: isAirport ? "5" : "1", addressdetails: "0" });
    if (country) params.set("countrycodes", country.toLowerCase());
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const hits = (await r.json()) as Array<{ lat: string; lon: string; class?: string; type?: string }>;
    if (!Array.isArray(hits) || hits.length === 0) return null;
    // For airports, prefer an actual aerodrome feature over the host city.
    const hit = isAirport
      ? (hits.find((h) => h.class === "aeroway" || h.type === "aerodrome") ?? hits[0])
      : hits[0];
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch { /* ignore */ }
  return null;
}

// Custom pin so we don't depend on Leaflet's default marker images.
const pinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Strip IATA airport codes so a leg endpoint like "FCO - Roma" or
// "Bologna Guglielmo Marconi Airport (BLQ)" geocodes on its real place name.
function cleanPlace(s: string): string {
  return (s ?? "")
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .replace(/^[A-Z]{3}\s*-\s*/, "")
    .trim();
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 5, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [32, 32], maxZoom: 6 });
  }, [map, points]);
  return null;
}

export function TripMap({
  cities,
  countries,
  routes,
  showRoutes,
  className,
  noTiles,
  compact,
  lang,
}: {
  cities: MapCity[];
  countries?: string[];
  routes?: MapRoute[];
  showRoutes?: boolean;
  className?: string;
  noTiles?: boolean;
  compact?: boolean;
  lang?: string;
}) {
  // Async geocoding cache for cities without stored coords.
  // Value is null when geocoding failed (explicit failure, not "pending").
  const [geoCache, setGeoCache] = useState<Record<string, { lat: number; lng: number } | null>>({});
  // Separate cache for route endpoints (geocoded free-form via geocodePlace).
  const [routeGeo, setRouteGeo] = useState<Record<string, { lat: number; lng: number } | null>>({});
  // Road-snapped geometries per leg (keyed by the leg key), from OSRM.
  const [pathCache, setPathCache] = useState<Record<string, [number, number][]>>({});
  // Real transit-line geometries keyed by `city|mode|ref`, from OSM/Overpass.
  const [transitPathCache, setTransitPathCache] = useState<Record<string, TransitLine>>({});

  // Unique route endpoints that need geocoding (only when routes are shown).
  const routeEndpoints = useMemo<Array<{ name: string; country?: string }>>(() => {
    if (!showRoutes || !routes || routes.length === 0) return [];
    const seen = new Map<string, { name: string; country?: string }>();
    for (const r of routes) {
      // Transit legs with a line ref use OSM relation geometry, not geocoding.
      if (TRANSIT_MODES.has(r.mode) && r.line && r.city) continue;
      for (const raw of [r.from, r.to]) {
        const name = cleanPlace(raw);
        if (!name) continue;
        const key = `${r.country ?? ""}|${name}`;
        if (!seen.has(key)) seen.set(key, { name, country: r.country });
      }
    }
    return [...seen.values()];
  }, [routes, showRoutes]);

  // Geocode missing city coordinates (city-structured lookup).
  useEffect(() => {
    const missing = cities.filter(
      (c) => typeof c.lat !== "number" || typeof c.lng !== "number",
    );
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { lat: number; lng: number } | null> = {};
      for (const city of missing) {
        const key = `${city.country}|${city.name}`;
        if (key in geoCache || key in updates) continue;
        updates[key] = await geocodeCity(city.name, city.country);
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeoCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities]);

  // Geocode route endpoints (free-form: airports/stations/stops/streets).
  useEffect(() => {
    if (routeEndpoints.length === 0) return;
    const missing = routeEndpoints.filter((e) => !(`${e.country ?? ""}|${e.name}` in routeGeo));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { lat: number; lng: number } | null> = {};
      for (const e of missing) {
        const key = `${e.country ?? ""}|${e.name}`;
        if (key in routeGeo || key in updates) continue;
        updates[key] = await geocodePlace(e.name, e.country);
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setRouteGeo((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEndpoints]);

  // Enrich cities with geocoded coordinates when stored coords are missing.
  const enrichedCities = useMemo<MapCity[]>(() => {
    return cities.map((c) => {
      if (typeof c.lat === "number" && typeof c.lng === "number") return c;
      const key = `${c.country}|${c.name}`;
      const cached = geoCache[key];
      if (cached) return { ...c, lat: cached.lat, lng: cached.lng };
      if (key in geoCache && geoCache[key] === null) {
        const centroid = COUNTRY_CENTROIDS[c.country?.toUpperCase()];
        if (centroid) return { ...c, lat: centroid[0], lng: centroid[1] };
      }
      return c;
    });
  }, [cities, geoCache]);

  const points = useMemo<[number, number][]>(
    () =>
      enrichedCities
        .filter(
          (c): c is Required<Pick<MapCity, "lat" | "lng">> & MapCity =>
            typeof c.lat === "number" && typeof c.lng === "number",
        )
        .map((c) => [c.lat, c.lng]),
    [enrichedCities],
  );

  // Resolve a route endpoint to coordinates (geocode → centroid fallback).
  const resolve = useMemo(() => {
    return (raw: string, country?: string): [number, number] | null => {
      const name = cleanPlace(raw);
      const key = `${country ?? ""}|${name}`;
      const cached = routeGeo[key];
      if (cached) return [cached.lat, cached.lng];
      if (key in routeGeo && routeGeo[key] === null && country) {
        const centroid = COUNTRY_CENTROIDS[country.toUpperCase()];
        if (centroid) return centroid;
      }
      return null;
    };
  }, [routeGeo]);

  // Leg list used by the fetch effects (endpoints may be null until geocoded).
  const routeLines = useMemo(() => {
    type Line = { a: LL | null; b: LL | null; mode: string; from: string; to: string; line?: string; city?: string; key: string };
    if (!showRoutes || !routes) return [] as Line[];
    return routes.map((r, i) => ({
      a: resolve(r.from, r.country),
      b: resolve(r.to, r.country),
      mode: r.mode,
      from: r.from,
      to: r.to,
      line: r.line,
      city: r.city,
      key: `${i}-${r.from}-${r.to}`,
    }));
  }, [routes, showRoutes, resolve]);

  // Snap ground legs (car/moto/bus/metro/tram/train/transfer) to real roads via
  // OSRM so they follow streets instead of drawing straight, angular lines.
  useEffect(() => {
    const pending = routeLines.filter((l) => GROUND_MODES.has(l.mode) && l.a && l.b && !(l.key in pathCache));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchRoadPath(l.a!, l.b!);
        if (path) updates[l.key] = path;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setPathCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines]);

  // Fetch exact OSM geometry for transit legs that carry a line ref + city.
  useEffect(() => {
    const todo = routeLines.filter(
      (l) => TRANSIT_MODES.has(l.mode) && l.line && l.city && !(`${l.city}|${l.mode}|${l.line}` in transitPathCache),
    );
    if (todo.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, TransitLine> = {};
      for (const l of todo) {
        const key = `${l.city}|${l.mode}|${l.line}`;
        if (key in transitPathCache || key in updates) continue;
        try {
          updates[key] = await fetchTransitGeometry(l.city!, l.mode, l.line!);
        } catch {
          updates[key] = { path: [], stops: [] };
        }
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setTransitPathCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines]);

  // Resolve each leg's final drawn geometry + coloured stop pins. Transit legs
  // use the OSM relation (trimmed between the matched stops); ground legs use
  // the OSRM road path; everything else is a straight line. Pins sit on the
  // line endpoints so they always coincide with the drawn route.
  const drawn = useMemo(() => {
    type Drawn = { key: string; color: string; dash?: string; positions: LL[]; pins: LL[]; names: string[] };
    if (!showRoutes || !routes) return [] as Drawn[];
    const out: Drawn[] = [];
    routes.forEach((r, i) => {
      const key = `${i}-${r.from}-${r.to}`;
      const { color, dash } = modeStyle(r.mode);
      if (TRANSIT_MODES.has(r.mode) && r.line && r.city) {
        const data = transitPathCache[`${r.city}|${r.mode}|${r.line}`];
        if (!data || data.path.length < 2) return; // pending/unavailable → don't draw a wrong line
        const fromStop = matchStop(data.stops, r.from);
        const toStop = matchStop(data.stops, r.to);
        if (fromStop && toStop) {
          out.push({
            key, color, dash,
            positions: trimPath(data.path, fromStop.ll, toStop.ll),
            pins: [fromStop.ll, toStop.ll],
            names: [fromStop.name, toStop.name],
          });
        } else {
          out.push({
            key, color, dash,
            positions: data.path,
            pins: [data.path[0], data.path[data.path.length - 1]],
            names: [cleanPlace(r.from), cleanPlace(r.to)],
          });
        }
        return;
      }
      const a = resolve(r.from, r.country);
      const b = resolve(r.to, r.country);
      if (!a || !b) return;
      let positions: LL[] = [a, b];
      if (GROUND_MODES.has(r.mode) && pathCache[key]) positions = pathCache[key];
      out.push({
        key, color, dash, positions,
        pins: [positions[0], positions[positions.length - 1]],
        names: [cleanPlace(r.from), cleanPlace(r.to)],
      });
    });
    return out;
  }, [routes, showRoutes, transitPathCache, pathCache, resolve]);

  // Country centroid fallback when ALL cities have no coordinates.
  const fallbackPoints = useMemo<[number, number][]>(() => {
    if (points.length > 0) return [];
    const isos =
      countries && countries.length > 0
        ? countries
        : Array.from(new Set(enrichedCities.map((c) => c.country))).filter(Boolean);
    return isos
      .map((iso) => COUNTRY_CENTROIDS[iso.toUpperCase()])
      .filter((pt): pt is [number, number] => !!pt);
  }, [points.length, countries, enrichedCities]);

  const ref = useRef<L.Map | null>(null);
  const cityPoints = points.length > 0 ? points : fallbackPoints;
  // When showing routes, fit the view to include every leg endpoint too.
  const boundsPoints = useMemo<[number, number][]>(
    () => (showRoutes ? [...cityPoints, ...drawn.flatMap((d) => d.positions)] : cityPoints),
    [cityPoints, drawn, showRoutes],
  );

  if (boundsPoints.length === 0) {
    return (
      <div
        className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className ?? ""}`}
      >
        Nessuna coordinata disponibile
      </div>
    );
  }

  return (
    <MapContainer
      ref={ref}
      center={boundsPoints[0]}
      zoom={5}
      scrollWheelZoom
      dragging
      doubleClickZoom
      touchZoom
      boxZoom
      keyboard
      attributionControl={false}
      zoomControl={!compact}
      className={className}
      style={{ background: "transparent" }}
    >
      {!noTiles && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      )}

      {showRoutes &&
        drawn.map((d) => (
          <Polyline
            key={d.key}
            positions={d.positions}
            pathOptions={{ color: d.color, weight: 3, opacity: 0.9, dashArray: d.dash }}
          />
        ))}

      {/* Stop pins — coloured like the mode, placed on the drawn line's ends */}
      {showRoutes &&
        drawn.flatMap((d) =>
          d.pins.map((pt, idx) => (
            <CircleMarker
              key={`${d.key}-p${idx}`}
              center={pt}
              radius={5}
              pathOptions={{ color: "#ffffff", weight: 2, fillColor: d.color, fillOpacity: 1 }}
            >
              {d.names[idx] && (
                <Tooltip direction="top" offset={[0, -6]}>
                  {withRomanization(d.names[idx], lang)}
                </Tooltip>
              )}
            </CircleMarker>
          )),
        )}

      {enrichedCities
        .filter(
          (c): c is Required<Pick<MapCity, "lat" | "lng">> & MapCity =>
            typeof c.lat === "number" && typeof c.lng === "number",
        )
        .map((c, i) => (
          <Marker
            key={`${c.country}-${c.name}-${i}`}
            position={[c.lat, c.lng]}
            icon={pinIcon}
          >
            <Popup>
              <strong>{withRomanization(c.name, lang)}</strong>
            </Popup>
            <Tooltip direction="top" offset={[0, -8]}>
              {withRomanization(c.name, lang)}
            </Tooltip>
          </Marker>
        ))}
      <FitBounds points={boundsPoints} />
    </MapContainer>
  );
}
