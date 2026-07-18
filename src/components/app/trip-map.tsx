import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeCity } from "@/lib/country-data";
import { withRomanization, registerEnName, useTranslationTick } from "@/lib/romanize";
import { airportCoordsByIata, airportCoordsByPlaceName } from "@/hooks/use-airports";

export type MapCity = { name: string; country: string; lat?: number; lng?: number };
export type MapWaypoint = { name: string; enter?: boolean; lat?: number | null; lng?: number | null; country?: string | null };
export type MapRoute = {
  from: string; to: string; mode: string; country?: string; line?: string; city?: string; waypoints?: MapWaypoint[];
  // Bus only: found via the wide intercity/airport search rather than the
  // city's strict boundary (see fetchTransitLines in the timeline editor) —
  // drawn in a different colour so it stands out from local/urban bus lines.
  intercity?: boolean;
};

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
  car:      { color: "#ef4444" },                          // red-500 — auto
  moto:     { color: "#f97316" },                          // orange-500 — moto
  plane:    { color: "#4b5563", dash: "2 8" },              // dark grey, fixed regardless of theme (white didn't read on the map) — aereo, dotted
  train:    { color: "#c0c0c0" },                           // silver, fixed regardless of theme — treno
  taxi:     { color: "#eab308" },                          // yellow-500 — taxi
  bus:      { color: "#0ea5e9" },                          // sky-500 — bus (same as the leg editor)
  metro:    { color: "#8b5cf6" },                          // violet-500 fallback (real line colour preferred)
  tram:     { color: "#10b981" },                          // emerald-500 — tram
  ferry:    { color: "#7dd3fc", dash: "8 6" },              // sky-300 (azzurro chiaro) — traghetto, dashed
  transfer: { color: "#64748b" },                          // slate-500
};
const modeStyle = (mode: string) => MODE_STYLE[mode] ?? { color: PRIMARY };
// Intercity/airport bus lines (found via the wide radius search rather than
// the city's strict boundary — see fetchTransitLines in the timeline editor)
// draw in this colour instead of the standard urban bus blue, so e.g. an
// airport express line stands apart from the city's local bus network.
const INTERCITY_BUS_COLOR = "#f97316"; // orange-500
// Dash pattern for a transit leg whose typed line couldn't be checked against
// real OSM data (unknown ref, or its boarding/alighting names don't match a
// real stop on it) — it's still drawn, as a plain best-guess hop between the
// two geocoded points, but dotted so it visibly reads as unverified rather
// than a real, checked route.
const UNVERIFIED_DASH = "4 5";

// Ground modes whose path we snap to real roads via OSRM; plane/ferry stay
// straight (dotted/dashed) since there are no roads to follow.
const GROUND_MODES = new Set(["car", "moto", "taxi"]);

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
  // "coach" is OSM's tag for long-distance/intercity/express bus services
  // (distinct from "bus" for local/urban lines) — the leg picker now surfaces
  // these too (see fetchTransitLines in the timeline editor), so the map must
  // recognise the same tag or a selected express/intercity line would show in
  // the picker but then fail to trace on the map.
  bus: ["bus", "coach"],
  metro: ["subway", "light_rail", "monorail", "metro"],
  tram: ["tram", "light_rail"],
  train: ["train", "light_rail"],
};
// A transit leg with a known line ref is located from its OSM relation (not by
// geocoding its stop names, which can collide with far-away towns).
const isTransitWithLine = (r: MapRoute) => TRANSIT_MODES.has(r.mode) && !!r.line;
// Radius (m) of the Overpass `around:` search per mode — a metro/tram network
// spans a metro area, regional trains reach much further.
const TRANSIT_RADIUS: Record<string, number> = { metro: 45000, tram: 30000, bus: 45000, train: 130000 };

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

// Bounding box that circumscribes a circle of `radiusKm` around `center` —
// Leaflet's maxBounds is rectangular, so this is the practical way to give
// panning a circular "feel": everything inside the circle is reachable at
// any zoom, and the box only starts clipping once you're already past the
// circle's edge in every direction (including diagonally).
function circleBoundsKm(center: LL, radiusKm: number): L.LatLngBounds {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(0.1, Math.cos((center[0] * Math.PI) / 180)));
  return L.latLngBounds(
    [center[0] - latDelta, center[1] - lngDelta],
    [center[0] + latDelta, center[1] + lngDelta],
  );
}

// Bounding box around EVERY point in `pins`, padded by `padKm` real-world
// kilometres on every side. Unlike a circle built from just the two most
// distant pins (which only mathematically contains a third point when the
// triangle they form has an obtuse-or-right angle opposite the longest side
// — false in general, e.g. a roughly equilateral spread of trip cities),
// this is a plain min/max box over ALL pins, so every single one is
// guaranteed to sit strictly inside before the padding is even added. The
// longitude padding uses the highest absolute latitude among the pins (where
// a degree of longitude is shortest) so the buffer is never under-sized near
// the poles.
function boundsFromPointsKm(pins: LL[], padKm: number): L.LatLngBounds {
  let minLat = pins[0][0], maxLat = pins[0][0], minLng = pins[0][1], maxLng = pins[0][1];
  let maxAbsLat = Math.abs(pins[0][0]);
  for (const [lat, lng] of pins) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (Math.abs(lat) > maxAbsLat) maxAbsLat = Math.abs(lat);
  }
  const latDelta = padKm / 111.32;
  const lngDelta = padKm / (111.32 * Math.max(0.1, Math.cos((maxAbsLat * Math.PI) / 180)));
  return L.latLngBounds(
    [minLat - latDelta, minLng - lngDelta],
    [maxLat + latDelta, maxLng + lngDelta],
  );
}

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

// Rough great-circle distance in metres (equirectangular approximation —
// plenty accurate at the scale of sizing an Overpass search radius, no need
// for a full haversine).
function _approxDistM(a: LL, b: LL): number {
  const R = 6371000;
  const lat1 = (a[0] * Math.PI) / 180, lat2 = (b[0] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const x = dLng * Math.cos((lat1 + lat2) / 2);
  return Math.sqrt(x * x + dLat * dLat) * R;
}

// Real ferry route geometry from OSM: unlike bus/metro/tram/train, a ferry
// route has no numbered "line ref" to search by (see fetchTransitGeometry) —
// it's identified by the pair of ports it actually connects. Searches for
// route=ferry relations near the midpoint of the two ports and keeps only
// the ones with a stop member close to BOTH points, then stitches that
// relation's way geometry into one ordered polyline (oriented a→b) — so a
// ferry leg traces the real sea route (which often curves around headlands/
// islands) instead of cutting a straight dashed line across land and sea.
// Matching is done by COORDINATE PROXIMITY, not by comparing the picked
// port's label text against the relation's own stop names — the first
// version tried the latter and it silently never matched anything, since a
// port picked from the app's own list ("Port d'Eivissa", a curated/geocoded
// label) rarely matches OSM's own stop-node name for the exact same
// terminal ("Estació Marítima d'Eivissa", etc.) closely enough for a
// substring/near-miss text comparison to catch — so the real-geometry fetch
// always fell back to the straight line, invisibly. A stop node within a
// few km of the already-resolved a/b coordinate is what "this relation
// serves this port" actually means, regardless of what either side calls it.
// Returns null when no matching mapped relation exists — the caller falls
// back to the existing straight-line rendering, exactly as before (many
// short/less-travelled crossings genuinely aren't mapped with a real path).
const FERRY_STOP_MATCH_M = 12000;
async function fetchFerryGeometry(a: LL, b: LL): Promise<LL[] | null> {
  try {
    const mid: LL = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Radius must comfortably cover both ports plus room for the route's own
    // detour — a straight-line-based radius is a reasonable floor/ceiling.
    const straight = _approxDistM(a, b);
    const radius = Math.min(Math.max(straight * 0.75, 40000), 400000);
    const around = `(around:${Math.round(radius)},${mid[0]},${mid[1]})`;
    const q = `[out:json][timeout:60];(relation["type"="route"]["route"="ferry"]${around};)->.r;.r out geom;node(r.r);out body;`;
    const data = (await overpassFetch(q)) as { elements: OverpassEl[] };
    const nodeCoord = new Map<number, LL>();
    for (const el of data.elements) {
      if (el.type === "node" && typeof el.id === "number" && typeof el.lat === "number" && typeof el.lon === "number") {
        nodeCoord.set(el.id, [el.lat, el.lon]);
      }
    }
    let best: LL[] | null = null;
    let bestLen = -1;
    for (const el of data.elements) {
      if (el.type !== "relation" || !el.members) continue;
      let nearA = false, nearB = false;
      for (const m of el.members) {
        const role = m.role ?? "";
        if (!(role.startsWith("stop") || role.startsWith("platform"))) continue;
        if (m.type !== "node" || typeof m.ref !== "number") continue;
        const c = nodeCoord.get(m.ref);
        if (!c) continue;
        if (_approxDistM(c, a) <= FERRY_STOP_MATCH_M) nearA = true;
        if (_approxDistM(c, b) <= FERRY_STOP_MATCH_M) nearB = true;
      }
      if (!nearA || !nearB) continue;
      const ways = el.members
        .filter((m) => m.type === "way" && Array.isArray(m.geometry))
        .map((m) => (m.geometry as Array<{ lat: number; lon: number }>).map((g) => [g.lat, g.lon] as LL));
      const path = stitchWays(ways);
      if (path.length >= 2 && path.length > bestLen) { best = path; bestLen = path.length; }
    }
    if (best) return orientPath(best, a, b);
  } catch { /* ignore — caller keeps the straight-line fallback */ }
  return null;
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

// Where along a polyline a point projects: the segment index and how far
// (0–1) into that segment — precise to the metre, unlike a nearest-VERTEX
// index (which can sit tens of metres from the true stop if track vertices
// are sparse there, leaving the trimmed line either short of, or past, the
// pin that's snapped exactly onto the true projection via projectOnPath).
function projectIndexT(path: LL[], pt: LL): { i: number; t: number; d2: number } {
  let best = { i: 0, t: 0, d2: Infinity };
  for (let i = 0; i < path.length - 1; i++) {
    const A = path[i], B = path[i + 1];
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((pt[0] - A[0]) * dx + (pt[1] - A[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = A[0] + t * dx, cy = A[1] + t * dy;
    const d2 = (cx - pt[0]) ** 2 + (cy - pt[1]) ** 2;
    if (d2 < best.d2) best = { i, t, d2 };
  }
  return best;
}

// Keep only the portion of the line between the boarding and alighting
// stops — trimmed exactly at each stop's projected point on the track (not
// merely at the nearest existing vertex), so the drawn line's very end
// always coincides with the alighting pin instead of stopping short of or
// running past it.
function trimPath(path: LL[], a: LL, b: LL): LL[] {
  if (path.length < 2) return path;
  let lo = projectIndexT(path, a);
  let hi = projectIndexT(path, b);
  if (lo.i > hi.i || (lo.i === hi.i && lo.t > hi.t)) { const tmp = lo; lo = hi; hi = tmp; }
  const at = (p: { i: number; t: number }): LL => [
    path[p.i][0] + p.t * (path[p.i + 1][0] - path[p.i][0]),
    path[p.i][1] + p.t * (path[p.i + 1][1] - path[p.i][1]),
  ];
  const mid = path.slice(lo.i + 1, hi.i + 1);
  const seg = [at(lo), ...mid, at(hi)];
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
    // With a country hint, ask for several candidates (not just the single
    // global top match) — the loop below picks the first one actually IN
    // that country. Requesting only 1 result made that filter a no-op: with
    // nothing else in the array to fall through to, it always ended up
    // returning the lone (possibly wrong-country) result regardless of the
    // match below, which is how a same-named station/stop in another
    // country could silently win over the real, in-country one.
    const params = new URLSearchParams({ q: qq, limit: country ? "5" : "1" });
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

// Hub-style leg labels (train/bus/ferry/metro/tram stops picked from the
// station combobox) are saved as "City – Station Name" (e.g. "Belfast –
// Belfast Lanyon Place"), which is great for display but a poor GEOCODING
// query: the redundant city prefix dilutes the search and can make a general
// geocoder (Photon/Nominatim) return a wrong or no match — and a failed
// match falls all the way back to the whole COUNTRY's geometric centroid, a
// point nowhere near any real station that reads as "randomly placed" (and,
// worse, several failed stops in the same country all land on that exact
// same centroid, looking like they got swapped with each other). Stripping
// the city prefix before geocoding — but ONLY when the remainder already
// repeats the city name, the tell-tale sign of this specific label pattern —
// gives the geocoder just the real station name to search for, which
// resolves far more precisely. The pin's displayed name is unaffected; this
// is used solely for the geocoding query.
function stripHubCityPrefix(s: string): string {
  const m = /^(.+?)\s*[–—-]\s*(.+)$/.exec((s ?? "").trim());
  if (!m) return s;
  const city = m[1].trim().toLowerCase();
  const rest = m[2].trim();
  return city && rest.toLowerCase().includes(city) ? rest : s;
}

async function geocodePlace(query: string, country?: string, airportHint = false, iata?: string | null): Promise<{ lat: number; lng: number } | null> {
  const q = (query ?? "").trim();
  if (!q) return null;
  // isAirport is driven ONLY by airportHint (i.e. the leg is genuinely a
  // "plane" leg) — NOT by testing the label text against AIRPORT_RE. A
  // train/bus/metro/tram stop can legitimately have "aeroport"/"airport" in
  // its own name (e.g. Barcelona's Rodalies "Aeroport T2" station) without
  // being the airport itself; treating it as an airport search here used to
  // drop the country filter, skip the fast Photon lookup, and bias results
  // toward the huge aerodrome polygon/point instead of the actual station —
  // which is exactly what put El Prat's pin in the wrong spot. Only a real
  // plane leg (airportHint === true, set from r.mode === "plane") should get
  // the airport-specific IATA/aerodrome resolution below.
  const isAirport = airportHint;
  // Airports: resolve from the SAME offline airports-json dataset used
  // everywhere else in the app for airport data (see use-airports.ts) —
  // exact reference-point coordinates, no network round-trip, no rate limit,
  // no risk of a live geocoder matching the wrong feature. Tried first
  // whenever there's an IATA code, and — when there isn't one, e.g. an older
  // leg saved as plain "Barcelona"/"El Prat" before the "IATA - City" label
  // format existed — by matching the place name directly against the
  // dataset (only when exactly one airport matches, to stay unambiguous).
  // The live Overpass/Nominatim paths below are now only a fallback for the
  // rare code that's genuinely missing from the dataset.
  if (isAirport && iata) {
    const byIataOffline = await airportCoordsByIata(iata);
    if (byIataOffline) return byIataOffline;
  }
  if (isAirport && !iata) {
    const byNameOffline = await airportCoordsByPlaceName(q, country);
    if (byNameOffline) return byNameOffline;
  }
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
    // Applied for airport searches too now that `country` can carry the
    // trip's FULL country list (comma-separated, which Nominatim's
    // countrycodes accepts) for a plane leg — this is what disambiguates a
    // same-named airport abroad (e.g. Barcelona, Venezuela) from the one the
    // trip is actually about, the same ambiguity the offline dataset lookup
    // above already guards against.
    if (country) params.set("countrycodes", country.toLowerCase());
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

// An airport's dataset/geocoded reference point (see geocodePlace) commonly
// lands near the terminal/access road rather than visually "on" the airport
// — Foto 4: "Pill relative agli aerei dovrebbero trovarsi su una pista di
// atterraggio e non su strada". Snaps that point onto the nearest real
// runway centreline (OSM `aeroway=runway` way) within a tight search radius,
// so the plane pin actually sits on tarmac. Best-effort: any failure (no
// runway mapped nearby, network error) just keeps the original point.
const _runwaySnapCache = new Map<string, { lat: number; lng: number }>();
const RUNWAY_SEARCH_RADIUS_M = 3000;
function _nearestPointOnSegment(p: LL, a: LL, b: LL): LL {
  // Small-scale planar approximation (fine at airport scale, a few km) —
  // project lng by cos(lat) so the two axes are comparable in metres.
  const cos = Math.cos((p[0] * Math.PI) / 180);
  const ax = a[1] * cos, ay = a[0];
  const bx = b[1] * cos, by = b[0];
  const px = p[1] * cos, py = p[0];
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  const x = ax + t * dx, y = ay + t * dy;
  return [y, x / cos];
}
async function snapToNearestRunway(lat: number, lng: number): Promise<{ lat: number; lng: number }> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = _runwaySnapCache.get(key);
  if (cached) return cached;
  const fallback = { lat, lng };
  try {
    const q = `[out:json][timeout:15];way(around:${RUNWAY_SEARCH_RADIUS_M},${lat},${lng})["aeroway"="runway"];out geom;`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!r.ok) { _runwaySnapCache.set(key, fallback); return fallback; }
    const data = (await r.json()) as { elements: Array<{ geometry?: Array<{ lat: number; lon: number }> }> };
    const p: LL = [lat, lng];
    let best: LL | null = null;
    let bestD = Infinity;
    for (const el of data.elements) {
      const geom = el.geometry;
      if (!geom || geom.length < 2) continue;
      for (let i = 0; i < geom.length - 1; i++) {
        const cand = _nearestPointOnSegment(p, [geom[i].lat, geom[i].lon], [geom[i + 1].lat, geom[i + 1].lon]);
        const d = _approxDistM(p, cand);
        if (d < bestD) { bestD = d; best = cand; }
      }
    }
    const result = best ? { lat: best[0], lng: best[1] } : fallback;
    _runwaySnapCache.set(key, result);
    return result;
  } catch {
    _runwaySnapCache.set(key, fallback);
    return fallback;
  }
}

// Custom pin so we don't depend on Leaflet's default marker images.
const pinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ── Per-mode endpoint pins (icon inside, + line ref for bus/tram/metro) ──────
// The exact lucide-react icon paths already used for these modes elsewhere in
// the app (MODE_ICON in the timeline editor: car→Car, moto→Bike, taxi→
// CarTaxiFront, train→TrainFront, ferry→Ship, bus→Bus, tram→TramFront,
// metro→the app's own MetroWagonIcon), reproduced verbatim here so a leg's
// map pin is the SAME pictogram as its activity-list icon instead of a
// similar-but-different hand-drawn stand-in — the two used to read as two
// different vehicles for the same leg at a glance. Kept as raw path strings
// (rather than importing the icon components) since this markup has to live
// inside a plain HTML string for Leaflet's divIcon, not JSX.
const MODE_GLYPH: Record<string, string> = {
  car: `<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>`,
  moto: `<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>`,
  taxi: `<path d="M10 2h4"/><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>`,
  train: `<path d="M8 3.1V7a4 4 0 0 0 8 0V3.1"/><path d="m9 15-1-1"/><path d="m15 15 1-1"/><path d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/>`,
  // lucide's "Plane" icon (used everywhere else in the app for flights) —
  // was already meant to match here but had a transcription typo in one
  // coordinate pair ("8.2-1.8" instead of "4.8 6.2"), fixed as part of this
  // same verbatim-path pass.
  plane: `<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>`,
  ferry: `<path d="M12 10.189V14"/><path d="M12 2v3"/><path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/><path d="M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76"/><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>`,
  bus: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>`,
  // The app's own custom MetroWagonIcon (see timeline.tsx) — not a stock
  // lucide icon — reproduced exactly rather than approximated.
  metro: `<rect x="3" y="6" width="18" height="11" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><rect x="6.3" y="8.3" width="3.6" height="2.4" rx="0.4"/><rect x="14.1" y="8.3" width="3.6" height="2.4" rx="0.4"/><circle cx="7.5" cy="19" r="1.4"/><circle cx="16.5" cy="19" r="1.4"/>`,
  tram: `<rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/>`,
};
// Line ref / flight number is carried by these — matches "la linea per bus,
// tram, metro e treno" (+ flight number for planes).
const LINE_LABEL_MODES = new Set(["bus", "tram", "metro", "train", "plane"]);
// Down-arrow glyph shown at the alighting/arrival pin — every leg's arrival
// end is just "you get off here", so it's the arrow alone, with no vehicle
// icon (the vehicle icon is what marks BOARDING; repeating it at arrival is
// redundant since the leg's own colour/line already identifies the vehicle).
const DOWN_ARROW_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13M6 13l6 6 6-6"/></svg>`;

function escapeHtml(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// Bigger endpoint pin for a leg's departure/arrival: mode-coloured badge.
// BOARDING shows the vehicle icon, plus the line ref/flight number next to
// it when one is known (bus/tram/metro/train/plane). ALIGHTING is always
// just a plain down arrow, for every mode — no vehicle icon there, since
// "you get off here" doesn't need to repeat the vehicle glyph the boarding
// pin already showed a moment ago on the same line. Uses a zero-size icon +
// CSS centering so the badge can be a plain circle OR a wider capsule
// without any anchor-offset math.
//
// `offsetPx` (screen pixels, not degrees) nudges two coincident badges apart
// — see `pinNudge` below. It's applied via `iconAnchor`, NOT by moving the
// marker's actual LatLng: a geographic (metres) offset shrinks to a
// sub-pixel gap at low zoom (the two badges look merged everywhere except
// zoomed all the way in, exactly the reported bug) and, worse, still varies
// with latitude/zoom instead of staying a fixed, predictable gap. `iconAnchor`
// shifts only where the icon is DRAWN on screen relative to its (unchanged)
// real coordinate, in actual pixels — so the two badges sit a constant,
// correct distance apart at every zoom level, from fully zoomed out to
// fully zoomed in.
//
// `offsetPx` is now [x, y]: X separates badges of the SAME mode sitting
// side-by-side on one row; Y separates different-mode ROWS stacked above/
// below each other (see `pinNudge`'s row layout) — before this, only an X
// offset existed, so every coincident badge (same mode or not) was forced
// onto one single horizontal line, which is what pushed badges far sideways
// away from their route's real endpoint whenever several different modes
// met at the same spot.
function endpointIcon(mode: string, color: string, line: string | undefined | null, isBoarding: boolean, offsetPx: [number, number] = [0, 0]): L.DivIcon {
  // Icon content is centred via CSS `translate(-50%,-50%)` around anchor
  // (0,0); shifting the anchor by -offsetPx moves the rendered badge
  // +offsetPx pixels right/down (and vice versa for a negative offset).
  const iconAnchor: [number, number] = [-offsetPx[0], -offsetPx[1]];
  let html: string;
  if (!isBoarding) {
    html = `<span style="position:relative;transform:translate(-50%,-50%);display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${DOWN_ARROW_SVG}</span>`;
    return L.divIcon({ className: "voyager-pin", html, iconSize: [0, 0], iconAnchor });
  }
  const glyph = MODE_GLYPH[mode] ?? `<circle cx="12" cy="12" r="5"/>`;
  const svg = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">${glyph}</svg>`;
  const hasLine = LINE_LABEL_MODES.has(mode) && !!(line ?? "").trim();
  if (hasLine) {
    html = `<span style="position:relative;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px 0 6px;border-radius:9999px;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);white-space:nowrap">${svg}<span style="color:white;font:700 11px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.2px">${escapeHtml((line ?? "").trim())}</span></span>`;
  } else {
    html = `<span style="position:relative;transform:translate(-50%,-50%);display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:9999px;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${svg}</span>`;
  }
  return L.divIcon({ className: "voyager-pin", html, iconSize: [0, 0], iconAnchor });
}

// Strip IATA airport codes so a leg endpoint like "FCO - Roma" or
// "Bologna Guglielmo Marconi Airport (BLQ)" geocodes on its real place name.
function cleanPlace(s: string): string {
  return (s ?? "")
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .replace(/^[A-Z]{3}\s*-\s*/, "")
    .trim();
}

function FitBounds({ points, restrictBounds }: { points: [number, number][]; restrictBounds?: L.LatLngBounds }) {
  const map = useMap();
  // Once the user has manually dragged the map, stop auto-fitting entirely —
  // otherwise a background update that changes `points` (one more leg
  // endpoint finishing its geocode, an unrelated re-render giving the array
  // a new identity, …) snaps the view straight back to the trip's own
  // cities/pins, undoing a deliberate pan toward e.g. the home-country pin.
  const userMovedRef = useRef(false);
  useEffect(() => {
    const onDragStart = () => { userMovedRef.current = true; };
    map.on("dragstart", onDragStart);
    return () => { map.off("dragstart", onDragStart); };
  }, [map]);
  // Also skip re-fitting when `points` is referentially new but not actually
  // different in content — geocoding/route state updates recreate this array
  // on every render even when the coordinates it holds haven't changed.
  const lastKeyRef = useRef<string>("");
  useEffect(() => {
    if (points.length === 0) return;
    if (userMovedRef.current) return;
    const key = points.map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join("|");
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    if (points.length === 1) {
      map.setView(points[0], 5, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [32, 32], maxZoom: 6 });
  }, [map, points]);
  // Cap how far the user can zoom out so panning never leaves the trip's own
  // area of interest — also keeps far-away, irrelevant map tiles from loading.
  useEffect(() => {
    if (!restrictBounds) return;
    const z = map.getBoundsZoom(restrictBounds, false);
    map.setMinZoom(Math.max(1, z - 1));
  }, [map, restrictBounds]);
  // Re-apply the actual pan "leash" imperatively every time `restrictBounds`
  // changes. The `maxBounds` prop passed to <MapContainer> below only takes
  // effect at the map's INITIAL creation — react-leaflet does not re-sync it
  // on later renders. `restrictBounds` legitimately grows after mount (a
  // flight leg's far-away airport is geocoded asynchronously, well after the
  // very first render that only has the trip's own cities), so without this
  // the map stayed permanently locked to whatever — often much smaller — area
  // was known at that first render, making the far pin literally unreachable
  // by panning no matter how long you waited. This was invisible on layouts
  // where the container's own resize (see the ResizeObserver effect below)
  // happened to trigger enough re-renders to mask it, which is why it showed
  // up more reliably on the desktop layout — same underlying bug either way.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any — Leaflet's
    // own runtime accepts `null` to clear the restriction; @types/leaflet's
    // `setMaxBounds` signature doesn't include it, hence the cast.
    map.setMaxBounds((restrictBounds ?? null) as any);
  }, [map, restrictBounds]);
  // Leaflet caches the container size at mount time; if the wrapper's real
  // size settles later (flex layout, safe-area insets, async header content
  // on mobile), the map stays sized/centred on stale dimensions. Re-measure
  // and re-fit whenever the container actually resizes.
  useEffect(() => {
    const el = map.getContainer();
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (points.length === 1) {
        map.setView(points[0], map.getZoom(), { animate: false });
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 6 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, points]);
  return null;
}

// Localised notice shown when some transit legs' typed line couldn't be
// checked against real OSM data — they're still drawn (a dotted best-guess
// hop between the two points, see UNVERIFIED_DASH), this just flags that
// they're estimates rather than a confirmed, real route.
function transitNotice(lang: string | undefined, n: number): string {
  const l = (lang || "en").slice(0, 2);
  const M: Record<string, [string, string]> = {
    it: ["tratta mostrata come stima (linea non verificata)", "tratte mostrate come stima (linee non verificate)"],
    en: ["leg shown as an estimate (line not verified)", "legs shown as an estimate (lines not verified)"],
    es: ["tramo mostrado como estimación (línea no verificada)", "tramos mostrados como estimación (líneas no verificadas)"],
    fr: ["trajet affiché en estimation (ligne non vérifiée)", "trajets affichés en estimation (lignes non vérifiées)"],
    de: ["Abschnitt als Schätzung angezeigt (Linie nicht bestätigt)", "Abschnitte als Schätzung angezeigt (Linien nicht bestätigt)"],
    pt: ["trecho exibido como estimativa (linha não verificada)", "trechos exibidos como estimativa (linhas não verificadas)"],
    ja: ["区間は推定表示（未確認の路線）", "区間は推定表示（未確認の路線）"],
    ko: ["구간을 추정치로 표시(미확인 노선)", "구간을 추정치로 표시(미확인 노선)"],
    zh: ["路段以估算方式显示（未验证线路）", "路段以估算方式显示（未验证线路）"],
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
const memFerryPath = new Map<string, LL[]>(); // real ferry-route geometry, keyed by leg (see fetchFerryGeometry)

// v3: bumped from v2 because v2 could contain entries written by the OLD
// `resolve()`, which used to fall back to drawing a failed geocode at its
// COUNTRY'S centroid and then persisted that fake point as if it were a
// real, successful geocode (see `rememberGeo` — it only distinguishes
// null/non-null, so a wrong-but-non-null centroid was cached forever). That
// bug is fixed (no more centroid fallback), but any station/stop that had
// already been geocoded wrong under v2 kept loading its bad cached point on
// every visit regardless. Bumping the key discards every old entry so
// everything is re-geocoded fresh under the corrected logic.
// v4: bumped from v3 because `photonGeocode`'s country-preference check was a
// no-op — it queried Photon with `limit=1`, so there was never a SECOND
// candidate to fall through to if the lone result didn't match the given
// country; it always returned that one result regardless. A same-named
// station/stop in the wrong country could win outright, especially on a
// multi-country trip (see also `buildMapRoutes` in trips.$tripId.tsx, which
// now biases each leg toward the ISO country of its OWN city instead of only
// the trip's single declared country, or no bias at all on a multi-country
// trip). Both are fixed now; bumping the key discards every entry that may
// have been geocoded wrong under the old, unfiltered behaviour.
// v5: bumped from v4 because `geocodePlace`'s `isAirport` used to also
// trigger on a text match against AIRPORT_RE (e.g. a train stop literally
// named "... Aeroport ...") even when the caller had explicitly passed
// airportHint=false — dropping the country filter and biasing toward the
// aerodrome polygon instead of the real station. That's fixed (isAirport
// now follows airportHint alone), but a plane leg whose endpoint is a
// single-airport city (e.g. Barcelona — "BCN - Barcelona", no "El Prat" in
// the label since formatAirport() only appends the airport's own name for
// multi-airport cities) could ALSO have been geocoded wrong earlier and
// then cached as a "successful" lookup — which the cache never retries.
// Bumping the key discards every entry so El Prat (and anything similarly
// affected) gets re-geocoded fresh under the corrected logic.
// v6: bumped from v5 because airport resolution now reads exact coordinates
// straight from the offline airports-json dataset (see airportCoordsByIata /
// airportCoordsByPlaceName in use-airports.ts) instead of depending on a live
// Overpass/Nominatim lookup that could time out, get rate-limited, or match
// the wrong feature. El Prat may still have a stale wrong point cached from
// before this change (and before v5) — bumping discards it so every airport
// pin is resolved fresh from the reliable offline source.
// v7: bumped from v6 because the no-IATA fallback (`airportCoordsByPlaceName`)
// matched a plain city name globally with no country scoping — a city name
// isn't always unique worldwide (e.g. "Barcelona" also names a city with its
// own airport in Venezuela), so a leg whose saved label really is just the
// bare city name (no "IATA - " prefix, e.g. an older leg, or one where the
// picker only ended up storing the city part) could hit that ambiguity and
// fall through to the fuzzier live search after all. Now scoped by the leg's
// own country first. Bumping discards any pin resolved under the old,
// unscoped version of that fallback.
// v8: bumped from v7 because the offline airports-json coordinate lookup
// (airportCoordsByIata/airportCoordsByPlaceName) checked `typeof x ===
// "number"` on latitude_deg/longitude_deg — but that dataset is generated
// from a CSV export, where every field commonly comes through as a STRING
// regardless of its real type. If that was happening here, the check would
// silently fail for EVERY airport, meaning the reliable offline path never
// actually ran and every plane leg quietly fell back to the old live
// Overpass/Nominatim search this was supposed to replace — which is exactly
// the kind of failure that reads as "still wrong" after the fix. Coordinates
// are now coerced with Number(...) so a numeric string resolves correctly.
// Bumping discards any pin resolved while that silent fallback was in play.
// v9: bumped from v8 because the root cause of "El Prat still wrong" for a
// top-level flight leg (as opposed to a mixed-leg local-train stop, already
// fixed) turned out to be upstream of every fix above: `buildMapRoutes` in
// trips.$tripId.tsx never set a `country` at all for a top-level journey leg
// (meta.legs — outbound/return/flight items), so a plane leg's endpoint like
// "Barcelona" reached the v7/v8 country-scoped disambiguation with country
// undefined — same-named-airport-abroad ambiguity (Barcelona, Venezuela)
// couldn't be resolved, the lookup returned null, and it fell through to the
// unscoped live search, which could land on the city rather than the actual
// airport. Plane legs now carry the trip's full country list (comma-
// separated) as that hint. Bumping discards any plane-leg pin resolved
// before this fix existed.
const GEO_LS_KEY = "voyager_geocache_v9";
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
// v2: bumped from v1 because v1 could contain routes simplified by the old
// naive uniform-subsampling algorithm below, which dropped real turn/curve
// points and left geometry that visually cuts across buildings. Bumping the
// key forces those stale, degraded entries to be discarded so every route is
// re-fetched fresh and re-simplified with the new shape-preserving algorithm.
const ROUTE_LS_KEY = "voyager_routecache_v2";
const ROUTE_PERSIST_CAP = 60;   // max entries persisted per cache type (road/rail/transit)
const ROUTE_MAX_POINTS = 250;   // max points kept per polyline once persisted

// Perpendicular distance from point p to the line through a-b (used by
// Douglas-Peucker below).
function perpDist(p: LL, a: LL, b: LL): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx, cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

// Classic Douglas-Peucker: keeps the points that actually define a turn or
// curve and drops only near-collinear ones, so the simplified path still
// hugs the real road geometry instead of straightening bends into chords
// that cut across buildings.
function douglasPeucker(pts: LL[], epsilon: number): LL[] {
  if (pts.length < 3) return pts;
  let maxDist = 0;
  let idx = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxDist) { maxDist = d; idx = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, idx + 1), epsilon);
    const right = douglasPeucker(pts.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

// Shape-preserving downsample — keeps the route's real turns/curves while
// bounding how much JSON we write to localStorage. The in-memory copy used
// for the current session stays full-resolution; only the persisted copy is
// thinned. Starts with a small epsilon (~5m) and progressively loosens it
// until the result fits within maxPoints; if Douglas-Peucker alone can't get
// there, a final evenly-spaced pass trims the remainder (this only kicks in
// for extremely dense/wiggly paths, so it barely affects overall shape).
function simplifyLL(pts: LL[], maxPoints = ROUTE_MAX_POINTS): LL[] {
  if (!Array.isArray(pts) || pts.length <= maxPoints) return pts;
  let eps = 0.00005; // ~5m in degrees
  let out = douglasPeucker(pts, eps);
  let guard = 0;
  while (out.length > maxPoints && guard < 8) {
    eps *= 2;
    out = douglasPeucker(pts, eps);
    guard++;
  }
  if (out.length <= maxPoints) return out;
  const step = out.length / maxPoints;
  const res: LL[] = [];
  for (let i = 0; i < maxPoints; i++) res.push(out[Math.floor(i * step)]);
  res.push(out[out.length - 1]);
  return res;
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
      ferry?: Record<string, LL[]>;
    };
    for (const [k, v] of Object.entries(o.road ?? {})) memRoad.set(k, v);
    for (const [k, v] of Object.entries(o.rail ?? {})) memRail.set(k, v);
    for (const [k, v] of Object.entries(o.transit ?? {})) memTransit.set(k, v);
    for (const [k, v] of Object.entries(o.ferry ?? {})) memFerryPath.set(k, v);
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
    const ferry: Record<string, LL[]> = {};
    for (const [k, v] of lastEntries(memFerryPath, ROUTE_PERSIST_CAP)) ferry[k] = simplifyLL(v);
    localStorage.setItem(ROUTE_LS_KEY, JSON.stringify({ road, rail, transit, ferry }));
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
  // Subscribes this component to re-render once a background translation of
  // a non-Latin pin/stop label resolves (see withRomanization) — otherwise a
  // label fetched after this component's initial render would never appear
  // until something else happened to trigger a re-render.
  useTranslationTick();
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
  // Real ferry-route geometries per leg (keyed by the leg key), from the
  // route=ferry relation's own OSM way geometry (see fetchFerryGeometry) —
  // there's no routing-engine equivalent of OSRM/BRouter for sea routes, so
  // this reads the actual mapped shape directly instead of calling a service.
  const [ferryPathCache, setFerryPathCache] = useState<Record<string, [number, number][]>>(() => Object.fromEntries(memFerryPath));
  // Geocoded city centres for transit-line searches, keyed by `${country}|${city}`.
  const [cityGeo, setCityGeo] = useState<Record<string, { lat: number; lng: number } | null>>(() => Object.fromEntries(memGeoCtr));

  // Unique endpoints to geocode for the legs we draw by geocoding (planes,
  // cars, ferries, and transit legs). A transit-with-line leg (bus/metro/
  // tram/local-train with a real line ref) is ALSO located from its OSM
  // relation via `drawn` — more precise — but `drawn` only computes anything
  // when the "Tratte" switch is on (see `showRoutes` below); the default view
  // is "Città". A transit-with-line leg used to be skipped here entirely on
  // the assumption `drawn` would always cover it, which meant its endpoint
  // contributed NOTHING to the camera framing / maxBounds leash while on the
  // default "Città" view — exactly the "can't pan to the departure country"
  // regression reported repeatedly. This must NOT regress again: every leg's
  // endpoint, regardless of mode or whether it has a line ref, is geocoded
  // here so `boundsPoints`/`restrictBounds` below always have a fallback
  // point for it — `drawn`'s more precise pin, when available, still refines
  // it further, but never has to be the ONLY source.
  const routeEndpoints = useMemo<Array<{ name: string; country?: string; airport: boolean; iata?: string | null }>>(() => {
    // Geocode leg endpoints even in the "cities" view, so every leg endpoint (e.g.
    // a departure city that isn't in the trip's city list) can appear on the map.
    if (!routes || routes.length === 0) return [];
    const seen = new Map<string, { name: string; country?: string; airport: boolean; iata?: string | null }>();
    for (const r of routes) {
      const airport = r.mode === "plane";
      const raws = [r.from, r.to];
      // Road-leg waypoints (car/moto) need geocoding ONLY when they don't already
      // carry coordinates (picked from suggestions).
      if (r.mode === "car" || r.mode === "moto" || r.mode === "taxi")
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
        const stripped = stripHubCityPrefix(e.name);
        // Try the precise, city-prefix-stripped query first (e.g. just
        // "Belfast Lanyon Place" rather than "Belfast – Belfast Lanyon
        // Place") — falls back to the original full label if that finds
        // nothing, so this can only ever do as well as before, never worse.
        let coord =
          (stripped !== e.name ? await geocodePlace(stripped, e.country, e.airport, e.iata) : null) ??
          (await geocodePlace(e.name, e.country, e.airport, e.iata));
        // Airport endpoints only: pull the pin onto the nearest real runway
        // instead of leaving it at the dataset's terminal/road-side
        // reference point (see snapToNearestRunway).
        if (coord && e.airport) coord = await snapToNearestRunway(coord.lat, coord.lng);
        updates[key] = coord;
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
  // `isAirport` (true only for a plane leg's own from/to, set by every caller
  // below) skips the "reuse the trip city's own marker" shortcut: that
  // shortcut exists so e.g. a train leg's "Barcelona - Sants" endpoint reuses
  // the same dot as the Barcelona city marker instead of drawing a second,
  // slightly-different one — reasonable for a place that genuinely IS the
  // city. But a plane leg's "Barcelona" means Barcelona's AIRPORT (El Prat,
  // ~12 km from the centre) — snapping it onto the city-centre marker was
  // exactly why the airport pin kept landing on Barcelona itself no matter
  // how the actual airport-coordinate lookup below was fixed: this shortcut
  // ran FIRST and returned before that logic was ever reached.
  const resolve = useMemo(() => {
    return (raw: string, country?: string, isAirport?: boolean): [number, number] | null => {
      const name = cleanPlace(raw);
      if (!isAirport) {
        const byCity = cityByName.get(_normName(name));
        if (byCity) return byCity;
      }
      const key = `${country ?? ""}|${name}`;
      const cached = routeGeo[key];
      if (cached) return [cached.lat, cached.lng];
      // No country-centroid fallback on a failed geocode: a whole country's
      // geometric centre is nowhere near any real place, so it read as a
      // "random" pin rather than a legible failure — and if two different
      // legs' geocodes both failed under the same country, they'd land on
      // the exact same point, looking like one station's pin showing at
      // another's spot. Returning null instead leaves that one leg's
      // endpoint/pin simply undrawn, which is a far more honest failure mode
      // than a specific-looking but wrong location.
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
      vias: Via[]; viasReady: boolean; pathKey: string; intercity?: boolean;
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
      const a = resolve(r.from, r.country, r.mode === "plane");
      const b = resolve(r.to, r.country, r.mode === "plane");
      // Build the road-leg vias (car/moto): city stops (with a pin).
      // `viasReady` waits for city coordinates.
      const vias: Via[] = [];
      let viasReady = true;
      if (r.mode === "car" || r.mode === "moto" || r.mode === "taxi") {
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
        intercity: r.intercity,
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
    () => routeLines.filter((l) => l.mode === "train" && !l.line && l.a && l.b && !(l.pathKey in railCache)).length,
    [routeLines, railCache],
  );
  const transitPending = useMemo(
    () => routeLines.filter((l) => TRANSIT_MODES.has(l.mode) && l.line && l.center && !(l.cacheKey in transitPathCache)).length,
    [routeLines, transitPathCache],
  );
  const ferryPending = useMemo(
    () => routeLines.filter((l) => l.mode === "ferry" && l.a && l.b && !(l.pathKey in ferryPathCache)).length,
    [routeLines, ferryPathCache],
  );
  const hasUnresolved = !!showRoutes && (roadPending > 0 || railPending > 0 || transitPending > 0 || ferryPending > 0);

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
  // so they follow the tracks instead of drawing a straight line. Keyed by
  // `pathKey` (which bakes in the resolved a/b coordinates), NOT the bare
  // leg key (index+from+to text alone) — otherwise, if this same leg's
  // endpoint geocode ever changes (a geocache invalidation, a fixed bias
  // bug causing a re-resolve to a different, corrected point, …), the OLD
  // rail path stays cached and keeps drawing tracks anchored to the stale
  // coordinates even after the pins themselves have moved to the right spot.
  useEffect(() => {
    const pending = routeLines.filter((l) => l.mode === "train" && !l.line && l.a && l.b && !(l.pathKey in railCache));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchRailPath(l.a!, l.b!);
        if (path) updates[l.pathKey] = path;
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

  // Trace ferry legs along the real sea route (see fetchFerryGeometry) instead
  // of the straight dashed line — same pathKey-based caching as the rail
  // snapping above (bakes in the resolved a/b coordinates, so a later geocode
  // fix doesn't leave a stale path anchored to the old point). Falls back to
  // the existing straight-line rendering when no matching mapped ferry route
  // is found (short/rarely-mapped crossings, or a typo'd port name).
  useEffect(() => {
    const pending = routeLines.filter((l) => l.mode === "ferry" && l.a && l.b && !(l.pathKey in ferryPathCache));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchFerryGeometry(l.a!, l.b!);
        if (path) updates[l.pathKey] = path;
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        for (const [k, v] of Object.entries(updates)) memFerryPath.set(k, v);
        capMap(memFerryPath, 120);
        setFerryPathCache((prev) => ({ ...prev, ...updates }));
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
  type TPin = { ll: LL; name: string; big: boolean; board?: boolean };
  // `noGeometry` marks an "ok" (verified stops) leg whose OSM route relation
  // carried no linked way geometry at all (common for many bus relations that
  // are tagged with stops but never linked to the actual road ways) — its
  // `positions` is just a straight hop between the two matched stop
  // coordinates, not a real path. Still a CONFIRMED stop pair (unlike
  // "failed"), so it's not dotted, but it still needs road-snapping (see the
  // dedicated fetch effect below) so it doesn't draw as a chord across
  // buildings/blocks.
  type TResolved = { state: "pending" | "failed" | "ok"; positions?: LL[]; pins?: TPin[]; color?: string; noGeometry?: boolean };
  const transitResolved = useMemo<Record<string, TResolved>>(() => {
    const map: Record<string, TResolved> = {};
    if (!showRoutes || !routes) return map;

    // Match a stored stop name to a real relation stop. Name matching alone is
    // ambiguous: `sameStop`'s substring check means a stop literally named
    // "Modena" matches, but so does e.g. "Via Modena" — a street in a
    // *different* town (Formigine, Soliera, …) named after the road leading to
    // Modena, which is common in Italian stop naming. Picking the first array
    // hit (as this used to) meant the SAME leg could resolve to a different,
    // wrong physical stop across renders depending on Overpass's non-guaranteed
    // element order. Fixed by: (1) always preferring an EXACT name match over a
    // loose substring/edit-distance one, and (2) within a tier, breaking ties by
    // picking the candidate physically closest to the leg's geocoded city
    // centre — a stop actually in Modena will always sit much nearer to
    // Modena's city-centre coordinate than a same-named stop in a neighbouring
    // town several km away.
    const distTo = (s: TransitStop, center: LL) => {
      const dy = s.ll[0] - center[0];
      const dx = (s.ll[1] - center[1]) * Math.cos((center[0] * Math.PI) / 180);
      return dx * dx + dy * dy;
    };
    const nearestOf = (cands: TransitStop[], center: LL): TransitStop | null => {
      if (cands.length === 0) return null;
      if (cands.length === 1) return cands[0];
      return cands.reduce((best, s) => (distTo(s, center) < distTo(best, center) ? s : best));
    };
    const matchStop = (raw: string, union: TransitStop[], center: LL): TransitStop | null => {
      const exact = union.filter((s) => _normName(cleanPlace(s.name)) === _normName(cleanPlace(raw)));
      if (exact.length > 0) return nearestOf(exact, center);
      const loose = union.filter((s) => sameStop(s.name, raw));
      if (loose.length > 0) return nearestOf(loose, center);
      const fuzzy = union.filter((s) => similarStop(s.name, raw));
      return nearestOf(fuzzy, center);
    };

    routeLines.forEach((l) => {
      if (!TRANSIT_MODES.has(l.mode)) return;
      const key = l.key;
      // No line ref → nothing to look up; leave it to the geocoded straight line
      // in `drawn` (NO "not traceable" notice for these).
      if (!l.line) return;
      if (!l.center) { map[key] = { state: "pending" }; return; } // stops not geocoded yet
      const center: LL = l.center;
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

      const board = matchStop(l.from, union, center);
      const alight = matchStop(l.to, union, center);
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
        { ll: projectOnPath(positions, board.ll), name: board.name, big: true, board: true },
        ...mids.map((s) => ({ ll: projectOnPath(positions, s.ll), name: s.name, big: false })),
        { ll: projectOnPath(positions, alight.ll), name: alight.name, big: true, board: false },
      ];
      map[key] = { state: "ok", positions, pins, color: tl.color, noGeometry: !chosen };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeLines, showRoutes, transitPathCache]);

  // A transit leg whose typed line couldn't be verified ("failed" above) is
  // still drawn (see `drawn` below), but as a real road hop rather than a
  // straight line — it's just as unconfirmed as a straight line would be
  // (hence still dotted, see UNVERIFIED_DASH), but at least it doesn't cut
  // across buildings/water like a straight chord would. Reuses the same OSRM
  // driving-route fetch and `pathCache` as ground legs (keyed by `l.pathKey`).
  // Also covers a bus/tram/metro leg that never had ANY line ref typed at
  // all (`!l.line`) — that used to bypass `transitResolved` entirely
  // (`if (!l.line) return;` there) and fall all the way to the plain
  // straight-line, non-dashed generic path, since `unverified` was only ever
  // set from a "failed" lookup, which never happens without a line to look
  // up in the first place. Trains are excluded here: a line-less train leg
  // already gets its own BRouter rail-snapped path (see `railCache`) rather
  // than an OSRM road path.
  useEffect(() => {
    const pending = routeLines.filter(
      (l) =>
        TRANSIT_MODES.has(l.mode) &&
        l.mode !== "train" &&
        (transitResolved[l.key]?.state === "failed" || !l.line) &&
        l.a && l.b &&
        !(l.pathKey in pathCache),
    );
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const path = await fetchRoadPathVia([l.a!, l.b!]);
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
  }, [routeLines, transitResolved, retryTick]);

  // A transit leg that DID resolve to a confirmed stop pair ("ok") can still
  // have no usable track geometry at all — many OSM bus route relations are
  // tagged with their stops but were never linked to the actual road ways, so
  // `positions` there is nothing but a straight hop between the two matched
  // stops (see `noGeometry` above). That's a real, verified route — so unlike
  // the "failed"/unverified case it must stay SOLID, not dotted — but it
  // still needs the road-snap treatment so it doesn't cut a straight chord
  // across buildings. Reuses the same OSRM fetch + `pathCache` as ground legs
  // and unverified transit legs, keyed by `l.pathKey`.
  useEffect(() => {
    const pending = routeLines.filter((l) => {
      if (!TRANSIT_MODES.has(l.mode) || !l.line) return false;
      const res = transitResolved[l.key];
      return !!(res?.state === "ok" && res.noGeometry && res.positions && res.positions.length >= 2 && !(l.pathKey in pathCache));
    });
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, [number, number][]> = {};
      for (const l of pending) {
        const pts = transitResolved[l.key]?.positions;
        if (!pts || pts.length < 2) continue;
        const path = await fetchRoadPathVia([pts[0], pts[pts.length - 1]]);
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
  }, [routeLines, transitResolved, retryTick]);

  // Assemble the drawn geometry + coloured pins for every leg. Transit legs come
  // from transitResolved (relation stops); ground legs use the OSRM road path;
  // everything else is a straight line between geocoded endpoints.
  const drawn = useMemo(() => {
    type Pin = { ll: LL; name: string; big: boolean; hollow?: boolean; board?: boolean };
    type Drawn = { key: string; color: string; dash?: string; positions: LL[]; pins: Pin[]; mode: string; line?: string };
    if (!showRoutes || !routes) return [] as Drawn[];
    const out: Drawn[] = [];
    routeLines.forEach((l) => {
      const key = l.key;
      const { color: baseColor, dash } = modeStyle(l.mode);
      // Intercity/airport buses draw in a distinct colour from local urban ones.
      const color = l.mode === "bus" && l.intercity ? INTERCITY_BUS_COLOR : baseColor;

      // A leg with a line ref that resolves to a real OSM relation ("ok") draws
      // that exact track. One that's still loading ("pending") is skipped for
      // now, to avoid flashing a wrong fallback before the real geometry is in.
      // One OSM couldn't verify at all ("failed" — an unknown ref, or a
      // boarding/alighting name that doesn't match any real stop on it) is NOT
      // silently dropped: it falls through to the road-snapped drawing below
      // (same OSRM path ground legs use, see the fetch effect above it), just
      // forced dotted — a manually-typed, unverifiable line still shows a real
      // road it could plausibly follow, rather than either vanishing from the
      // map or cutting a straight chord across buildings/water.
      let unverified = false;
      if (TRANSIT_MODES.has(l.mode)) {
        const res = transitResolved[key];
        if (res) {
          if (res.state === "ok" && res.positions && res.pins) {
            // Metro, tram, train AND bus lines draw in their real network
            // colour when OSM tags it (e.g. Milano M1 red, Roma B blue,
            // Barcelona's Rodalies R2 Nord's own line colour, or a city bus
            // line's own livery colour) — falls back to the fixed mode
            // colour when the line's real colour is unknown.
            const usesRealColor = l.mode === "metro" || l.mode === "tram" || l.mode === "train" || l.mode === "bus";
            const lineColor = usesRealColor && res.color ? res.color : color;
            // No real track geometry from OSM (see `noGeometry`) → use the
            // OSRM-snapped road path fetched above instead of the raw
            // straight board→alight hop, once it's ready; stays solid (not
            // dashed) since the stops are confirmed real, just re-drawn onto
            // an actual street.
            let positions = res.positions;
            let pins = res.pins;
            if (res.noGeometry && pathCache[l.pathKey]) {
              const snapped = pathCache[l.pathKey];
              positions = snapped;
              pins = res.pins.map((p) => ({ ...p, ll: projectOnPath(snapped, p.ll) }));
            }
            out.push({ key, color: lineColor, dash, positions, pins, mode: l.mode, line: l.line });
            return;
          }
          if (res.state === "pending") return;
          unverified = true; // state === "failed"
        } else if (l.mode !== "train") {
          // No line ref was ever typed for this leg, so it never entered
          // transitResolved at all (`if (!l.line) return;` there) — treat it
          // the same as an unverified/failed line: still drawn, dotted, and
          // road-snapped once the fetch effect above resolves it, instead of
          // a plain straight, solid chord. Trains are excluded — a line-less
          // train leg gets BRouter rail-snapping instead (see railCache below).
          unverified = true;
        }
      }

      // Non-transit legs (and unverified transit legs, drawn dotted below) →
      // geocoded endpoints, snapped to roads (car/moto via OSRM, through the
      // "enter" waypoints) or to the railway (train, via BRouter).
      const a = l.a, b = l.b;
      if (!a || !b) return;
      let positions: LL[] = [a, b];
      // Unverified transit legs get the same OSRM road-snapped path as ground
      // legs (see the fetch effect above) — falls back to the straight [a, b]
      // above until that finishes, then upgrades to the real road, still dotted.
      if ((GROUND_MODES.has(l.mode) || unverified) && pathCache[l.pathKey]) positions = pathCache[l.pathKey];
      else if (l.mode === "train" && railCache[l.pathKey]) positions = railCache[l.pathKey];
      else if (l.mode === "ferry" && ferryPathCache[l.pathKey]) positions = ferryPathCache[l.pathKey];
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
      // Departure/arrival are tagged with an explicit `board` flag rather than
      // relying on array position — when the departure pin is omitted here
      // (isCity(a), the trip's own city pin stands in for it), the arrival pin
      // would otherwise become index 0 among the "big" pins and be wrongly
      // rendered as boarding (line-number badge) instead of alighting (down
      // arrow). The flag keeps the two ends semantically correct no matter
      // which pins end up omitted.
      const pins: Pin[] = [];
      if (!isCity(a)) pins.push({ ll: startPt, name: cleanPlace(l.from), big: true, board: true });
      for (const v of l.vias) if (v.pin) pins.push({ ll: projectOnPath(positions, v.ll), name: v.label, big: true, hollow: true });
      if (!isCity(b)) pins.push({ ll: endPt, name: cleanPlace(l.to), big: true, board: false });
      out.push({ key, color, dash: unverified ? UNVERIFIED_DASH : dash, positions, pins, mode: l.mode, line: l.line });
    });
    return out;
  }, [routeLines, routes, showRoutes, transitResolved, pathCache, railCache, ferryPathCache, cityKeySet]);

  // ── Overlap offsetting for ground routes ─────────────────────────────────
  // When two car/moto/taxi legs share the same stretch of road (identical
  // OSRM-snapped points), drawing both directly on top of each other hides
  // all but the last one. Detect points shared by more than one ground
  // route and nudge each sharing route sideways — perpendicular to its
  // local direction, by a small latitude-corrected distance — so an
  // overlapping stretch renders as parallel lines instead of one hiding
  // the other. Non-overlapping stretches (and pins, which stay anchored to
  // the real address) are left untouched.
  const drawnOffset = useMemo(() => {
    const OFFSET_METERS = 3.5; // gap between parallel lines
    const GRID = 5000; // ~0.0002° (~18–22m) cell — tight enough to catch true
    // road-sharing without falsely merging separate, nearby streets.

    const groundLines = drawn.filter((d) => GROUND_MODES.has(d.mode) && d.positions.length > 1);
    if (groundLines.length < 2) return drawn;

    const cellOf = (lat: number, lng: number) => `${Math.round(lat * GRID)}|${Math.round(lng * GRID)}`;

    // Bucket every ground-route point by its rounded grid cell.
    const buckets = new Map<string, string[]>();
    groundLines.forEach((d) => {
      d.positions.forEach(([lat, lng]) => {
        const cell = cellOf(lat, lng);
        let arr = buckets.get(cell);
        if (!arr) { arr = []; buckets.set(cell, arr); }
        if (!arr.includes(d.key)) arr.push(d.key);
      });
    });

    // Stable rank so two overlapping lines are pushed to consistent,
    // opposite sides rather than flip-flopping from render to render.
    const rankByKey = new Map(groundLines.map((d, i) => [d.key, i]));

    const offsetOne = (d: (typeof groundLines)[number]): LL[] =>
      d.positions.map((p, i) => {
        const [lat, lng] = p;
        const sharers = buckets.get(cellOf(lat, lng)) ?? [];
        if (sharers.length < 2) return p;
        const ordered = [...sharers].sort((a, b) => (rankByKey.get(a)! - rankByKey.get(b)!));
        const slot = ordered.indexOf(d.key);
        const mid = (ordered.length - 1) / 2;
        const shift = (slot - mid) * OFFSET_METERS;
        if (!shift) return p;

        // Local tangent from neighbouring points, rotated 90° for the
        // perpendicular; falls back gracefully at the polyline's ends.
        const prev = d.positions[i - 1] ?? p;
        const next = d.positions[i + 1] ?? p;
        const dLat = next[0] - prev[0];
        const dLng = next[1] - prev[1];
        const len = Math.hypot(dLat, dLng) || 1;
        const perpLat = -dLng / len;
        const perpLng = dLat / len;

        const latRad = (lat * Math.PI) / 180;
        const metersPerDegLat = 111320;
        const metersPerDegLng = 111320 * Math.cos(latRad) || 1;
        return [lat + (perpLat * shift) / metersPerDegLat, lng + (perpLng * shift) / metersPerDegLng] as LL;
      });

    const offsetByKey = new Map(groundLines.map((d) => [d.key, offsetOne(d)]));
    return drawn.map((d) => {
      const off = offsetByKey.get(d.key);
      return off ? { ...d, positions: off } : d;
    });
  }, [drawn]);

  // Half-width (px) of a boarding/alighting badge as actually drawn by
  // `endpointIcon` — a plain circle is a fixed 28px (+2.5px border each
  // side), a line-ref capsule is wider and grows with the ref's text length.
  // Used below to space adjacent badges so they just touch rather than using
  // one fixed gap for every pair (which either overlapped wide capsules or
  // left plain circles looking needlessly far apart).
  function badgeHalfWidthPx(mode: string, line: string | undefined | null, isBoarding: boolean): number {
    const hasLine = isBoarding && LINE_LABEL_MODES.has(mode) && !!(line ?? "").trim();
    if (!hasLine) return 16.5; // plain circle: 28px + 2.5px border each side
    // Capsule: left/right padding (6+8) + icon (15) + gap (4) + text (~7px/
    // char at 11px bold, plus letter-spacing) + border (2.5 each side).
    const textW = (line ?? "").trim().length * 7.4;
    return (6 + 8 + 15 + 4 + textW + 5) / 2;
  }

  // ── Overlap offsetting for coincident endpoint pins ──────────────────────
  // A "big" endpoint badge (boarding/alighting icon) can land on (or very
  // near) another leg's endpoint badge — the classic case being an airport
  // that's the ARRIVAL of one leg and the DEPARTURE of the next, but also a
  // DIFFERENT mode's badge at the "same" real place (e.g. a flight's airport
  // pin and its airport-bus pin), whose geocoded coordinates are close but
  // rarely bit-for-bit identical. Leaflet just stacks overlapping markers, so
  // only the topmost one is visible/clickable. Clustering by PROXIMITY
  // (union-find over real-world distance), not by exact/rounded-coordinate
  // equality, is what catches that second case — two pins 20m apart at an
  // airport are the same visual problem as two pins 0m apart, but a strict
  // coordinate match only ever caught the latter.
  //
  // Each pin in a cluster gets a fixed PIXEL offset (see `endpointIcon`'s
  // `offsetPx`), NOT a geographic one — a metres-based lat/lng offset shrinks
  // to a sub-pixel, invisible gap at anything but maximum zoom (badges only
  // ever looked separated fully zoomed in, exactly as reported) and still
  // varies with latitude/zoom. A pixel offset via the icon's own anchor
  // keeps badges a constant, correct distance apart on screen at every zoom
  // level. The underlying route lines still terminate at the real, un-nudged
  // coordinate; only each badge's drawn position shifts. The per-pair gap is
  // each badge's own half-width plus a small safety margin, so badges of any
  // size (plain circle or wide line-ref capsule) end up touching without
  // overlapping — not a one-size-fits-all fixed distance.
  //
  // A cluster can also contain a real duplicate rather than a genuine
  // overlap: two BOARDING pins for the SAME line (identical mode + line ref)
  // at the same stop mean the trip just continues on the same vehicle — not
  // a real alight-and-reboard — so only the first one is kept (see
  // `pinSkip` below); a boarding pin for a DIFFERENT line still gets its own
  // badge, and alighting (arrow) pins are never deduplicated.
  //
  // Layout within a cluster is now MODE-first: one row per mode (car with
  // car, bus with bus, plane with plane…). Within a row, same-mode badges
  // are placed with ZERO gap between them — they touch edge-to-edge, not
  // overlapping, per the user's explicit "non ci deve essere spazio... Devono
  // toccarsi ma non sovrapporsi". Different-mode rows get a small but
  // deliberate vertical gap (ROW_GAP_PX) so they read as visually distinct
  // groups. Both axes are centred on the cluster's real point (mean-of-zero)
  // so the whole stack stays visually anchored to where the route lines
  // actually end, instead of drifting sideways the more distinct modes pile
  // up (the previous single-row layout put every mode on the same line, so
  // 3+ different vehicles at one spot could spread badges tens of pixels
  // from their true endpoint — exactly the Foto 4 complaint).
  const { pinNudge, pinSkip } = useMemo(() => {
    // Real-world radius within which two pins are considered "the same
    // spot" for decluttering purposes — generous enough to catch an
    // airport's terminal-vs-bus-stop geocoding drift, tight enough to never
    // merge two genuinely different nearby places. Widened from 70m: several
    // real airport/station layouts (terminal building vs. the actual bus/
    // taxi stand, or a road pin vs. its rail pin at the same interchange)
    // still sat just outside 70m and kept showing as two separate,
    // un-clustered badges.
    const CLUSTER_RADIUS_M = 120;
    const ROW_HEIGHT_PX = 28; // matches the 28px circle / 26px capsule badge height
    const ROW_GAP_PX = 8; // visible-but-modest gap between different-mode rows
    // Badges are spaced edge-to-edge using their exact half-widths, but a
    // circle's own anti-aliased/border edge still reads as a hairline gap at
    // that exact distance — pull every pair 1px closer so adjacent badges
    // visibly touch (a slight overlap of their outer borders) rather than
    // leaving the faint sliver of background the user kept seeing at every
    // zoom level.
    const TOUCH_OVERLAP_PX = 1;

    type Big = { dKey: string; idx: number; ll: LL; mode: string; line?: string | null; board?: boolean; halfW: number };
    const pins: Big[] = [];
    drawn.forEach((d) => {
      d.pins.forEach((p, idx) => {
        if (!p.big || p.hollow) return;
        pins.push({
          dKey: d.key, idx, ll: p.ll, mode: d.mode, line: d.line, board: p.board,
          halfW: badgeHalfWidthPx(d.mode, d.line, !!p.board),
        });
      });
    });
    const noOffsets = new Map<string, [number, number]>();
    const noSkips = new Set<string>();
    if (pins.length < 2) return { pinNudge: noOffsets, pinSkip: noSkips };

    // Union-find over pairwise proximity, so A–B close and B–C close still
    // cluster all three together (not just A–B), regardless of leg/mode.
    const parent = pins.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x];
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent[ra] = rb;
    };
    for (let i = 0; i < pins.length; i++) {
      for (let j = i + 1; j < pins.length; j++) {
        if (_approxDistM(pins[i].ll, pins[j].ll) <= CLUSTER_RADIUS_M) union(i, j);
      }
    }
    const clusters = new Map<number, number[]>();
    pins.forEach((_, i) => {
      const r = find(i);
      let arr = clusters.get(r);
      if (!arr) { arr = []; clusters.set(r, arr); }
      arr.push(i);
    });

    const skip = new Set<string>();
    const out = new Map<string, [number, number]>(); // `${dKey}-${idx}` -> [offsetXPx, offsetYPx]
    for (const idxs0 of clusters.values()) {
      if (idxs0.length < 2) continue;
      // Drop duplicate boardings for the same (mode, line) within this
      // cluster before laying anything out, so they don't consume a slot.
      // Alighting (down-arrow) pins get the same treatment, keyed by mode
      // alone — an arrow carries no line ref, and two legs of the same mode
      // ending at the same real spot (e.g. an interchange) is still just
      // "you get off here" once, not twice (Foto 1: "la discesa deve essere
      // solo una").
      const seenBoard = new Set<string>();
      const seenAlight = new Set<string>();
      const idxs = idxs0.filter((pinIdx) => {
        const p = pins[pinIdx];
        if (!p.board) {
          if (seenAlight.has(p.mode)) { skip.add(`${p.dKey}-${p.idx}`); return false; }
          seenAlight.add(p.mode);
          return true;
        }
        const k = `${p.mode}|${(p.line ?? "").trim().toLowerCase()}`;
        if (seenBoard.has(k)) { skip.add(`${p.dKey}-${p.idx}`); return false; }
        seenBoard.add(k);
        return true;
      });
      if (idxs.length < 2) continue;

      // Group the cluster's surviving pins by mode — one row per mode, in
      // stable first-seen order (insertion order from `drawn`, itself stable
      // per render) so rows never flip-flop between renders.
      const modeOrder: string[] = [];
      const byMode = new Map<string, number[]>();
      idxs.forEach((pinIdx) => {
        const m = pins[pinIdx].mode;
        let arr = byMode.get(m);
        if (!arr) { arr = []; byMode.set(m, arr); modeOrder.push(m); }
        arr.push(pinIdx);
      });

      // A cluster with only one mode present just needs the horizontal
      // same-mode layout below, with no vertical component at all — treat it
      // as row 0 like any other single-mode row.
      modeOrder.forEach((mode, rowI) => {
        const rowIdxs = byMode.get(mode)!;
        // Lay out left→right using each badge's own half-width so adjacent
        // same-mode badges touch with ZERO extra gap, then centre the row on
        // x=0 so it doesn't drift sideways off the real endpoint.
        const xGaps = rowIdxs.slice(1).map((_, i) => pins[rowIdxs[i]].halfW + pins[rowIdxs[i + 1]].halfW - TOUCH_OVERLAP_PX);
        const xPos: number[] = [0];
        xGaps.forEach((g) => xPos.push(xPos[xPos.length - 1] + g));
        const xMean = xPos.reduce((a, b) => a + b, 0) / xPos.length;
        const rowY = rowI * (ROW_HEIGHT_PX + ROW_GAP_PX);
        rowIdxs.forEach((pinIdx, i) => {
          const { dKey, idx } = pins[pinIdx];
          out.set(`${dKey}-${idx}`, [xPos[i] - xMean, rowY]);
        });
      });

      // Centre the whole stack of rows vertically on y=0 too, so — same
      // logic as the horizontal centring — a 2-mode cluster sits half above/
      // half below the real point rather than growing only downward away
      // from it.
      const rowCount = modeOrder.length;
      if (rowCount > 1) {
        const yMean = ((rowCount - 1) * (ROW_HEIGHT_PX + ROW_GAP_PX)) / 2;
        idxs.forEach((pinIdx) => {
          const { dKey, idx } = pins[pinIdx];
          const cur = out.get(`${dKey}-${idx}`);
          if (cur) out.set(`${dKey}-${idx}`, [cur[0], cur[1] - yMean]);
        });
      }
    }
    return { pinNudge: out, pinSkip: skip };
  }, [drawn]);

  // Count transit legs whose line couldn't be resolved from OSM data, to warn.
  const missingTransit = useMemo(() => {
    if (!showRoutes || !routes) return 0;
    let n = 0;
    for (const key of Object.keys(transitResolved)) {
      if (transitResolved[key].state === "failed") n++;
    }
    return n;
  }, [showRoutes, routes, transitResolved]);

  // Persist to localStorage as soon as there's anything new to save — NOT
  // gated on every single leg being fully resolved first. The previous
  // behaviour only flushed once every leg had settled and no "tratta
  // mancante" notice was showing; if the user navigated away (or closed the
  // tab) before EVERY leg finished — easy on a trip with several transit
  // legs, each needing its own slow, sequential Overpass fetch — nothing was
  // ever written, so the next visit re-fetched the whole trip from scratch
  // again ("the cache seems to have disappeared"). Flushing on every
  // incremental cache update instead means whatever HAS resolved by the time
  // the user leaves gets saved; `rememberRoute` only (re)schedules a single
  // debounced write, so a burst of updates still coalesces into one.
  useEffect(() => {
    if (!showRoutes || !routes || routes.length === 0) return;
    rememberRoute();
  }, [showRoutes, routes, pathCache, railCache, transitPathCache, ferryPathCache]);

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
        const ll = resolve(raw, r.country, r.mode === "plane");
        if (!ll) continue;
        const k = `${ll[0].toFixed(3)},${ll[1].toFixed(3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ ll, name: cleanPlace(raw) });
      }
    }
    return out;
  }, [routes, resolve]);

  // Fit the view to EVERY pin — trip cities plus every leg endpoint (including
  // ones in the user's home/departure country) plus the drawn route geometry —
  // regardless of which switch ("Città" vs "Tratte") is currently active. This
  // used to only include leg endpoints/routes in the "Tratte" view, so the
  // initial camera (and any re-fit before the user's first manual pan) framed
  // just the trip's own cities even though transport pins reaching into the
  // home country were one pan away — every reload effectively re-centred on
  // the cities only. What's actually DRAWN on screen still depends on the
  // switch (unchanged, see the JSX below); only the camera framing is now
  // consistent between the two views.
  const boundsPoints = useMemo<[number, number][]>(
    () => [...cityPoints, ...legEndpoints.map((e) => e.ll), ...drawn.flatMap((d) => d.positions)],
    [cityPoints, legEndpoints, drawn],
  );

  // Trip-wide area of interest — a real-world "leash" so the map can't
  // wander off to an unrelated continent, but stays generous enough that
  // panning from one trip pin toward another (e.g. from the destination
  // city out toward the home-country pin) is never blocked partway there.
  //
  // Built from EVERY pin actually rendered on the map: trip cities, every
  // leg's generic resolved endpoint, AND every pin inside `drawn` — which for
  // public-transit legs (bus/tram/metro/train with a line ref) is the REAL
  // OSM relation stop coordinate from `matchStop`, not the generic geocode
  // used for `legEndpoints`. Those two can differ meaningfully (a stop's
  // precise position vs. a coarse name-based geocode of the same label), and
  // omitting the real ones was the actual bug: a transit pin that landed
  // outside the leash became permanently unreachable — maxBounds prevented
  // the viewport from ever panning/zooming to it, which is indistinguishable
  // from "the line just isn't there" even though it was still being drawn.
  // Including `drawn`'s pins closes that gap for every mode, not just
  // transit, and fixes the map on every device since they all share this
  // same maxBounds/minZoom logic.
  //
  // (This used to be a circle whose diameter was just the two most distant
  // pins — that only mathematically contains every OTHER pin when the
  // triangle they form has an obtuse-or-right angle opposite the longest
  // side, false for many real trip layouts. A min/max box over ALL pins has
  // no such blind spot: every pin is inside it by construction.)
  const restrictBounds = useMemo(() => {
    const pins: LL[] = [
      ...cityPoints,
      ...legEndpoints.map((e) => e.ll),
      ...drawn.flatMap((d) => d.pins.map((p) => p.ll)),
    ];
    if (pins.length === 0) return undefined;
    if (pins.length === 1) return circleBoundsKm(pins[0], 250);
    return boundsFromPointsKm(pins, 250);
  }, [cityPoints, legEndpoints, drawn]);

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
    // touch-action: none — a touch drag/pan gesture that starts on the map
    // must be handled ENTIRELY by Leaflet (pan/zoom), never partially
    // hijacked by the browser as a scroll of the page the map is embedded in.
    // Without this, dragging down on the map on mobile scrolls the page
    // instead of (or in addition to) panning the map.
    <div className={`${className ?? ""} touch-none`} style={{ touchAction: "none" }} ref={wrapRef}>
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
      maxBounds={restrictBounds}
      maxBoundsViscosity={1.0}
      className="h-full w-full"
      style={{ background: "transparent", touchAction: "none" }}
    >
      {!noTiles && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      )}

      {showRoutes &&
        drawnOffset.map((d) => (
          <Polyline
            key={d.key}
            positions={d.positions}
            pathOptions={{ color: d.color, weight: 3, opacity: 0.9, dashArray: d.dash }}
          />
        ))}

      {/* Stop / waypoint pins — mode colour. A leg's own departure/arrival (big,
          not hollow) gets a bigger badge: the boarding end shows the vehicle
          icon plus the line ref/flight number (bus/tram/metro/train/plane),
          the alighting end always shows a plain down arrow instead (no
          vehicle icon there, for every mode) — so it reads at a glance and
          stays visually distinct from a trip-city pin. HOLLOW pins (road
          waypoints) and small mid-route stops keep the plain coloured dot. */}
      {showRoutes &&
        drawn.flatMap((d) => {
          // Boarding/alighting is decided by each pin's own explicit `board`
          // flag (set where the pin is constructed), NOT by array position —
          // a leg's departure pin can be omitted entirely when it coincides
          // with the trip's own city pin, which would otherwise shift the
          // arrival pin into index 0 and mislabel it as boarding. Falls back
          // to "first big, non-hollow pin" only for a pin with no flag set at
          // all (defensive default; every current pin-construction site sets
          // it explicitly).
          const firstBigIdx = d.pins.findIndex((p) => p.big && !p.hollow);
          return d.pins.map((p, idx) => {
            // A duplicate boarding pin for a line another leg already shows
            // boarding at the exact same stop (see `pinSkip`) — the trip
            // just continues on the same vehicle, so it's dropped entirely
            // rather than drawn a second time right next to itself.
            if (pinSkip.has(`${d.key}-${idx}`)) return null;
            return p.big && !p.hollow ? (
              <Marker key={`${d.key}-p${idx}`} position={p.ll} icon={endpointIcon(d.mode, d.color, d.line, p.board !== undefined ? p.board : idx === firstBigIdx, pinNudge.get(`${d.key}-${idx}`) ?? [0, 0])}>
                {p.name && (
                  <>
                    <Popup><strong>{withRomanization(p.name, lang)}</strong></Popup>
                    <Tooltip direction="top" offset={[0, -14]}>
                      {withRomanization(p.name, lang)}
                    </Tooltip>
                  </>
                )}
              </Marker>
            ) : (
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
            );
          });
        })}

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
      <FitBounds points={boundsPoints} restrictBounds={restrictBounds} />
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
