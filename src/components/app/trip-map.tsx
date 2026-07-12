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

export type TransitStop = { name: string; ll: LL };
export type TransitVariant = { path: LL[]; stops: TransitStop[] };
// One entry per matching route relation (each direction/variant of the line).
export type TransitLine = { variants: TransitVariant[] };

// Fetch the real OSM geometry of a transit line: for each route relation
// (direction/variant) its track polyline PLUS the ordered stops (name +
// coordinates) read straight from the relation — so both the path and the stop
// positions are the real ones, never guessed via global geocoding.
async function fetchTransitGeometry(city: string, mode: string, ref: string): Promise<TransitLine> {
  const osmMode = OSM_ROUTE_MODE[mode];
  if (!osmMode || !city || !ref) return { variants: [] };
  const areaQ = await getAreaQuery(city);
  const modes = osmMode === "subway" ? ["subway", "metro"] : [osmMode];
  const clauses = modes
    .map((m) => `relation["type"="route"]["route"="${m}"]["ref"="${ref}"](area.c)`)
    .join(";");
  // `.r out geom` → member way geometries; `node(r.r) out tags` → member node
  // names (name / name:en) with coordinates for the stops.
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
  const variants: TransitVariant[] = [];
  for (const el of data.elements) {
    if (el.type !== "relation" || !el.members) continue;
    // Track ways only (exclude platform/stop_area ways) so the drawn line
    // follows the rails/road and doesn't detour into platform polygons.
    const ways = el.members
      .filter((m) => m.type === "way" && Array.isArray(m.geometry) && !(m.role ?? "").startsWith("platform"))
      .map((m) => (m.geometry as Array<{ lat: number; lon: number }>).map((g) => [g.lat, g.lon] as LL));
    const path = stitchWays(ways);
    // Ordered, de-duplicated stops (from stop / platform node members).
    const stops: TransitStop[] = [];
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
    if (path.length >= 2 || stops.length > 0) variants.push({ path, stops });
  }
  return { variants };
}

// Accent/space-insensitive stop-name comparison.
const _normName = (s: string) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, "");
function sameStop(a: string, b: string): boolean {
  const x = _normName(cleanPlace(a));
  const y = _normName(cleanPlace(b));
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
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

async function geocodePlace(query: string, country?: string, airportHint = false): Promise<{ lat: number; lng: number } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const isAirport = airportHint || AIRPORT_RE.test(q);
  // Bias the search toward the airport itself (not the host city) when the
  // label doesn't already say "airport".
  const searchQ = isAirport && !AIRPORT_RE.test(q) ? `${q} airport` : q;
  try {
    const params = new URLSearchParams({ q: searchQ, format: "json", limit: isAirport ? "8" : "1", addressdetails: "0" });
    if (country) params.set("countrycodes", country.toLowerCase());
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const hits = (await r.json()) as Array<{ lat: string; lon: string; class?: string; type?: string }>;
    if (!Array.isArray(hits) || hits.length === 0) return null;
    // For airports, prefer an actual aerodrome feature over the host city/river.
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

// Localised notice shown when some transit legs can't be drawn from OSM data.
function transitNotice(lang: string | undefined, n: number): string {
  const l = (lang || "en").slice(0, 2);
  const M: Record<string, [string, string]> = {
    it: ["tratta non tracciabile (dati mappa mancanti)", "tratte non tracciabili (dati mappa mancanti)"],
    en: ["leg couldn't be mapped (missing map data)", "legs couldn't be mapped (missing map data)"],
    es: ["tramo no trazable (faltan datos del mapa)", "tramos no trazables (faltan datos del mapa)"],
    fr: ["trajet non traçable (données manquantes)", "trajets non traçables (données manquantes)"],
    de: ["Abschnitt nicht darstellbar (Kartendaten fehlen)", "Abschnitte nicht darstellbar (Kartendaten fehlen)"],
    pt: ["trecho não traçável (faltam dados do mapa)", "trechos não traçáveis (faltam dados do mapa)"],
    ja: ["区間を地図に表示できません（地図データ不足）", "区間を地図に表示できません（地図データ不足）"],
    ko: ["구간을 지도에 표시할 수 없음(지도 데이터 없음)", "구간을 지도에 표시할 수 없음(지도 데이터 없음)"],
    zh: ["段无法绘制（缺少地图数据）", "段无法绘制（缺少地图数据）"],
  };
  const [one, many] = M[l] ?? M.en;
  return `${n} ${n === 1 ? one : many}`;
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

  // Unique route endpoints to geocode. Transit endpoints are included too, as a
  // FALLBACK when the stop can't be matched by name inside the OSM relation.
  const routeEndpoints = useMemo<Array<{ name: string; country?: string; airport: boolean }>>(() => {
    if (!showRoutes || !routes || routes.length === 0) return [];
    const seen = new Map<string, { name: string; country?: string; airport: boolean }>();
    for (const r of routes) {
      const airport = r.mode === "plane";
      for (const raw of [r.from, r.to]) {
        const name = cleanPlace(raw);
        if (!name) continue;
        const key = `${r.country ?? ""}|${name}`;
        const prev = seen.get(key);
        if (!prev) seen.set(key, { name, country: r.country, airport });
        else if (airport) prev.airport = true;
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
        updates[key] = await geocodePlace(e.name, e.country, e.airport);
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
          updates[key] = { variants: [] };
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
    type Pin = { ll: LL; name: string; big: boolean };
    type Drawn = { key: string; color: string; dash?: string; positions: LL[]; pins: Pin[] };
    if (!showRoutes || !routes) return [] as Drawn[];
    const out: Drawn[] = [];
    routes.forEach((r, i) => {
      const key = `${i}-${r.from}-${r.to}`;
      const { color, dash } = modeStyle(r.mode);

      if (TRANSIT_MODES.has(r.mode) && r.line && r.city) {
        const tl = transitPathCache[`${r.city}|${r.mode}|${r.line}`];
        if (!tl || tl.variants.length === 0) return; // still loading / no data
        // Use the variant with the longest track as the line geometry.
        let v = tl.variants[0];
        for (const cand of tl.variants) if (cand.path.length > v.path.length) v = cand;
        // Boarding/alighting: prefer the relation's own stop (exact), otherwise
        // fall back to geocoding the stop name (this is what worked before).
        const fMatch = v.stops.find((s) => sameStop(s.name, r.from));
        const tMatch = v.stops.find((s) => sameStop(s.name, r.to));
        const board = fMatch?.ll ?? resolve(r.from, r.country);
        const alight = tMatch?.ll ?? resolve(r.to, r.country);
        if (!board || !alight) return; // endpoints not resolvable yet → skip (may warn)
        const boardName = fMatch?.name ?? cleanPlace(r.from);
        const alightName = tMatch?.name ?? cleanPlace(r.to);
        let positions: LL[] = [board, alight];
        let mids: TransitStop[] = [];
        if (v.path.length >= 2) {
          positions = trimPath(v.path, board, alight);
          const lo = Math.min(nearestIdx(v.path, board), nearestIdx(v.path, alight));
          const hi = Math.max(nearestIdx(v.path, board), nearestIdx(v.path, alight));
          mids = v.stops
            .filter((s) => {
              const k = nearestIdx(v.path, s.ll);
              return k > lo && k < hi && !sameStop(s.name, r.from) && !sameStop(s.name, r.to);
            })
            .sort((a2, b2) => nearestIdx(v.path, a2.ll) - nearestIdx(v.path, b2.ll));
        }
        const pins: Pin[] = [
          { ll: board, name: boardName, big: true },
          ...mids.map((s) => ({ ll: s.ll, name: s.name, big: false })),
          { ll: alight, name: alightName, big: true },
        ];
        out.push({ key, color, dash, positions, pins });
        return;
      }

      // Non-transit legs → geocoded endpoints (+ OSRM road path for car/moto).
      const a = resolve(r.from, r.country);
      const b = resolve(r.to, r.country);
      if (!a || !b) return;
      let positions: LL[] = [a, b];
      if (GROUND_MODES.has(r.mode) && pathCache[key]) positions = pathCache[key];
      out.push({
        key, color, dash, positions,
        pins: [
          { ll: positions[0], name: cleanPlace(r.from), big: true },
          { ll: positions[positions.length - 1], name: cleanPlace(r.to), big: true },
        ],
      });
    });
    return out;
  }, [routes, showRoutes, transitPathCache, pathCache, resolve]);

  // Count transit legs that were loaded but couldn't be placed on the map
  // (missing OSM line data / stop not found) so we can warn the user.
  const missingTransit = useMemo(() => {
    if (!showRoutes || !routes) return 0;
    // "fail" = name not in relation AND geocoding returned null (not pending).
    const endpointFailed = (raw: string, country: string | undefined, stops: TransitStop[]) => {
      if (stops.some((s) => sameStop(s.name, raw))) return false;
      const k = `${country ?? ""}|${cleanPlace(raw)}`;
      return k in routeGeo && routeGeo[k] === null;
    };
    let n = 0;
    for (const r of routes) {
      if (!(TRANSIT_MODES.has(r.mode) && r.line && r.city)) continue;
      const tl = transitPathCache[`${r.city}|${r.mode}|${r.line}`];
      if (!tl) continue; // still loading — don't warn yet
      const stops = tl.variants.flatMap((v) => v.stops);
      if (endpointFailed(r.from, r.country, stops) || endpointFailed(r.to, r.country, stops)) n++;
    }
    return n;
  }, [routes, showRoutes, transitPathCache, routeGeo]);

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
    <div className={className}>
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
      className="h-full w-full"
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

      {/* Stop pins — mode colour. Boarding/alighting are larger; intermediate
          stops along the leg are small dots. */}
      {showRoutes &&
        drawn.flatMap((d) =>
          d.pins.map((p, idx) => (
            <CircleMarker
              key={`${d.key}-p${idx}`}
              center={p.ll}
              radius={p.big ? 6.5 : 3.5}
              pathOptions={{ color: "#ffffff", weight: p.big ? 2 : 1.5, fillColor: d.color, fillOpacity: 1 }}
            >
              {p.name && (
                <Tooltip direction="top" offset={[0, -6]}>
                  {withRomanization(p.name, lang)}
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
      {showRoutes && missingTransit > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex justify-center p-2">
          <div className="pointer-events-auto max-w-[92%] truncate rounded-full bg-background/85 px-3 py-1 text-[11px] text-muted-foreground shadow-soft backdrop-blur">
            {transitNotice(lang, missingTransit)}
          </div>
        </div>
      )}
    </div>
  );
}
