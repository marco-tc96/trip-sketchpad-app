import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeCity } from "@/lib/country-data";
import { withRomanization, registerEnName } from "@/lib/romanize";

export type MapCity = { name: string; country: string; lat?: number; lng?: number };
export type MapWaypoint = { name: string; enter?: boolean; lat?: number | null; lng?: number | null; country?: string | null };
export type MapRoute = { from: string; to: string; mode: string; country?: string; line?: string; city?: string; waypoints?: MapWaypoint[] };

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
// Per-mode colours for journey markers/lines — deliberately different from the
// standard trip-city pin (PRIMARY) so a leg's departure/arrival is always
// visually distinct from the city markers. Metro falls back to violet only
// when the line's real OSM colour couldn't be resolved (see `drawn`, which
// prefers the fetched line colour when available).
const MODE_STYLE: Record<string, { color: string; dash?: string }> = {
  car:      { color: "#22c55e" },              // green-500 — macchina
  moto:     { color: "#22c55e" },              // green-500 — moto
  plane:    { color: "#38bdf8", dash: "2 8" }, // sky-400 (azzurro), dotted
  train:    { color: "#6b7280" },              // gray-500 — treno
  taxi:     { color: "#eab308" },              // yellow-500 — taxi
  bus:      { color: "#2563eb" },              // blue-600 — bus
  metro:    { color: "#8b5cf6" },              // violet-500 fallback (real line colour preferred)
  tram:     { color: "#10b981" },              // emerald-500
  ferry:    { color: "#0d9488", dash: "8 6" }, // teal-600, dashed
  transfer: { color: "#64748b" },              // slate-500
};
const modeStyle = (mode: string) => MODE_STYLE[mode] ?? { color: PRIMARY };

// Ground modes whose path we snap to real roads via OSRM; plane/ferry stay
// straight (dotted/dashed) since there are no roads to follow.
const GROUND_MODES = new Set(["car", "moto"]);

// Squared planar distance — fine at road/rail/transit scale, avoids a sqrt.
function _distSq2(p: [number, number], q: [number, number]): number {
  const dx = p[0] - q[0], dy = p[1] - q[1];
  return dx * dx + dy * dy;
}
// A routing/track geometry should walk from `start` to `end` — never the
// opposite way (e.g. a "centro → aeroporto" leg must stay centro → aeroporto
// on the map, not draw the reverse trip). Flips the array when BOTH ends
// clearly indicate a reversal, so a route that's merely short (start/end close
// together) isn't misdiagnosed and flipped by mistake.
function orientPath(path: [number, number][], start: [number, number], end: [number, number]): [number, number][] {
  if (path.length < 2) return path;
  const startsNearEnd = _distSq2(path[0], end) < _distSq2(path[0], start);
  const endsNearStart = _distSq2(path[path.length - 1], start) < _distSq2(path[path.length - 1], end);
  return startsNearEnd && endsNearStart ? path.slice().reverse() : path;
}

// Ask OSRM for a road-following geometry through an ordered list of points
// (start, optional waypoints, end). Returns the full polyline ([lat,lng][]) or
// null on failure (caller falls back to a straight line).
async function fetchRoadPathVia(points: [number, number][]): Promise<[number, number][] | null> {
  if (points.length < 2) return null;
  try {
    const coordStr = points.map((p) => `${p[1]},${p[0]}`).join(";");
    const url =
      `https://router.project-osrm.org/route/v1/driving/${coordStr}` +
      `?overview=full&geometries=geojson`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    };
    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      const path = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      // OSRM should already honour waypoint order (and one-way restrictions),
      // but guard against a reversed result regardless — the drawn road leg
      // must always match the real direction of travel, never the opposite.
      return orientPath(path, points[0], points[points.length - 1]);
    }
  } catch { /* ignore */ }
  return null;
}

// Snap a geocoded point onto the nearest real road via OSRM's "nearest" service,
// so a city pin never lands in the middle of a square/park/field away from any
// street. Returns the snapped coordinate, or null (caller keeps the original).
async function snapToRoad(lat: number, lng: number): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://router.project-osrm.org/nearest/v1/driving/${lng},${lat}?number=1`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as { waypoints?: Array<{ location?: [number, number] }> };
    const loc = data.waypoints?.[0]?.location;
    if (Array.isArray(loc) && loc.length === 2 && Number.isFinite(loc[0]) && Number.isFinite(loc[1])) {
      return { lat: loc[1], lng: loc[0] };
    }
  } catch { /* ignore — caller falls back to the unsnapped coordinate */ }
  return null;
}

// Ask BRouter (rail profile) for a railway-following geometry between two points,
// so train legs trace the actual tracks instead of a straight line. Returns the
// polyline ([lat,lng][]) or null on failure (caller falls back to a straight line).
async function fetchRailPath(
  a: [number, number],
  b: [number, number],
): Promise<[number, number][] | null> {
  try {
    const url =
      `https://brouter.de/brouter?lonlats=${a[1]},${a[0]}|${b[1]},${b[0]}` +
      `&profile=rail&alternativeidx=0&format=geojson`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      features?: Array<{ geometry?: { coordinates?: number[][] } }>;
    };
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      const path = coords.map((c) => [c[1], c[0]] as [number, number]);
      return orientPath(path, a, b);
    }
  } catch { /* ignore */ }
  return null;
}

// ── Real transit-line geometry (metro/tram/bus/train) from OSM via Overpass ──
const TRANSIT_MODES = new Set(["bus", "metro", "tram", "train"]);
// Each app mode maps to the OSM route=* values that can carry it. A "metro" line
// is tagged subway / light_rail / monorail depending on the city (e.g. Valencia's
// metro is light_rail in OSM), so we accept several and match the ref afterwards.
const OSM_ROUTE_MODES: Record<string, string[]> = {
  bus: ["bus"],
  metro: ["subway", "light_rail", "monorail", "metro"],
  tram: ["tram", "light_rail"],
  train: ["train", "light_rail"],
};
// A transit leg with a known line ref is located from its OSM relation (not by
// geocoding its stop names, which can collide with far-away towns).
const isTransitWithLine = (r: MapRoute) => TRANSIT_MODES.has(r.mode) && !!r.line;
// Radius (m) of the Overpass `around:` search per mode — a metro/tram network
// spans a metro area, regional trains reach much further.
const TRANSIT_RADIUS: Record<string, number> = { metro: 45000, tram: 30000, bus: 40000, train: 130000 };

// Normalise a line ref/name for tolerant comparison.
const _normRef = (s?: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const _digits = (s?: string | null) => (s ?? "").replace(/\D+/g, "");
// Candidate ref strings to try in the Overpass ref filter for a wanted line.
function refCandidates(ref: string): string[] {
  const t = (ref ?? "").trim();
  const s = new Set<string>();
  if (t) { s.add(t); s.add(t.toUpperCase()); s.add(t.replace(/\s+/g, "")); }
  const d = _digits(t);
  if (d) { s.add(d); s.add(`L${d}`); s.add(`Línea ${d}`); s.add(`Line ${d}`); }
  return [...s];
}
// Does an OSM relation (its ref/name tags) correspond to the wanted line?
function refMatches(relRef: string | undefined, relName: string | undefined, wanted: string): boolean {
  const wr = _normRef(wanted), wd = _digits(wanted);
  if (!wr) return true;
  if (relRef) {
    if (_normRef(relRef) === wr) return true;
    if (wd && _digits(relRef) === wd) return true;
  }
  if (relName && wd && _digits(relName) === wd) return true;
  return false;
}

const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

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
// `color` is the line's real reference colour (OSM `colour` tag on the route
// relation), when the network tags it — e.g. Milano M1's red, Roma B's blue.
export type TransitLine = { variants: TransitVariant[]; color?: string };

// Fetch the real OSM geometry of a transit line: for each route relation
// (direction/variant) its track polyline PLUS the ordered stops (name +
// coordinates) read straight from the relation — so both the path and the stop
// positions are the real ones, never guessed via global geocoding.
type OverpassEl = {
  type: string;
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  members?: Array<{ type: string; ref?: number; role?: string; geometry?: Array<{ lat: number; lon: number }> }>;
};

async function fetchTransitGeometry(center: LL, radiusM: number, mode: string, ref: string): Promise<TransitLine> {
  const osmModes = OSM_ROUTE_MODES[mode];
  if (!osmModes || !center || !ref) return { variants: [] };
  const cands = refCandidates(ref);
  // Search around the real (geocoded) stop coordinates instead of a city admin
  // area — the stored "city" is often a place/address that no boundary matches.
  const around = `(around:${Math.round(radiusM)},${center[0]},${center[1]})`;

  // `.r out geom` → member way geometries; `node(r.r) out body` → member node
  // NAMES *and coordinates* (out body includes lat/lon; out tags would drop them).
  const buildQuery = (withRef: boolean) => {
    const clauses: string[] = [];
    for (const m of osmModes) {
      if (withRef) {
        for (const rc of cands) clauses.push(`relation["type"="route"]["route"="${m}"]["ref"="${rc.replace(/"/g, "")}"]${around}`);
      } else {
        clauses.push(`relation["type"="route"]["route"="${m}"]${around}`);
      }
    }
    return `[out:json][timeout:60];(${clauses.join(";")};)->.r;.r out geom;node(r.r);out body;`;
  };

  const parse = (data: { elements: OverpassEl[] }): { variants: TransitVariant[]; color?: string } => {
    const nodeInfo = new Map<number, { name: string; ll: LL }>();
    for (const el of data.elements) {
      if (el.type === "node" && typeof el.id === "number" && el.tags?.name && typeof el.lat === "number" && typeof el.lon === "number") {
        nodeInfo.set(el.id, { name: el.tags.name, ll: [el.lat, el.lon] });
        registerEnName(el.tags.name, el.tags["name:en"] || el.tags["int_name"]);
      }
    }
    const variants: TransitVariant[] = [];
    let color: string | undefined;
    for (const el of data.elements) {
      if (el.type !== "relation" || !el.members) continue;
      // Keep only the relations that are actually the wanted line (the ref query
      // is permissive and the no-ref fallback returns the whole network).
      if (!refMatches(el.tags?.ref, el.tags?.name, ref)) continue;
      // Real reference colour of the line (OSM `colour` tag on the route
      // relation) — used to draw metro lines in their actual network colour
      // instead of a generic fixed one.
      if (!color) {
        const raw = (el.tags?.colour || el.tags?.color || "").trim();
        if (raw) color = /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : raw;
      }
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
    return { variants, color };
  };

  let res = parse((await overpassFetch(buildQuery(true))) as { elements: OverpassEl[] });
  // Rail networks are small enough to fetch wholesale and match client-side when
  // the ref filter missed (OSM uses a different ref format). Buses are too many.
  if (res.variants.length === 0 && mode !== "bus") {
    try { res = parse((await overpassFetch(buildQuery(false))) as { elements: OverpassEl[] }); } catch { /* keep as-is */ }
  }
  return { variants: res.variants, color: res.color };
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
// True when two strings differ by at most one edit (insertion/deletion/substitution).
function _within1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return diff + (la - i) + (lb - j) <= 1;
}
// Looser match for spelling variants of the same stop (e.g. "Roses"/"Rosas").
function similarStop(a: string, b: string): boolean {
  const x = _normName(cleanPlace(a)), y = _normName(cleanPlace(b));
  if (x.length < 5 || y.length < 5) return false;
  return _within1(x, y);
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
// Index of the relation stop whose coordinates are nearest a given point.
function nearestStopIdx(stops: TransitStop[], pt: LL): number {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const dx = stops[i].ll[0] - pt[0], dy = stops[i].ll[1] - pt[1];
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
// Squared distance from a point to the closest vertex of a polyline.
function minDistSq(path: LL[], pt: LL): number {
  let bd = Infinity;
  for (const p of path) { const dx = p[0] - pt[0], dy = p[1] - pt[1]; const d = dx * dx + dy * dy; if (d < bd) bd = d; }
  return bd;
}
// Closest point of segment a→b to p (planar; fine at city scale).
function closestOnSegment(p: LL, a: LL, b: LL): LL {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + t * dx, a[1] + t * dy];
}
// Project a point onto the nearest point of a polyline so a stop pin sits exactly
// on the drawn line (bus stop nodes in OSM sit at the kerb, off the road centre).
function projectOnPath(path: LL[], pt: LL): LL {
  if (path.length === 0) return pt;
  if (path.length === 1) return path[0];
  let best = pt, bd = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const c = closestOnSegment(pt, path[i], path[i + 1]);
    const dx = c[0] - pt[0], dy = c[1] - pt[1], d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
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

// Fast, rate-limit-friendly geocoder (Photon) for cities/stations/streets.
async function photonGeocode(query: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  const qq = (query ?? "").replace(/\s*\/\s*/g, " ").trim();
  if (!qq) return null;
  try {
    const params = new URLSearchParams({ q: qq, limit: "1" });
    const r = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const data = (await r.json()) as {
      features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } }>;
    };
    for (const f of data.features ?? []) {
      const c = f.geometry?.coordinates;
      if (!c) continue;
      // If a country hint was given, prefer a matching result but don't hard-fail.
      if (country && (f.properties?.countrycode || "").toUpperCase() !== country.toUpperCase()) continue;
      return { lat: c[1], lng: c[0] };
    }
    const c0 = data.features?.[0]?.geometry?.coordinates;
    if (c0) return { lat: c0[1], lng: c0[0] };
  } catch { /* ignore */ }
  return null;
}

// Pull the 3-letter IATA code out of a flight endpoint label, e.g.
// "BLQ - Bologna", "Bologna Guglielmo Marconi Airport (BLQ)".
function extractIATA(label: string): string | null {
  const s = label ?? "";
  const paren = s.match(/\(([A-Z]{3})\)/);
  if (paren) return paren[1];
  const prefix = s.match(/^([A-Z]{3})\s*[-–]\s/);
  if (prefix) return prefix[1];
  return null;
}

// Exact airport coordinates from OSM by IATA code (the aerodrome feature).
async function fetchAirportByIata(code: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = `[out:json][timeout:25];(node["aeroway"="aerodrome"]["iata"="${code}"];way["aeroway"="aerodrome"]["iata"="${code}"];relation["aeroway"="aerodrome"]["iata"="${code}"];);out center 1;`;
    const data = (await overpassFetch(q, 15000)) as {
      elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number } }>;
    };
    const e = data.elements?.[0];
    if (!e) return null;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  } catch { /* ignore */ }
  return null;
}

async function geocodePlace(query: string, country?: string, airportHint = false, iata?: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  const isAirport = airportHint || AIRPORT_RE.test(q);
  // Airports: the IATA code gives an exact, unambiguous location — try it first.
  if (isAirport && iata) {
    const byIata = await fetchAirportByIata(iata);
    if (byIata) return byIata;
  }
  // Non-airport places (cities/stations/streets): use Photon first — it's fast and
  // isn't rate-limited like Nominatim, which under many parallel lookups returns
  // nothing for some places (e.g. a plain "Verona"), leaving legs undrawn.
  if (!isAirport) {
    const ph = await photonGeocode(q, country);
    if (ph) return ph;
  }
  // Clean up messy labels ("Seoul / Incheon International Airport") and bias the
  // search toward the airport itself when the label doesn't say "airport".
  const cleaned = q.replace(/\s*\/\s*/g, " ").trim();
  const searchQ = isAirport && !AIRPORT_RE.test(cleaned) ? `${cleaned} airport` : cleaned;
  try {
    const params = new URLSearchParams({ q: searchQ, format: "json", limit: isAirport ? "10" : "1", addressdetails: "0" });
    if (country && !isAirport) params.set("countrycodes", country.toLowerCase());
    const r = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const hits = (await r.json()) as Array<{ lat: string; lon: string; class?: string; type?: string }>;
    if (!Array.isArray(hits) || hits.length === 0) return null;
    // For airports, prefer the actual aerodrome feature over the host city/river.
    const hit = isAirport
      ? (hits.find((h) => h.class === "aeroway" && h.type === "aerodrome")
          ?? hits.find((h) => h.class === "aeroway")
          ?? hits.find((h) => h.type === "aerodrome")
          ?? hits[0])
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

// ── Lightweight cross-navigation caches ──────────────────────────────────────
// These module-level maps survive React unmount/remount, so returning to a map /
// trip / home page reuses what was already fetched instead of reloading from
// scratch. Geocoding results are tiny and also persisted to localStorage so a
// full page reload stays fast; the heavier geometry (Overpass/road/rail lines)
// is kept in memory only, to avoid weighing down client storage.
type Coord = { lat: number; lng: number } | null;
const memGeoCity = new Map<string, Coord>();   // city markers      (geoCache)
const memGeoRoute = new Map<string, Coord>();  // route endpoints   (routeGeo)
const memGeoCtr = new Map<string, Coord>();    // transit centres   (cityGeo)
const memTransit = new Map<string, TransitLine>();
const memRoad = new Map<string, LL[]>();
const memRail = new Map<string, LL[]>();

const GEO_LS_KEY = "voyager_geocache_v2";
const GEO_CAP = 800; // max total geocoding entries kept (keeps storage tiny)
(function loadGeoCache() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(GEO_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as { city?: Record<string, Coord>; route?: Record<string, Coord>; ctr?: Record<string, Coord> };
    for (const [k, v] of Object.entries(o.city ?? {})) memGeoCity.set(k, v);
    for (const [k, v] of Object.entries(o.route ?? {})) memGeoRoute.set(k, v);
    for (const [k, v] of Object.entries(o.ctr ?? {})) memGeoCtr.set(k, v);
  } catch { /* ignore corrupt/unavailable storage */ }
})();

let _geoFlush: ReturnType<typeof setTimeout> | null = null;
function capMap<T>(m: Map<string, T>, cap: number) {
  while (m.size > cap) { const k = m.keys().next().value; if (k === undefined) break; m.delete(k); }
}
// Only successful lookups are persisted; failed (null) ones are dropped so a
// transient geocoding error isn't remembered forever and gets retried later.
function _successOnly(m: Map<string, Coord>): Record<string, Coord> {
  const o: Record<string, Coord> = {};
  for (const [k, v] of m) if (v) o[k] = v;
  return o;
}
function flushGeoCache() {
  try {
    if (typeof localStorage === "undefined") return;
    capMap(memGeoCity, GEO_CAP); capMap(memGeoRoute, GEO_CAP); capMap(memGeoCtr, GEO_CAP);
    localStorage.setItem(GEO_LS_KEY, JSON.stringify({
      city: _successOnly(memGeoCity),
      route: _successOnly(memGeoRoute),
      ctr: _successOnly(memGeoCtr),
    }));
  } catch { /* ignore quota errors */ }
}
// Merge freshly fetched values into a mem map (and debounce a localStorage write).
// Only successful lookups are kept, so a failed geocode is retried on the next
// navigation instead of being cached as a permanent failure.
function rememberGeo(m: Map<string, Coord>, updates: Record<string, Coord>) {
  let any = false;
  for (const [k, v] of Object.entries(updates)) if (v) { m.set(k, v); any = true; }
  if (!any) return;
  if (_geoFlush) clearTimeout(_geoFlush);
  _geoFlush = setTimeout(flushGeoCache, 1200);
}

// ── Persisted route-GEOMETRY cache (road/rail/transit lines) ────────────────
// Geocoding alone isn't what makes a cold load slow — the LINE GEOMETRY itself
// (OSRM road routing, BRouter rail tracing, Overpass transit relations) is the
// expensive part, and until now it only lived in the module-level Maps above,
// which reset on every full page reload. Persisting a size-capped, point-
// simplified copy to localStorage means a route already drawn once paints
// instantly on the next visit (even after closing the tab), while only truly
// new/changed legs go back to the network.
const ROUTE_LS_KEY = "voyager_routecache_v1";
const ROUTE_PERSIST_CAP = 60;   // max entries persisted per cache type (road/rail/transit)
const ROUTE_MAX_POINTS = 250;   // max points kept per polyline once persisted

// Evenly-spaced downsample — keeps the route's overall shape while bounding
// how much JSON we write to localStorage. The in-memory copy used for the
// current session stays full-resolution; only the persisted copy is thinned.
function simplifyLL(pts: LL[], maxPoints = ROUTE_MAX_POINTS): LL[] {
  if (!Array.isArray(pts) || pts.length <= maxPoints) return pts;
  const step = pts.length / maxPoints;
  const out: LL[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(pts[Math.floor(i * step)]);
  out.push(pts[pts.length - 1]);
  return out;
}
// Most-recently-added N entries of a Map, without mutating it (persistence
// caps are independent from the larger in-memory session caps below).
function lastEntries<T>(m: Map<string, T>, n: number): Array<[string, T]> {
  const arr = [...m.entries()];
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

(function loadRouteCache() {
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(ROUTE_LS_KEY);
    if (!raw) return;
    const o = JSON.parse(raw) as {
      road?: Record<string, LL[]>;
      rail?: Record<string, LL[]>;
      transit?: Record<string, TransitLine>;
    };
    for (const [k, v] of Object.entries(o.road ?? {})) memRoad.set(k, v);
    for (const [k, v] of Object.entries(o.rail ?? {})) memRail.set(k, v);
    for (const [k, v] of Object.entries(o.transit ?? {})) memTransit.set(k, v);
  } catch { /* ignore corrupt/unavailable storage */ }
})();

let _routeFlush: ReturnType<typeof setTimeout> | null = null;
function flushRouteCache() {
  try {
    if (typeof localStorage === "undefined") return;
    const road: Record<string, LL[]> = {};
    for (const [k, v] of lastEntries(memRoad, ROUTE_PERSIST_CAP)) road[k] = simplifyLL(v);
    const rail: Record<string, LL[]> = {};
    for (const [k, v] of lastEntries(memRail, ROUTE_PERSIST_CAP)) rail[k] = simplifyLL(v);
    const transit: Record<string, TransitLine> = {};
    for (const [k, v] of lastEntries(memTransit, ROUTE_PERSIST_CAP)) {
      transit[k] = {
        color: v.color,
        // Keep only the 2 richest variants (most stops) — enough to resolve
        // boarding/alighting on reload; rarer alternates are refetched if needed.
        variants: [...v.variants]
          .sort((a, b) => b.stops.length - a.stops.length)
          .slice(0, 2)
          .map((variant) => ({ path: simplifyLL(variant.path), stops: variant.stops })),
      };
    }
    localStorage.setItem(ROUTE_LS_KEY, JSON.stringify({ road, rail, transit }));
  } catch { /* ignore quota errors — the in-memory cache still speeds up this session */ }
}
function rememberRoute() {
  if (_routeFlush) clearTimeout(_routeFlush);
  _routeFlush = setTimeout(flushRouteCache, 1200);
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
  // All caches below are seeded from the module-level maps, so navigating away and
  // back (or between map/trip/home) reuses earlier results instead of refetching.
  // Async geocoding cache for cities without stored coords.
  // Value is null when geocoding failed (explicit failure, not "pending").
  const [geoCache, setGeoCache] = useState<Record<string, { lat: number; lng: number } | null>>(() => Object.fromEntries(memGeoCity));
  // Separate cache for route endpoints (geocoded free-form via geocodePlace).
  const [routeGeo, setRouteGeo] = useState<Record<string, { lat: number; lng: number } | null>>(() => Object.fromEntries(memGeoRoute));
  // Road-snapped geometries per leg (keyed by the leg key), from OSRM.
  const [pathCache, setPathCache] = useState<Record<string, [number, number][]>>(() => Object.fromEntries(memRoad));
  // Rail-snapped geometries per train leg (keyed by the leg key), from BRouter.
  const [railCache, setRailCache] = useState<Record<string, [number, number][]>>(() => Object.fromEntries(memRail));
  // Real transit-line geometries keyed by `mode|ref|center`, from OSM/Overpass.
  const [transitPathCache, setTransitPathCache] = useState<Record<string, TransitLine>>(() => Object.fromEntries(memTransit));
  // Geocoded city centres for transit-line searches, keyed by `${country}|${city}`.
  const [cityGeo, setCityGeo] = useState<Record<string, { lat: number; lng: number } | null>>(() => Object.fromEntries(memGeoCtr));

  // Unique endpoints to geocode for the legs we draw by geocoding (planes, cars,
  // ferries, and transit legs WITHOUT a line ref). Transit-with-line legs are
  // located from their OSM relation instead, so we skip their stops here.
  const routeEndpoints = useMemo<Array<{ name: string; country?: string; airport: boolean; iata?: string | null }>>(() => {
    // Geocode leg endpoints even in the "cities" view, so every leg endpoint (e.g.
    // a departure city that isn't in the trip's city list) can appear on the map.
    if (!routes || routes.length === 0) return [];
    const seen = new Map<string, { name: string; country?: string; airport: boolean; iata?: string | null }>();
    for (const r of routes) {
      if (isTransitWithLine(r)) continue;
      const airport = r.mode === "plane";
      const raws = [r.from, r.to];
      // Road-leg waypoints (car/moto) need geocoding ONLY when they don't already
      // carry coordinates (picked from suggestions).
      if (r.mode === "car" || r.mode === "moto")
        for (const w of (r.waypoints ?? [])) if (w.name && !(typeof w.lat === "number" && typeof w.lng === "number")) raws.push(w.name);
      for (const raw of raws) {
        const name = cleanPlace(raw);
        if (!name) continue;
        const key = `${r.country ?? ""}|${name}`;
        const iata = airport ? extractIATA(raw) : null;
        const prev = seen.get(key);
        if (!prev) seen.set(key, { name, country: r.country, airport, iata });
        else if (airport) { prev.airport = true; if (iata) prev.iata = iata; }
      }
    }
    return [...seen.values()];
  }, [routes, showRoutes]);

  // Unique cities of transit-with-line legs — geocoded to centre the OSM search.
  const transitCities = useMemo<Array<{ city: string; country?: string }>>(() => {
    if (!showRoutes || !routes) return [];
    const seen = new Map<string, { city: string; country?: string }>();
    for (const r of routes) {
      if (!isTransitWithLine(r) || !r.city) continue;
      const key = `${r.country ?? ""}|${r.city}`;
      if (!seen.has(key)) seen.set(key, { city: r.city, country: r.country });
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
        // Structured lookup first; if the town isn't in that table (e.g. Manises)
        // fall back to a free-form search before giving up (avoids the country
        // centroid placing small towns in the middle of the country).
        let coord = (await geocodeCity(city.name, city.country)) ?? (await geocodePlace(city.name, city.country));
        // City pins must always sit on a road, never in the middle of a square,
        // park or open field — snap the raw geocode onto the nearest street.
        if (coord) {
          const snapped = await snapToRoad(coord.lat, coord.lng);
          if (snapped) coord = snapped;
        }
        updates[key] = coord;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        rememberGeo(memGeoCity, updates);
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
        updates[key] = await geocodePlace(e.name, e.country, e.airport, e.iata);
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        rememberGeo(memGeoRoute, updates);
        setRouteGeo((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEndpoints]);

  // Geocode the cities that anchor transit-line searches.
  useEffect(() => {
    if (transitCities.length === 0) return;
    const missing = transitCities.filter((c) => !(`${c.country ?? ""}|${c.city}` in cityGeo));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { lat: number; lng: number } | null> = {};
      for (const c of missing) {
        const key = `${c.country ?? ""}|${c.city}`;
        if (key in cityGeo || key in updates) continue;
        updates[key] = await geocodePlace(c.city, c.country);
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        rememberGeo(memGeoCtr, updates);
        setCityGeo((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitCities]);

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

  // Trip cities keyed by normalised name, so a leg endpoint that matches one of the
  // trip's cities uses the SAME coordinate as its marker (avoids two mismatched
  // dots for the same place, e.g. a route end + a city pin geocoded differently).
  const cityByName = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const c of enrichedCities) {
      if (typeof c.lat === "number" && typeof c.lng === "number") {
        m.set(_normName(cleanPlace(c.name)), [c.lat, c.lng]);
      }
    }
    return m;
  }, [enrichedCities]);

  // Rounded coordinate keys of the trip's own city markers, so a leg endpoint that
  // lands on a trip city is NOT drawn as a second pin (the city marker stands in).
  const cityKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const c of enrichedCities) {
      if (typeof c.lat === "number" && typeof c.lng === "number") s.add(`${c.lat.toFixed(3)},${c.lng.toFixed(3)}`);
    }
    return s;
  }, [enrichedCities]);

  // Resolve a route endpoint to coordinates (trip city → geocode → centroid).
  const resolve = useMemo(() => {
    return (raw: string, country?: string): [number, number] | null => {
      const name = cleanPlace(raw);
      const byCity = cityByName.get(_normName(name));
      if (byCity) return byCity;
      const key = `${country ?? ""}|${name}`;
      const cached = routeGeo[key];
      if (cached) return [cached.lat, cached.lng];
      if (key in routeGeo && routeGeo[key] === null && country) {
        const centroid = COUNTRY_CENTROIDS[country.toUpperCase()];
        if (centroid) return centroid;
      }
      return null;
    };
  }, [routeGeo, cityByName]);

  // Leg list used by the fetch effects (endpoints may be null until geocoded).
  // For transit-with-line legs `center` is the geocoded CITY (reliable), never the
  // stop names (which can collide with far-away towns, e.g. "Roses" → Girona).
  const routeLines = useMemo(() => {
    // A via is a city stop (shown as a hollow pin) that pulls the OSRM route
    // through it, ordered along the trip.
    type Via = { ll: LL; label: string; pin: boolean };
    type Line = {
      a: LL | null; b: LL | null; mode: string; from: string; to: string;
      line?: string; city?: string; country?: string; key: string;
      center: LL | null; radiusM: number; cacheKey: string;
      vias: Via[]; viasReady: boolean; pathKey: string;
    };
    if (!showRoutes || !routes) return [] as Line[];
    return routes.map((r, i) => {
      let center: LL | null = null;
      const radiusM = TRANSIT_RADIUS[r.mode] ?? 40000;
      if (r.city) {
        const g = cityGeo[`${r.country ?? ""}|${r.city}`];
        if (g) center = [g.lat, g.lng];
      }
      const ck = center ? `${Math.round(center[0] * 100) / 100},${Math.round(center[1] * 100) / 100}` : "";
      const a = resolve(r.from, r.country);
      const b = resolve(r.to, r.country);
      // Build the road-leg vias (car/moto): city stops (with a pin).
      // `viasReady` waits for city coordinates.
      const vias: Via[] = [];
      let viasReady = true;
      if (r.mode === "car" || r.mode === "moto") {
        for (const w of (r.waypoints ?? [])) {
          const nm = cleanPlace(w.name);
          if (!nm) continue;
          if (typeof w.lat === "number" && typeof w.lng === "number") {
            vias.push({ ll: [w.lat, w.lng], label: nm, pin: true });
            continue;
          }
          const gk = `${r.country ?? ""}|${nm}`;
          if (!(gk in routeGeo)) { viasReady = false; continue; } // geocode pending
          const g = routeGeo[gk];
          if (g) vias.push({ ll: [g.lat, g.lng], label: nm, pin: true }); // null → skip
        }
        // Order vias from origin to destination (parametric position along a→b)
        // so OSRM traverses them sensibly.
        if (a && b) {
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const den = dx * dx + dy * dy || 1;
          const tOf = (p: LL) => ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / den;
          vias.sort((u, v) => tOf(u.ll) - tOf(v.ll));
        }
      }
      const key = `${i}-${r.from}-${r.to}`;
      return {
        a, b,
        mode: r.mode,
        from: r.from,
        to: r.to,
        line: r.line,
        city: r.city,
        country: r.country,
        key,
        center,
        radiusM,
        cacheKey: `${r.mode}|${r.line ?? ""}|${ck}`,
        vias,
        viasReady,
        pathKey: `${key}|${a ? `${a[0].toFixed(3)},${a[1].toFixed(3)}` : "?"}|${b ? `${b[0].toFixed(3)},${b[1].toFixed(3)}` : "?"}|${vias.map((v) => `${v.label}@${v.ll[0].toFixed(3)},${v.ll[1].toFixed(3)}`).join(">")}`,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, showRoutes, resolve, routeGeo, cityGeo]);

  // ── Auto-retry unresolved legs until the map is fully drawn ─────────────────
  // A transient OSRM/BRouter/Overpass hiccup shouldn't leave a leg permanently
  // undrawn (or a transit leg stuck on the "missing" notice) for the rest of the
  // session — `retryTick` re-triggers the three fetch effects below on a backoff
  // schedule until every leg resolves or a bounded retry budget is spent.
  const RETRY_MAX_ATTEMPTS = 6;
  const RETRY_DELAYS_MS = [3000, 5000, 8000, 12000, 20000, 30000];
  const retryAttemptRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const roadPending = useMemo(
    () => routeLines.filter((l) => GROUND_MODES.has(l.mode) && l.a && l.b && l.viasReady && !(l.pathKey in pathCache)).length,
    [routeLines, pathCache],
  );
  const railPending = useMemo(
    () => routeLines.filter((l) => l.mode === "train" && !l.line && l.a && l.b && !(l.key in railCache)).length,
    [routeLines, railCache],
  );
  const transitPending = useMemo(
    () => routeLines.filter((l) => TRANSIT_MODES.has(l.mode) && l.line && l.center && !(l.cacheKey in transitPathCache)).length,
    [routeLines, transitPathCache],
  );
  const hasUnresolved = !!showRoutes && (roadPending > 0 || railPending > 0 || transitPending > 0);

  useEffect(() => {
    if (!hasUnresolved) return;
    if (retryAttemptRef.current >= RETRY_MAX_ATTEMPTS) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
    const timer = setTimeout(() => {
      retryAttemptRef.current += 1;
      setRetryTick((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnresolved, retryTick]);

  // Snap ground legs (car/moto) to real roads via OSRM so they follow streets,
  // routing through any waypoints (intermediate stops/detours) in order.
  useEffect(() => {
    const pending = routeLines.filter((l) => GROUND_MODES.has(l.mode) && l.a && l.b && l.viasReady && !(l.pathKey in pathCache));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchRoadPathVia([l.a!, ...l.vias.map((v) => v.ll), l.b!]);
        if (path) updates[l.pathKey] = path;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        for (const [k, v] of Object.entries(updates)) memRoad.set(k, v);
        capMap(memRoad, 120);
        setPathCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines, retryTick]);

  // Snap train legs (station→station, no line ref) to the real railway via BRouter
  // so they follow the tracks instead of drawing a straight line.
  useEffect(() => {
    const pending = routeLines.filter((l) => l.mode === "train" && !l.line && l.a && l.b && !(l.key in railCache));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchRailPath(l.a!, l.b!);
        if (path) updates[l.key] = path;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        for (const [k, v] of Object.entries(updates)) memRail.set(k, v);
        capMap(memRail, 120);
        setRailCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines, retryTick]);

  // Fetch exact OSM geometry for transit legs that carry a line ref, once their
  // stop coordinates are geocoded (so we can search around the real location).
  useEffect(() => {
    const todo = routeLines.filter(
      (l) => TRANSIT_MODES.has(l.mode) && l.line && l.center && !(l.cacheKey in transitPathCache),
    );
    if (todo.length === 0) return;
    let cancelled = false;
    // Only record a genuine, permanent failure once the retry budget is spent —
    // until then a leg that comes back empty simply stays absent from the cache
    // (read as "pending", no notice yet) and is retried on the next tick.
    const isLastAttempt = retryAttemptRef.current >= RETRY_MAX_ATTEMPTS;
    (async () => {
      const updates: Record<string, TransitLine> = {};
      for (const l of todo) {
        if (l.cacheKey in transitPathCache || l.cacheKey in updates) continue;
        let result: TransitLine;
        try {
          result = await fetchTransitGeometry(l.center!, l.radiusM, l.mode, l.line!);
        } catch {
          result = { variants: [] };
        }
        if (result.variants.length > 0 || isLastAttempt) updates[l.cacheKey] = result;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        // Persist ONLY successful results across navigation. An empty result
        // (transient Overpass failure) stays in local state to avoid a refetch
        // loop this mount, but is NOT cached, so it's retried next time.
        for (const [k, v] of Object.entries(updates)) if (v.variants.length > 0) memTransit.set(k, v);
        capMap(memTransit, 80);
        setTransitPathCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines, retryTick]);

  // Resolve every transit leg from the OSM relation ONLY: boarding, alighting and
  // intermediate stops are real relation stops, so the pins always sit on the drawn
  // line. Stops are matched to the relation purely by NAME (exact/accent-insensitive,
  // then a 1-edit tolerance for spelling variants). A leg whose line can't be found
  // is marked "failed" (→ notice), never drawn city-to-city.
  type TPin = { ll: LL; name: string; big: boolean };
  type TResolved = { state: "pending" | "failed" | "ok"; positions?: LL[]; pins?: TPin[]; color?: string };
  const transitResolved = useMemo<Record<string, TResolved>>(() => {
    const map: Record<string, TResolved> = {};
    if (!showRoutes || !routes) return map;

    // Match a stored stop name to a real relation stop, by name only.
    const matchStop = (raw: string, union: TransitStop[]): TransitStop | null =>
      union.find((s) => sameStop(s.name, raw)) ??
      union.find((s) => similarStop(s.name, raw)) ??
      null;

    routeLines.forEach((l) => {
      if (!TRANSIT_MODES.has(l.mode)) return;
      const key = l.key;
      // No line ref → nothing to look up; leave it to the geocoded straight line
      // in `drawn` (NO "not traceable" notice for these).
      if (!l.line) return;
      if (!l.center) { map[key] = { state: "pending" }; return; } // stops not geocoded yet
      const tl = transitPathCache[l.cacheKey];
      if (!tl) { map[key] = { state: "pending" }; return; }
      if (tl.variants.length === 0) { map[key] = { state: "failed" }; return; }

      // Union of every stop across all variants (real relation stops only).
      const union: TransitStop[] = [];
      const uSeen = new Set<string>();
      for (const v of tl.variants) for (const s of v.stops) {
        const uk = `${_normName(s.name)}@${s.ll[0].toFixed(4)},${s.ll[1].toFixed(4)}`;
        if (uSeen.has(uk)) continue; uSeen.add(uk); union.push(s);
      }

      const board = matchStop(l.from, union);
      const alight = matchStop(l.to, union);
      if (!board || !alight) { map[key] = { state: "failed" }; return; }

      // Pick the variant whose track passes closest to BOTH matched stops,
      // preferring one where board comes BEFORE alight in the track's own point
      // order — i.e. the real, tagged direction of travel. Many lines carry
      // separate outbound/inbound (or looping) relations that both happen to
      // pass near both stops; picking one indiscriminately by proximity alone
      // can draw the correct stops but via the wrong arc/direction (e.g. the
      // long way around a loop, or the opposite carriageway). A same-direction
      // candidate always wins over a reversed one, even with a slightly worse
      // proximity score.
      let chosen: TransitVariant | null = null, bestScore = Infinity, chosenForward = false;
      for (const v of tl.variants) {
        if (v.path.length < 2) continue;
        const forward = nearestIdx(v.path, board.ll) <= nearestIdx(v.path, alight.ll);
        const score = minDistSq(v.path, board.ll) + minDistSq(v.path, alight.ll);
        if (!chosen || (forward && !chosenForward) || (forward === chosenForward && score < bestScore)) {
          chosen = v; bestScore = score; chosenForward = forward;
        }
      }

      let positions: LL[];
      let mids: TransitStop[] = [];
      if (chosen) {
        // Orient the trimmed segment so it always starts near `board` and ends
        // near `alight`, matching the real direction of travel end to end.
        positions = orientPath(trimPath(chosen.path, board.ll, alight.ll), board.ll, alight.ll);
        const bi = nearestStopIdx(chosen.stops, board.ll);
        const ai = nearestStopIdx(chosen.stops, alight.ll);
        const lo = Math.min(bi, ai), hi = Math.max(bi, ai);
        mids = chosen.stops.slice(lo + 1, hi);
        if (bi > ai) mids = mids.slice().reverse();
      } else {
        // No track geometry available — order the stops from the richest variant.
        const sv = tl.variants.reduce((a, b) => (b.stops.length > a.stops.length ? b : a), tl.variants[0]);
        const bi = nearestStopIdx(sv.stops, board.ll);
        const ai = nearestStopIdx(sv.stops, alight.ll);
        const lo = Math.min(bi, ai), hi = Math.max(bi, ai);
        let seq = sv.stops.slice(lo, hi + 1);
        if (bi > ai) seq = seq.slice().reverse();
        if (seq.length < 2) seq = [board, alight];
        positions = seq.map((s) => s.ll);
        mids = seq.slice(1, -1);
      }
      mids = mids.filter((s) => !sameStop(s.name, board.name) && !sameStop(s.name, alight.name));

      // Snap every pin onto the drawn line so stops sit exactly on the route
      // (OSM bus-stop nodes sit at the kerb, a few metres off the road centre).
      const pins: TPin[] = [
        { ll: projectOnPath(positions, board.ll), name: board.name, big: true },
        ...mids.map((s) => ({ ll: projectOnPath(positions, s.ll), name: s.name, big: false })),
        { ll: projectOnPath(positions, alight.ll), name: alight.name, big: true },
      ];
      map[key] = { state: "ok", positions, pins, color: tl.color };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines, showRoutes, transitPathCache]);

  // Assemble the drawn geometry + coloured pins for every leg. Transit legs come
  // from transitResolved (relation stops); ground legs use the OSRM road path;
  // everything else is a straight line between geocoded endpoints.
  const drawn = useMemo(() => {
    type Pin = { ll: LL; name: string; big: boolean; hollow?: boolean };
    type Drawn = { key: string; color: string; dash?: string; positions: LL[]; pins: Pin[] };
    if (!showRoutes || !routes) return [] as Drawn[];
    const out: Drawn[] = [];
    routeLines.forEach((l) => {
      const key = l.key;
      const { color, dash } = modeStyle(l.mode);

      if (TRANSIT_MODES.has(l.mode)) {
        const res = transitResolved[key];
        // A leg with a line ref is handled strictly by transitResolved: draw only
        // when "ok"; pending/failed → not drawn (failed also raises the notice).
        // A leg WITHOUT a line ref (res undefined) falls through to a plain line.
        if (res) {
          if (res.state === "ok" && res.positions && res.pins) {
            // Metro lines draw in their real network colour when OSM tags it
            // (e.g. Milano M1 red, Roma B blue); other transit modes keep their
            // fixed mode colour, and metro itself falls back to it when unknown.
            const lineColor = l.mode === "metro" && res.color ? res.color : color;
            out.push({ key, color: lineColor, dash, positions: res.positions, pins: res.pins });
          }
          return;
        }
      }

      // Non-transit legs → geocoded endpoints, snapped to roads (car/moto via OSRM,
      // through the "enter" waypoints) or to the railway (train, via BRouter).
      const a = l.a, b = l.b;
      if (!a || !b) return;
      let positions: LL[] = [a, b];
      if (GROUND_MODES.has(l.mode) && pathCache[l.pathKey]) positions = pathCache[l.pathKey];
      else if (l.mode === "train" && railCache[key]) positions = railCache[key];
      // Endpoints (departure/arrival) are FILLED pins. City stops are HOLLOW pins
      // (filled ones stay reserved for the trip's own cities + start/end). Highway
      // shaping points carry no pin.
      // Endpoint pins sit on the resolved coordinate (a/b) — NOT the road-snapped
      // path ends — and are omitted entirely when they coincide with a trip city,
      // so the trip's own city pin is the single marker for that place.
      const isCity = (ll: LL) => cityKeySet.has(`${ll[0].toFixed(3)},${ll[1].toFixed(3)}`);
      // Draw the endpoint pins on the ACTUAL start/end of the drawn line (road- or
      // rail-snapped) rather than the raw resolved coordinate, so a pin never sits
      // off the line when the route geometry diverges slightly from the geocode.
      const startPt = positions[0] ?? a;
      const endPt = positions[positions.length - 1] ?? b;
      const pins: Pin[] = [];
      if (!isCity(a)) pins.push({ ll: startPt, name: cleanPlace(l.from), big: true });
      for (const v of l.vias) if (v.pin) pins.push({ ll: projectOnPath(positions, v.ll), name: v.label, big: true, hollow: true });
      if (!isCity(b)) pins.push({ ll: endPt, name: cleanPlace(l.to), big: true });
      out.push({ key, color, dash, positions, pins });
    });
    return out;
  }, [routeLines, routes, showRoutes, transitResolved, pathCache, railCache, cityKeySet]);

  // Count transit legs whose line couldn't be resolved from OSM data, to warn.
  const missingTransit = useMemo(() => {
    if (!showRoutes || !routes) return 0;
    let n = 0;
    for (const key of Object.keys(transitResolved)) {
      if (transitResolved[key].state === "failed") n++;
    }
    return n;
  }, [showRoutes, routes, transitResolved]);

  // Persist to localStorage ONLY once this map is fully drawn — every leg
  // resolved and no "tratta mancante" notice showing. An incomplete/partial
  // result isn't worth caching (and would otherwise persist a broken-looking
  // map); this fires again on every render while fully resolved, but
  // `rememberRoute` just (re)schedules a single debounced write.
  useEffect(() => {
    if (!showRoutes || !routes || routes.length === 0) return;
    if (hasUnresolved || missingTransit > 0) return;
    rememberRoute();
  }, [showRoutes, routes, hasUnresolved, missingTransit]);

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
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Mobile: while the user manipulates the map with a finger, keep the gesture on
  // the map and stop the page from scrolling away — UNLESS the swipe starts from
  // the bottom band of the screen, which stays a deliberate "scroll the page up"
  // handle. (Skipped for compact previews, which should scroll natively.)
  useEffect(() => {
    if (compact) return;
    const el = wrapRef.current;
    if (!el) return;
    const BOTTOM_BAND = 110; // px from the screen bottom that still scrolls the page
    let allowPage = false;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      allowPage = !!t && t.clientY >= window.innerHeight - BOTTOM_BAND;
    };
    const onMove = (e: TouchEvent) => {
      if (allowPage) return;                 // bottom-edge swipe → let the page scroll
      if (e.cancelable) e.preventDefault();  // otherwise the map keeps the gesture
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
    };
  }, [compact]);

  const cityPoints = points.length > 0 ? points : fallbackPoints;

  // Every leg endpoint (from/to of each route), resolved to coordinates — so a
  // departure/arrival that isn't in the trip's own city list still shows on the map.
  const legEndpoints = useMemo<Array<{ ll: [number, number]; name: string }>>(() => {
    if (!routes) return [];
    const seen = new Set<string>();
    const out: Array<{ ll: [number, number]; name: string }> = [];
    for (const r of routes) {
      for (const raw of [r.from, r.to]) {
        const ll = resolve(raw, r.country);
        if (!ll) continue;
        const k = `${ll[0].toFixed(3)},${ll[1].toFixed(3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ ll, name: cleanPlace(raw) });
      }
    }
    return out;
  }, [routes, resolve]);

  // Fit the view to the trip's own cities when the "Città" switch is selected
  // (matching what's shown there); include every leg endpoint + the drawn route
  // geometry only in the "Tratte" (routes) view.
  const boundsPoints = useMemo<[number, number][]>(
    () => [...cityPoints, ...(showRoutes ? [...legEndpoints.map((e) => e.ll), ...drawn.flatMap((d) => d.positions)] : [])],
    [cityPoints, legEndpoints, drawn, showRoutes],
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
    <div className={className} ref={wrapRef}>
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

      {/* Stop / waypoint pins — mode colour. Filled pins mark real trip cities and
          the departure/arrival of each leg; HOLLOW pins mark road waypoints. */}
      {showRoutes &&
        drawn.flatMap((d) =>
          d.pins.map((p, idx) => (
            <CircleMarker
              key={`${d.key}-p${idx}`}
              center={p.ll}
              radius={p.big ? 6.5 : 3.5}
              pathOptions={
                p.hollow
                  ? { color: d.color, weight: 2.5, fillColor: "#ffffff", fillOpacity: 1 }
                  : { color: "#ffffff", weight: p.big ? 2 : 1.5, fillColor: d.color, fillOpacity: 1 }
              }
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

      {/* "Città" view shows ONLY the trip's own cities — leg endpoints (stations,
          airports, etc.) are shown solely in the "Tratte" (routes) view above,
          as coloured mode pins. */}
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
