import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type WorldMapCity = { name: string; country: string; lat?: number; lng?: number };

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
};
type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

// Fixed coordinates for city-states/territories.
const FIXED_COORDS: Record<string, { lat: number; lng: number }> = {
  HK: { lat: 22.3193, lng: 114.1694 },
  MO: { lat: 22.1987, lng: 113.5439 },
  SG: { lat: 1.3521, lng: 103.8198 },
  VA: { lat: 41.9029, lng: 12.4534 },
  MC: { lat: 43.7384, lng: 7.4246 },
  GI: { lat: 36.1408, lng: -5.3536 },
};

const visitedPinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const plannedPinIcon = L.divIcon({
  className: "voyager-pin-planned",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:white;border:2.5px solid oklch(0.55 0 0);box-shadow:0 2px 6px rgba(0,0,0,0.3)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const ongoingPinIcon = L.divIcon({
  className: "voyager-pin-ongoing",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:oklch(0.88 0.14 95);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const wishlistPinIcon = L.divIcon({
  className: "voyager-pin-wishlist",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:white;border:2.5px solid oklch(0.55 0.16 255);box-shadow:0 2px 6px rgba(0,0,0,0.3)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// ── Ramer–Douglas–Peucker (iterative, no stack overflow risk) ────────────────

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

function rdpIterative(pts: number[][], eps: number): number[][] {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxD = 0, maxI = s;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps) { keep[maxI] = 1; stack.push([s, maxI], [maxI, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

function simplifyRing(ring: number[][], eps: number): number[][] {
  const s = rdpIterative(ring, eps);
  if (s.length < 4) return ring;
  if (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1]) {
    s.push([s[0][0], s[0][1]]);
  }
  return s;
}

function simplifyGeoCollection(geo: GeoCollection, eps: number): GeoCollection {
  return {
    type: "FeatureCollection",
    features: geo.features
      .filter((f) => f.geometry != null)
      .map((f) => {
        const p = f.properties ?? {};
        const g = f.geometry!;
        let geom = g;
        if (g.type === "Polygon") {
          geom = {
            type: "Polygon",
            coordinates: (g.coordinates as number[][][]).map((r) => simplifyRing(r, eps)),
          };
        } else if (g.type === "MultiPolygon") {
          geom = {
            type: "MultiPolygon",
            coordinates: (g.coordinates as number[][][][]).map((poly) =>
              poly.map((r) => simplifyRing(r, eps)),
            ),
          };
        }
        return {
          type: "Feature" as const,
          properties: {
            name: p.name ?? null,
            iso_3166_2: p.iso_3166_2 ?? null,
            adm0_a3: p.adm0_a3 ?? null,
            hasc: p.hasc ?? null,
            type_en: p.type_en ?? null,
          },
          geometry: geom,
        };
      }),
  };
}

// ── IndexedDB cache ──────────────────────────────────────────────────────────

const IDB_DB = "voyager-geo";
const IDB_STORE = "tiles";
const ADMIN1_KEY = "ne_admin1_v3"; // bumped: new simplification + type_en preserved

async function idbGet(key: string): Promise<GeoCollection | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction(IDB_STORE, "readonly");
        const get = tx.objectStore(IDB_STORE).get(key);
        get.onsuccess = () => resolve(get.result ?? null);
        get.onerror = () => resolve(null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: GeoCollection): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = (e) => {
        (e.target as IDBOpenDBRequest).result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ---- Country-level GeoJSON ----
let _worldCache: GeoCollection | null = null;
let _worldLoading: Promise<GeoCollection> | null = null;

async function loadWorldBorders(): Promise<GeoCollection> {
  if (_worldCache) return _worldCache;
  if (_worldLoading) return _worldLoading;
  _worldLoading = fetch(
    "https://raw.githubusercontent.com/datasets/geo-countries/main/data/countries.geojson",
  )
    .then((r) => r.json())
    .then((geo: GeoCollection) => {
      _worldCache = geo;
      return geo;
    });
  return _worldLoading;
}

// ---- Admin-1 subdivision GeoJSON ----
let _admin1Cache: GeoCollection | null = null;
let _admin1Loading: Promise<GeoCollection> | null = null;
let _admin1ProgressCbs: ((msg: string) => void)[] = [];

function _notifyProgress(msg: string) {
  for (const cb of _admin1ProgressCbs) cb(msg);
}

const ADMIN1_SRC =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";
const SIMPLIFY_EPS = 0.005; // ~550 m precision — much more accurate borders

async function loadAdmin1(): Promise<GeoCollection> {
  if (_admin1Cache) return _admin1Cache;
  if (_admin1Loading) return _admin1Loading;

  _admin1Loading = (async () => {
    try {
      const r = await fetch("/ne_admin1.geojson");
      if (r.ok) {
        const raw = (await r.json()) as GeoCollection;
        const geo = simplifyGeoCollection(raw, SIMPLIFY_EPS);
        _admin1Cache = geo;
        return geo;
      }
    } catch {
      // not available — fall through
    }

    const cached = await idbGet(ADMIN1_KEY);
    if (cached) {
      _admin1Cache = cached;
      return cached;
    }

    _notifyProgress("Download regioni in corso… (~60 s al primo avvio)");
    const r = await fetch(ADMIN1_SRC);
    if (!r.ok) throw new Error(`Admin-1 download failed: HTTP ${r.status}`);

    _notifyProgress("Semplificazione poligoni…");
    const raw = (await r.json()) as GeoCollection;
    const simplified = simplifyGeoCollection(raw, SIMPLIFY_EPS);

    _notifyProgress("Salvataggio in cache…");
    await idbSet(ADMIN1_KEY, simplified);

    _admin1Cache = simplified;
    return simplified;
  })().catch((err) => {
    _admin1Loading = null;
    throw err;
  });

  return _admin1Loading;
}

function useWorldBorders() {
  const [data, setData] = useState<GeoCollection | null>(_worldCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (data) return;
    let alive = true;
    loadWorldBorders()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [data]);
  return { data, error };
}

function useSubdivisionBorders(enabled: boolean) {
  const [data, setData] = useState<GeoCollection | null>(_admin1Cache);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (data) return;
    let alive = true;
    setLoading(true);

    const cb = (msg: string) => { if (alive) setProgress(msg); };
    _admin1ProgressCbs.push(cb);

    loadAdmin1()
      .then((d) => {
        if (alive) { setData(d); setLoading(false); setProgress(null); }
      })
      .catch(() => {
        if (alive) { setError(true); setLoading(false); }
      })
      .finally(() => {
        _admin1ProgressCbs = _admin1ProgressCbs.filter((f) => f !== cb);
      });

    return () => {
      alive = false;
      _admin1ProgressCbs = _admin1ProgressCbs.filter((f) => f !== cb);
    };
  }, [data, enabled]);

  return { data, loading, progress, error };
}

function isoOf(feature: GeoFeature): string | null {
  const p = feature.properties ?? {};
  const candidates = ["ISO3166-1-Alpha-2", "ISO_A2", "iso_a2", "ISO2", "iso2"];
  for (const key of candidates) {
    const v = p[key];
    if (typeof v === "string" && v.length === 2 && v !== "-99" && v !== "-1") {
      return v.toUpperCase();
    }
  }
  // Fallback: derive from 3-letter ISO code
  const a3Keys = ["ISO_A3", "ISO_A3_EH", "adm0_a3"];
  for (const key of a3Keys) {
    const v = String(p[key] ?? "").trim();
    if (v.length === 3 && v !== "-99" && A3_TO_A2[v]) return A3_TO_A2[v];
  }
  return null;
}

const A3_TO_A2: Record<string, string> = {
  AFG:"AF",AGO:"AO",ALB:"AL",AND:"AD",ARE:"AE",ARG:"AR",ARM:"AM",ATG:"AG",AUS:"AU",AUT:"AT",
  AZE:"AZ",BDI:"BI",BEL:"BE",BEN:"BJ",BFA:"BF",BGD:"BD",BGR:"BG",BHR:"BH",BHS:"BS",BIH:"BA",
  BLR:"BY",BLZ:"BZ",BOL:"BO",BRA:"BR",BRB:"BB",BRN:"BN",BTN:"BT",BWA:"BW",CAF:"CF",CAN:"CA",
  CHE:"CH",CHL:"CL",CHN:"CN",CIV:"CI",CMR:"CM",COD:"CD",COG:"CG",COL:"CO",COM:"KM",CPV:"CV",
  CRI:"CR",CUB:"CU",CYP:"CY",CZE:"CZ",DEU:"DE",DJI:"DJ",DMA:"DM",DNK:"DK",DOM:"DO",DZA:"DZ",
  ECU:"EC",EGY:"EG",ERI:"ER",ESP:"ES",EST:"EE",ETH:"ET",FIN:"FI",FJI:"FJ",FRA:"FR",FSM:"FM",
  GAB:"GA",GBR:"GB",GEO:"GE",GHA:"GH",GIN:"GN",GMB:"GM",GNB:"GW",GNQ:"GQ",GRC:"GR",GRD:"GD",
  GTM:"GT",GUY:"GY",HND:"HN",HRV:"HR",HTI:"HT",HUN:"HU",IDN:"ID",IND:"IN",IRL:"IE",IRN:"IR",
  IRQ:"IQ",ISL:"IS",ISR:"IL",ITA:"IT",JAM:"JM",JOR:"JO",JPN:"JP",KAZ:"KZ",KEN:"KE",KGZ:"KG",
  KHM:"KH",KIR:"KI",KNA:"KN",KOR:"KR",KWT:"KW",LAO:"LA",LBN:"LB",LBR:"LR",LBY:"LY",LCA:"LC",
  LIE:"LI",LKA:"LK",LSO:"LS",LTU:"LT",LUX:"LU",LVA:"LV",MAR:"MA",MCO:"MC",MDA:"MD",MDG:"MG",
  MDV:"MV",MEX:"MX",MHL:"MH",MKD:"MK",MLI:"ML",MLT:"MT",MMR:"MM",MNE:"ME",MNG:"MN",MOZ:"MZ",
  MRT:"MR",MUS:"MU",MWI:"MW",MYS:"MY",NAM:"NA",NER:"NE",NGA:"NG",NIC:"NI",NLD:"NL",NOR:"NO",
  NPL:"NP",NRU:"NR",NZL:"NZ",OMN:"OM",PAK:"PK",PAN:"PA",PER:"PE",PHL:"PH",PLW:"PW",PNG:"PG",
  POL:"PL",PRI:"PR",PRK:"KP",PRT:"PT",PRY:"PY",PSE:"PS",QAT:"QA",ROM:"RO",ROU:"RO",RUS:"RU",
  RWA:"RW",SAU:"SA",SDN:"SD",SEN:"SN",SGP:"SG",SLB:"SB",SLE:"SL",SLV:"SV",SMR:"SM",SOM:"SO",
  SRB:"RS",SSD:"SS",STP:"ST",SUR:"SR",SVK:"SK",SVN:"SI",SWE:"SE",SWZ:"SZ",SYC:"SC",SYR:"SY",
  TCD:"TD",TGO:"TG",THA:"TH",TJK:"TJ",TKM:"TM",TLS:"TL",TON:"TO",TTO:"TT",TUN:"TN",TUR:"TR",
  TUV:"TV",TZA:"TZ",UGA:"UG",UKR:"UA",URY:"UY",USA:"US",UZB:"UZ",VAT:"VA",VCT:"VC",VEN:"VE",
  VNM:"VN",VUT:"VU",WSM:"WS",YEM:"YE",ZAF:"ZA",ZMB:"ZM",ZWE:"ZW",
  ABW:"AW",AIA:"AI",ALA:"AX",ANT:"AN",ASM:"AS",ATA:"AQ",ATF:"TF",BES:"BQ",BLM:"BL",BMU:"BM",
  BVT:"BV",CCK:"CC",COK:"CK",CUW:"CW",CXR:"CX",CYM:"KY",ESH:"EH",FLK:"FK",FRO:"FO",GGY:"GG",
  GIB:"GI",GLP:"GP",GRL:"GL",GUF:"GF",GUM:"GU",HKG:"HK",HMD:"HM",IMN:"IM",IOT:"IO",JEY:"JE",
  MAC:"MO",MAF:"MF",MNP:"MP",MSR:"MS",MTQ:"MQ",MYT:"YT",NCL:"NC",NFK:"NF",NIU:"NU",PCN:"PN",
  PYF:"PF",REU:"RE",SGS:"GS",SHN:"SH",SJM:"SJ",SPM:"PM",SXM:"SX",TCA:"TC",TKL:"TK",UMI:"UM",
  VGB:"VG",VIR:"VI",WLF:"WF",XKX:"XK",
};

// Normalize ISO codes: accept both 2-letter (NO) and 3-letter (NOR) formats
function normIso(c: string): string {
  const u = c.toUpperCase().trim();
  if (u.length === 3 && A3_TO_A2[u]) return A3_TO_A2[u];
  return u;
}

// ── Per-country admin-1 type filter ─────────────────────────────────────────
// Natural Earth ne_10m_admin_1 includes provinces for IT and ES alongside regions.
// Only features whose type_en matches one of these strings (case-insensitive) are used.
const ADMIN1_PREFERRED_TYPES: Record<string, string[]> = {
  IT: ["region", "autonomous region", "autonomous province", "free commune"],
  ES: ["autonomous community", "autonomous city"],
};

// Bounding-box area proxy — used to pick the largest matching feature (region > province)
function featureBBoxArea(feature: GeoFeature): number {
  const g = feature.geometry;
  if (!g) return 0;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const processRing = (ring: number[][]) => {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  };
  if (g.type === "Polygon") {
    for (const ring of g.coordinates as number[][][]) processRing(ring);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates as number[][][][]) {
      for (const ring of poly) processRing(ring);
    }
  }
  if (minLat === Infinity) return 0;
  return (maxLat - minLat) * (maxLng - minLng);
}

function isPreferredAdmin1(feature: GeoFeature, iso: string): boolean {
  const preferred = ADMIN1_PREFERRED_TYPES[iso];
  if (!preferred) return true; // no filter for this country
  const typeEn = String((feature.properties ?? {}).type_en ?? "").toLowerCase();
  return preferred.some((t) => typeEn.includes(t));
}

function countryIsoOfAdmin1(feature: GeoFeature): string | null {
  const props = feature.properties ?? {};
  const raw3166 = String(props.iso_3166_2 ?? "");
  const parts = raw3166.split("-");
  if (parts.length >= 2 && parts[0].length === 2 && raw3166 !== "-99") {
    return parts[0].toUpperCase();
  }
  const hasc = String(props.hasc ?? "");
  const hp = hasc.split(".");
  if (hp.length >= 2 && hp[0].length === 2 && hp[0] !== "-9") {
    return hp[0].toUpperCase();
  }
  const a3 = String(props.adm0_a3 ?? "").trim();
  if (a3 && a3 !== "-99" && a3.length === 3) {
    return A3_TO_A2[a3] ?? null;
  }
  return null;
}

function FitToVisited({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 });
    } catch {
      // ignore invalid bounds
    }
  }, [map, bounds]);
  return null;
}

function enrichCoords(cities: WorldMapCity[]): (WorldMapCity & { lat?: number; lng?: number })[] {
  return cities.map((c) => {
    if (typeof c.lat === "number" && typeof c.lng === "number") return c;
    const iso = (c.country || "").toUpperCase();
    if (FIXED_COORDS[iso]) return { ...c, ...FIXED_COORDS[iso] };
    return c;
  });
}

function dedupePins(cities: (WorldMapCity & { lat?: number; lng?: number })[]) {
  const seen = new Set<string>();
  const list: (WorldMapCity & { lat: number; lng: number })[] = [];
  for (const c of cities) {
    if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
    const key = `${c.country}|${c.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(c as WorldMapCity & { lat: number; lng: number });
  }
  return list;
}

function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInGeoFeature(lat: number, lng: number, feature: GeoFeature): boolean {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") {
    const rings = g.coordinates as number[][][];
    return pointInRing(lat, lng, rings[0]);
  }
  if (g.type === "MultiPolygon") {
    const polys = g.coordinates as number[][][][];
    return polys.some((poly) => pointInRing(lat, lng, poly[0]));
  }
  return false;
}

function featureCentroid(feature: GeoFeature): { lat: number; lng: number } | null {
  const g = feature.geometry;
  if (!g) return null;
  let sumLat = 0, sumLng = 0, count = 0;
  const addRing = (ring: number[][]) => {
    for (const [lng, lat] of ring) { sumLng += lng; sumLat += lat; count++; }
  };
  if (g.type === "Polygon") {
    addRing((g.coordinates as number[][][])[0]);
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates as number[][][][]) addRing(poly[0]);
  }
  return count > 0 ? { lat: sumLat / count, lng: sumLng / count } : null;
}

function computeSubdivData(
  pins: Array<{ lat: number; lng: number; country: string }>,
  admin1Geo: GeoCollection,
): { subdivKeys: Set<string>; fallbackCountries: Set<string> } {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const subdivKeys = new Set<string>();
  const fallbackCountries = new Set<string>();

  // First pass: collect all features by country
  const allByCountry = new Map<string, GeoFeature[]>();
  for (const feature of admin1Geo.features) {
    const iso = countryIsoOfAdmin1(feature);
    if (!iso) continue;
    const list = allByCountry.get(iso) ?? [];
    list.push(feature);
    allByCountry.set(iso, list);
  }

  // Second pass: apply type_en filter or size-based fallback
  const featuresByCountry = new Map<string, GeoFeature[]>();
  const ADMIN1_FALLBACK_COUNT: Record<string, number> = { IT: 22, ES: 19 };
  for (const [iso, features] of allByCountry) {
    const preferred = ADMIN1_PREFERRED_TYPES[iso];
    if (!preferred) {
      featuresByCountry.set(iso, features);
      continue;
    }
    const filtered = features.filter((f) => isPreferredAdmin1(f, iso));
    if (filtered.length >= 5) {
      featuresByCountry.set(iso, filtered);
    } else {
      // type_en filter returned too few results — fall back to N largest features
      const n = ADMIN1_FALLBACK_COUNT[iso] ?? 20;
      const byArea = [...features].sort((a, b) => featureBBoxArea(b) - featureBBoxArea(a));
      featuresByCountry.set(iso, byArea.slice(0, n));
    }
  }

  for (const pin of pins) {
    const iso = normIso(pin.country);
    if (FIXED_COORDS[iso]) { fallbackCountries.add(iso); continue; }
    const candidates = featuresByCountry.get(iso) ?? [];
    if (candidates.length === 0) { fallbackCountries.add(iso); continue; }

    // Pick the LARGEST polygon that contains the pin (prefers region over sub-region)
    let bestFeature: GeoFeature | null = null;
    let bestArea = -1;
    for (const feature of candidates) {
      if (pointInGeoFeature(pin.lat, pin.lng, feature)) {
        const area = featureBBoxArea(feature);
        if (area > bestArea) { bestArea = area; bestFeature = feature; }
      }
    }

    if (bestFeature) {
      const name = (bestFeature.properties?.name as string) ?? "";
      if (name) { subdivKeys.add(`${iso}|${norm(name)}`); continue; }
    }

    // Fallback: nearest centroid
    let nearDist = Infinity;
    let nearFeature: GeoFeature | null = null;
    for (const feature of candidates) {
      const c = featureCentroid(feature);
      if (!c) continue;
      const dist = Math.hypot(c.lat - pin.lat, c.lng - pin.lng);
      if (dist < nearDist) { nearDist = dist; nearFeature = feature; }
    }
    if (nearFeature && nearDist < 8) {
      const name = (nearFeature.properties?.name as string) ?? "";
      if (name) { subdivKeys.add(`${iso}|${norm(name)}`); continue; }
    }

    fallbackCountries.add(iso);
  }

  return { subdivKeys, fallbackCountries };
}

export function WorldMap({
  visitedCountries,
  cities,
  plannedCountries = [],
  plannedCities = [],
  ongoingCountries = [],
  ongoingCities = [],
  wishlistCountries = [],
  wishlistCities = [],
  homeCountry = null,
  showPins = true,
  showSubdivisions = false,
  className,
}: {
  visitedCountries: string[];
  cities: WorldMapCity[];
  plannedCountries?: string[];
  plannedCities?: WorldMapCity[];
  ongoingCountries?: string[];
  ongoingCities?: WorldMapCity[];
  wishlistCountries?: string[];
  wishlistCities?: WorldMapCity[];
  homeCountry?: string | null;
  showPins?: boolean;
  showSubdivisions?: boolean;
  className?: string;
}) {
  const { data: world, error } = useWorldBorders();
  const { data: subdivWorld, loading: subdivLoading, progress: subdivProgress } =
    useSubdivisionBorders(showSubdivisions);

  const visitedSet = useMemo(
    () => new Set(visitedCountries.map(normIso)),
    [visitedCountries],
  );
  const ongoingSet = useMemo(
    () => new Set(ongoingCountries.map(normIso).filter((c) => !visitedSet.has(c))),
    [ongoingCountries, visitedSet],
  );
  const plannedSet = useMemo(
    () => new Set(
      plannedCountries
        .map(normIso)
        .filter((c) => !visitedSet.has(c) && !ongoingSet.has(c)),
    ),
    [plannedCountries, visitedSet, ongoingSet],
  );
  const wishlistSet = useMemo(
    () => new Set(
      wishlistCountries
        .map(normIso)
        .filter((c) => !visitedSet.has(c) && !ongoingSet.has(c) && !plannedSet.has(c)),
    ),
    [wishlistCountries, visitedSet, ongoingSet, plannedSet],
  );
  const homeIso = homeCountry ? normIso(homeCountry) : null;

  const pins = useMemo(() => dedupePins(enrichCoords(cities)), [cities]);

  const ongoingPins = useMemo(() => {
    const visitedKeys = new Set(pins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    return dedupePins(enrichCoords(ongoingCities)).filter(
      (p) => !visitedKeys.has(`${p.country}|${p.name.toLowerCase()}`),
    );
  }, [ongoingCities, pins]);

  const plannedPins = useMemo(() => {
    const visitedKeys = new Set(pins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    const ongoingKeys = new Set(ongoingPins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    return dedupePins(enrichCoords(plannedCities)).filter(
      (p) =>
        !visitedKeys.has(`${p.country}|${p.name.toLowerCase()}`) &&
        !ongoingKeys.has(`${p.country}|${p.name.toLowerCase()}`),
    );
  }, [plannedCities, pins, ongoingPins]);

  const wishlistPins = useMemo(() => {
    const visitedKeys = new Set(pins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    const ongoingKeys = new Set(ongoingPins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    const plannedKeys = new Set(plannedPins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    return dedupePins(enrichCoords(wishlistCities)).filter(
      (p) =>
        !visitedKeys.has(`${p.country}|${p.name.toLowerCase()}`) &&
        !ongoingKeys.has(`${p.country}|${p.name.toLowerCase()}`) &&
        !plannedKeys.has(`${p.country}|${p.name.toLowerCase()}`),
    );
  }, [wishlistCities, pins, ongoingPins, plannedPins]);

  const visitedSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(pins, subdivWorld);
  }, [pins, showSubdivisions, subdivWorld]);

  const ongoingSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(ongoingPins, subdivWorld);
  }, [ongoingPins, showSubdivisions, subdivWorld]);

  const plannedSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(plannedPins, subdivWorld);
  }, [plannedPins, showSubdivisions, subdivWorld]);

  const wishlistSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(wishlistPins, subdivWorld);
  }, [wishlistPins, showSubdivisions, subdivWorld]);

  const ongoingSubdivCountries = useMemo(() => {
    const set = new Set<string>();
    for (const key of ongoingSubdivData.subdivKeys) set.add(key.split("|")[0]);
    return set;
  }, [ongoingSubdivData.subdivKeys]);

  const plannedSubdivCountries = useMemo(() => {
    const set = new Set<string>();
    for (const key of plannedSubdivData.subdivKeys) set.add(key.split("|")[0]);
    return set;
  }, [plannedSubdivData.subdivKeys]);

  const visitedBounds = useMemo<L.LatLngBoundsExpression | null>(() => {
    if (!world) return null;
    const pts: [number, number][] = [];
    const collect = (coords: unknown): void => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        pts.push([coords[1] as number, coords[0] as number]);
        return;
      }
      for (const c of coords) collect(c);
    };
    for (const f of world.features) {
      const iso = isoOf(f as GeoFeature);
      if (
        !iso ||
        (!visitedSet.has(iso) && !ongoingSet.has(iso) && !plannedSet.has(iso) && !wishlistSet.has(iso))
      ) continue;
      const g = f.geometry as { coordinates?: unknown } | undefined;
      if (g?.coordinates) collect(g.coordinates);
    }
    for (const p of pins) pts.push([p.lat, p.lng]);
    for (const p of ongoingPins) pts.push([p.lat, p.lng]);
    for (const p of plannedPins) pts.push([p.lat, p.lng]);
    for (const p of wishlistPins) pts.push([p.lat, p.lng]);
    return pts.length > 0 ? L.latLngBounds(pts) : null;
  }, [world, visitedSet, ongoingSet, plannedSet, wishlistSet, pins, ongoingPins, plannedPins, wishlistPins]);

  const countryStyle = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
    const ongoing = !!iso && !visited && ongoingSet.has(iso);
    const planned = !!iso && !visited && !ongoing && plannedSet.has(iso);
    const wishlist = !!iso && !visited && !ongoing && !planned && wishlistSet.has(iso);
    const isHome = !!iso && !!homeIso && iso === homeIso;

    if (isHome) {
      if (showSubdivisions) {
        const isFallback = visited && visitedSubdivData.fallbackCountries.has(iso);
        if (isFallback) {
          return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
        }
        // Transparent fill — subdivisions handle all coloring; just show the country border
        return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.48 0.13 145)", weight: 1 };
      }
      return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
    }

    if (showSubdivisions) {
      if (ongoing) {
        const hasResolvedSubdivs =
          ongoingSubdivCountries.has(iso!) && !ongoingSubdivData.fallbackCountries.has(iso!);
        if (hasResolvedSubdivs) {
          return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.68 0.16 85)", weight: 0.75 };
        }
        return { fillColor: "oklch(0.88 0.14 95)", fillOpacity: 0.55, color: "oklch(0.68 0.16 85)", weight: 1 };
      }
      if (planned) {
        const hasResolvedSubdivs =
          plannedSubdivCountries.has(iso!) && !plannedSubdivData.fallbackCountries.has(iso!);
        if (hasResolvedSubdivs) {
          return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.65 0 0)", weight: 0.75 };
        }
        return { fillColor: "oklch(0.88 0 0)", fillOpacity: 0.55, color: "oklch(0.65 0 0)", weight: 1 };
      }
      if (wishlist) {
        return {
          fillColor: "oklch(0.93 0.03 255)", fillOpacity: 0.55,
          color: "oklch(0.6 0.13 255)", weight: 1, dashArray: "4 3",
        };
      }
      const isFallback = !!iso && visited && visitedSubdivData.fallbackCountries.has(iso);
      return {
        fillColor: isFallback ? "oklch(0.66 0.14 38)" : "transparent",
        fillOpacity: isFallback ? 0.55 : 0,
        color: visited ? "oklch(0.5 0.13 38)" : "oklch(0.82 0.01 90)",
        weight: visited ? 1 : 0.75,
      };
    }

    // No subdivisions
    if (ongoing) {
      return { fillColor: "oklch(0.88 0.14 95)", fillOpacity: 0.55, color: "oklch(0.68 0.16 85)", weight: 1 };
    }
    if (planned) {
      return { fillColor: "oklch(0.88 0 0)", fillOpacity: 0.55, color: "oklch(0.65 0 0)", weight: 1 };
    }
    if (wishlist) {
      return {
        fillColor: "oklch(0.93 0.03 255)", fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)", weight: 1, dashArray: "4 3",
      };
    }
    return {
      fillColor: visited ? "oklch(0.66 0.14 38)" : "transparent",
      fillOpacity: visited ? 0.55 : 0,
      color: visited ? "oklch(0.5 0.13 38)" : "oklch(0.82 0.01 90)",
      weight: visited ? 1 : 0.75,
    };
  };

  const subdivStyle = (feature?: GeoFeature) => {
    const emptyStyle = { fillColor: "transparent", fillOpacity: 0, color: "transparent", weight: 0 };
    if (!feature?.properties) return emptyStyle;
    const props = feature.properties;
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    const countryIso = countryIsoOfAdmin1(feature);
    if (!countryIso) return emptyStyle;

    // Skip features at wrong admin level (e.g. Italian provinces when we want regions)
    if (!isPreferredAdmin1(feature, countryIso)) return emptyStyle;

    const featureName = norm((props.name as string) ?? "");
    const key = `${countryIso}|${featureName}`;
    const isVisited = visitedSubdivData.subdivKeys.has(key);
    const isOngoing = !isVisited && ongoingSubdivData.subdivKeys.has(key);
    const isPlanned = !isVisited && !isOngoing && plannedSubdivData.subdivKeys.has(key);
    const isWishlist = !isVisited && !isOngoing && !isPlanned && wishlistSubdivData.subdivKeys.has(key);
    const isInHome = !!homeIso && countryIso === homeIso;

    // ── Home country: always use green tones, never orange ──
    if (isInHome) {
      if (isVisited) {
        // Darker green for visited home regions
        return { fillColor: "oklch(0.55 0.17 145)", fillOpacity: 0.70, color: "oklch(0.40 0.14 145)", weight: 0.75 };
      }
      if (isOngoing) {
        return { fillColor: "oklch(0.58 0.15 145)", fillOpacity: 0.65, color: "oklch(0.42 0.13 145)", weight: 0.75 };
      }
      // Unvisited home region: lighter green
      return { fillColor: "oklch(0.78 0.08 145)", fillOpacity: 0.22, color: "oklch(0.55 0.10 145)", weight: 0.4 };
    }

    // ── Non-home regions WITH a pin: show colored fill + precise border ──
    if (isVisited) {
      return { fillColor: "oklch(0.66 0.14 38)", fillOpacity: 0.65, color: "oklch(0.5 0.13 38)", weight: 0.75 };
    }
    if (isOngoing) {
      return { fillColor: "oklch(0.88 0.14 95)", fillOpacity: 0.65, color: "oklch(0.68 0.16 85)", weight: 0.75 };
    }
    if (isPlanned) {
      return { fillColor: "oklch(0.88 0 0)", fillOpacity: 0.55, color: "oklch(0.65 0 0)", weight: 0.75 };
    }
    if (isWishlist) {
      return {
        fillColor: "oklch(0.93 0.03 255)", fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)", weight: 0.75, dashArray: "4 3",
      };
    }

    // ── Everything else: completely invisible (no border clutter) ──
    return emptyStyle;
  };

  if (error) {
    return (
      <div className={`grid place-items-center rounded-3xl bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        Mappa non disponibile al momento
      </div>
    );
  }

  const geoKey = `country-v${visitedSet.size}-o${ongoingSet.size}-p${plannedSet.size}-w${wishlistSet.size}-h${homeIso}-s${showSubdivisions ? 1 : 0}-vf${visitedSubdivData.fallbackCountries.size}-pf${plannedSubdivData.fallbackCountries.size}-wf${wishlistSubdivData.fallbackCountries.size}`;
  const subdivKey = `subdiv-v${visitedSubdivData.subdivKeys.size}-o${ongoingSubdivData.subdivKeys.size}-p${plannedSubdivData.subdivKeys.size}-w${wishlistSubdivData.subdivKeys.size}-h${homeIso}`;

  return (
    <div className={`relative ${className ?? ""}`}>
      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={2}
        maxZoom={9}
        worldCopyJump
        attributionControl={false}
        zoomControl={false}
        className="h-full w-full"
        style={{ background: "transparent" }}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />

        {world && (
          <GeoJSON
            key={geoKey}
            data={world as never}
            style={countryStyle as never}
          />
        )}

        {showSubdivisions && subdivWorld && (
          <GeoJSON
            key={subdivKey}
            data={subdivWorld as never}
            style={subdivStyle as never}
          />
        )}

        {showPins &&
          pins.map((c, i) => (
            <Marker key={`v-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={visitedPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          ongoingPins.map((c, i) => (
            <Marker key={`o-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={ongoingPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          plannedPins.map((c, i) => (
            <Marker key={`p-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={plannedPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          wishlistPins.map((c, i) => (
            <Marker key={`w-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={wishlistPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
            </Marker>
          ))}

        {world && <FitToVisited bounds={visitedBounds} />}
      </MapContainer>

      {showSubdivisions && subdivLoading && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center rounded-3xl bg-background/60 backdrop-blur-sm">
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="max-w-[200px] leading-tight">
              {subdivProgress ?? "Caricamento regioni…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
