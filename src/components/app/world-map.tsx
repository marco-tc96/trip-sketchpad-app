import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cityNameLocalized } from "@/lib/country-data";
import { Switch } from "@/components/ui/switch";

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

type PinDebugInfo = {
  cityName: string;
  countryIso: string;
  regionName: string | null;
  iso3166_2: string | null;
  subdivKey: string | null;
  pinType: "visited" | "ongoing" | "planned" | "wishlist";
  resolvedVia: "point-in-polygon" | "centroid-fallback" | "country-fallback" | "fixed-coord" | "override";
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
const ADMIN1_KEY = "ne_admin1_v6"; // bumped: iso_3166_2 as primary subdivision key

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
  // NOTE: datasets/geo-countries uses "ISO3166-1-Alpha-3" (with full hyphens), not "ISO_A3"
  const a3Keys = ["ISO3166-1-Alpha-3", "ISO_A3", "ISO_A3_EH", "adm0_a3"];
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

// Normalize city name for override lookup (lowercase + strip diacritics)
function normCity(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// ── City → ISO 3166-2 override table ────────────────────────────────────────
// Key: "cityname_normalized|COUNTRY_ISO2"  →  correct ISO 3166-2 subdivision code.
// Applied BEFORE point-in-polygon and centroid fallback in both computeSubdivData
// and computePinDebugInfo to fix cities whose coordinates fall outside the simplified polygon.
const CITY_SUBDIVISION_OVERRIDE: Record<string, string> = {
  // ── Italy ─────────────────────────────────────────────────────────────────
  // Piemonte (IT-21)
  "torino|IT": "IT-21",        "turin|IT": "IT-21",
  "asti|IT": "IT-21",          "novara|IT": "IT-21",
  "alessandria|IT": "IT-21",   "cuneo|IT": "IT-21",
  "biella|IT": "IT-21",        "vercelli|IT": "IT-21",

  // Valle d'Aosta (IT-23)
  "aosta|IT": "IT-23",

  // Lombardia (IT-25)
  "milano|IT": "IT-25",        "milan|IT": "IT-25",
  "monza|IT": "IT-25",         "bergamo|IT": "IT-25",
  "brescia|IT": "IT-25",       "como|IT": "IT-25",
  "lecco|IT": "IT-25",         "pavia|IT": "IT-25",
  "cremona|IT": "IT-25",       "mantova|IT": "IT-25",
  "mantua|IT": "IT-25",        "varese|IT": "IT-25",
  "sondrio|IT": "IT-25",       "lodi|IT": "IT-25",

  // Trentino-Alto Adige (IT-32)
  "trento|IT": "IT-32",        "bolzano|IT": "IT-32",
  "merano|IT": "IT-32",        "rovereto|IT": "IT-32",

  // Veneto (IT-34)
  "venezia|IT": "IT-34",       "venice|IT": "IT-34",
  "verona|IT": "IT-34",        "padova|IT": "IT-34",
  "padua|IT": "IT-34",         "vicenza|IT": "IT-34",
  "treviso|IT": "IT-34",       "belluno|IT": "IT-34",
  "rovigo|IT": "IT-34",

  // Friuli-Venezia Giulia (IT-36)
  "trieste|IT": "IT-36",       "udine|IT": "IT-36",
  "pordenone|IT": "IT-36",     "gorizia|IT": "IT-36",

  // Liguria (IT-42)
  "genova|IT": "IT-42",        "genoa|IT": "IT-42",
  "sanremo|IT": "IT-42",       "san remo|IT": "IT-42",
  "la spezia|IT": "IT-42",     "lerici|IT": "IT-42",
  "portovenere|IT": "IT-42",   "savona|IT": "IT-42",
  "imperia|IT": "IT-42",       "rapallo|IT": "IT-42",
  "portofino|IT": "IT-42",     "sestri levante|IT": "IT-42",
  "cinque terre|IT": "IT-42",  "riomaggiore|IT": "IT-42",
  "vernazza|IT": "IT-42",      "manarola|IT": "IT-42",
  "corniglia|IT": "IT-42",     "monterosso al mare|IT": "IT-42",

  // Emilia-Romagna (IT-45)
  "bologna|IT": "IT-45",       "modena|IT": "IT-45",
  "parma|IT": "IT-45",         "ferrara|IT": "IT-45",
  "ravenna|IT": "IT-45",       "rimini|IT": "IT-45",
  "forli|IT": "IT-45",         "reggio emilia|IT": "IT-45",
  "piacenza|IT": "IT-45",      "imola|IT": "IT-45",
  "misano adriatico|IT": "IT-45", "cesenatico|IT": "IT-45",
  "riccione|IT": "IT-45",      "cattolica|IT": "IT-45",
  "comacchio|IT": "IT-45",     "cervia|IT": "IT-45",
  "cesena|IT": "IT-45",        "fidenza|IT": "IT-45",

  // Toscana (IT-52)
  "firenze|IT": "IT-52",       "florence|IT": "IT-52",
  "siena|IT": "IT-52",         "pisa|IT": "IT-52",
  "livorno|IT": "IT-52",       "arezzo|IT": "IT-52",
  "grosseto|IT": "IT-52",      "lucca|IT": "IT-52",
  "prato|IT": "IT-52",         "viareggio|IT": "IT-52",
  "mugello|IT": "IT-52",       "scarperia|IT": "IT-52",
  "massa|IT": "IT-52",         "carrara|IT": "IT-52",
  "piombino|IT": "IT-52",      "forte dei marmi|IT": "IT-52",
  "volterra|IT": "IT-52",      "san gimignano|IT": "IT-52",
  "montalcino|IT": "IT-52",    "montepulciano|IT": "IT-52",
  "cortona|IT": "IT-52",       "elba|IT": "IT-52",
  "pistoia|IT": "IT-52",

  // Umbria (IT-55)
  "perugia|IT": "IT-55",       "assisi|IT": "IT-55",
  "orvieto|IT": "IT-55",       "spoleto|IT": "IT-55",
  "terni|IT": "IT-55",

  // Marche (IT-57)
  "ancona|IT": "IT-57",        "pesaro|IT": "IT-57",
  "urbino|IT": "IT-57",        "ascoli piceno|IT": "IT-57",
  "macerata|IT": "IT-57",      "fermo|IT": "IT-57",

  // Lazio (IT-62)
  "roma|IT": "IT-62",          "rome|IT": "IT-62",
  "viterbo|IT": "IT-62",       "frosinone|IT": "IT-62",
  "latina|IT": "IT-62",        "rieti|IT": "IT-62",
  "tivoli|IT": "IT-62",        "ostia|IT": "IT-62",

  // Abruzzo (IT-65)
  "l'aquila|IT": "IT-65",      "pescara|IT": "IT-65",
  "chieti|IT": "IT-65",        "teramo|IT": "IT-65",

  // Molise (IT-67)
  "campobasso|IT": "IT-67",    "isernia|IT": "IT-67",

  // Campania (IT-72)
  "napoli|IT": "IT-72",        "naples|IT": "IT-72",
  "amalfi|IT": "IT-72",        "positano|IT": "IT-72",
  "ravello|IT": "IT-72",       "pompeii|IT": "IT-72",
  "pompei|IT": "IT-72",        "capri|IT": "IT-72",
  "ischia|IT": "IT-72",        "salerno|IT": "IT-72",
  "caserta|IT": "IT-72",       "sorrento|IT": "IT-72",
  "ercolano|IT": "IT-72",      "pozzuoli|IT": "IT-72",

  // Puglia (IT-75)
  "bari|IT": "IT-75",          "lecce|IT": "IT-75",
  "brindisi|IT": "IT-75",      "taranto|IT": "IT-75",
  "alberobello|IT": "IT-75",   "trani|IT": "IT-75",
  "monopoli|IT": "IT-75",      "polignano a mare|IT": "IT-75",
  "foggia|IT": "IT-75",        "vieste|IT": "IT-75",
  "otranto|IT": "IT-75",       "gallipoli|IT": "IT-75",

  // Basilicata (IT-77)
  "matera|IT": "IT-77",        "potenza|IT": "IT-77",

  // Calabria (IT-78)
  "reggio calabria|IT": "IT-78", "catanzaro|IT": "IT-78",
  "cosenza|IT": "IT-78",         "tropea|IT": "IT-78",
  "scilla|IT": "IT-78",

  // Sicilia (IT-82)
  "palermo|IT": "IT-82",       "catania|IT": "IT-82",
  "agrigento|IT": "IT-82",     "siracusa|IT": "IT-82",
  "syracuse|IT": "IT-82",      "taormina|IT": "IT-82",
  "messina|IT": "IT-82",       "ragusa|IT": "IT-82",
  "cefalu|IT": "IT-82",        "marsala|IT": "IT-82",
  "trapani|IT": "IT-82",       "enna|IT": "IT-82",

  // Sardegna (IT-88)
  "cagliari|IT": "IT-88",      "sassari|IT": "IT-88",
  "olbia|IT": "IT-88",         "alghero|IT": "IT-88",
  "nuoro|IT": "IT-88",         "oristano|IT": "IT-88",
  "porto cervo|IT": "IT-88",   "costa smeralda|IT": "IT-88",

  // ── Spain ─────────────────────────────────────────────────────────────────
  // Andalucía (ES-AN)
  "sevilla|ES": "ES-AN",       "seville|ES": "ES-AN",
  "malaga|ES": "ES-AN",        "granada|ES": "ES-AN",
  "cordoba|ES": "ES-AN",       "jerez de la frontera|ES": "ES-AN",
  "cadiz|ES": "ES-AN",         "almeria|ES": "ES-AN",
  "huelva|ES": "ES-AN",        "jaen|ES": "ES-AN",
  "marbella|ES": "ES-AN",      "ronda|ES": "ES-AN",

  // Aragón (ES-AR)
  "zaragoza|ES": "ES-AR",      "huesca|ES": "ES-AR",
  "teruel|ES": "ES-AR",        "jaca|ES": "ES-AR",

  // Asturias (ES-AS)
  "oviedo|ES": "ES-AS",        "gijon|ES": "ES-AS",
  "aviles|ES": "ES-AS",

  // Cantabria (ES-CB)
  "santander|ES": "ES-CB",

  // Castilla y León (ES-CL)
  "burgos|ES": "ES-CL",        "leon|ES": "ES-CL",
  "salamanca|ES": "ES-CL",     "valladolid|ES": "ES-CL",
  "zamora|ES": "ES-CL",        "segovia|ES": "ES-CL",
  "avila|ES": "ES-CL",         "soria|ES": "ES-CL",
  "palencia|ES": "ES-CL",

  // Castilla-La Mancha (ES-CM)
  "toledo|ES": "ES-CM",        "ciudad real|ES": "ES-CM",
  "albacete|ES": "ES-CM",      "cuenca|ES": "ES-CM",
  "guadalajara|ES": "ES-CM",

  // Canarias (ES-CN)
  "las palmas|ES": "ES-CN",    "santa cruz de tenerife|ES": "ES-CN",
  "tenerife|ES": "ES-CN",      "gran canaria|ES": "ES-CN",
  "lanzarote|ES": "ES-CN",     "fuerteventura|ES": "ES-CN",

  // Catalunya (ES-CT)
  "barcelona|ES": "ES-CT",     "girona|ES": "ES-CT",
  "lleida|ES": "ES-CT",        "tarragona|ES": "ES-CT",
  "montmelo|ES": "ES-CT",      "sitges|ES": "ES-CT",

  // Extremadura (ES-EX)
  "merida|ES": "ES-EX",        "caceres|ES": "ES-EX",
  "badajoz|ES": "ES-EX",

  // Galicia (ES-GA)
  "santiago de compostela|ES": "ES-GA",
  "vigo|ES": "ES-GA",          "a coruna|ES": "ES-GA",
  "pontevedra|ES": "ES-GA",    "lugo|ES": "ES-GA",
  "ourense|ES": "ES-GA",

  // Baleares (ES-IB)
  "palma|ES": "ES-IB",         "ibiza|ES": "ES-IB",
  "menorca|ES": "ES-IB",       "mallorca|ES": "ES-IB",
  "eivissa|ES": "ES-IB",

  // La Rioja (ES-RI)
  "logrono|ES": "ES-RI",

  // Comunidad de Madrid (ES-MD)
  "madrid|ES": "ES-MD",

  // Región de Murcia (ES-MC)
  "murcia|ES": "ES-MC",        "cartagena|ES": "ES-MC",

  // Navarra (ES-NC)
  "pamplona|ES": "ES-NC",      "irunea|ES": "ES-NC",

  // País Vasco (ES-PV)
  "bilbao|ES": "ES-PV",        "san sebastian|ES": "ES-PV",
  "donostia|ES": "ES-PV",      "vitoria|ES": "ES-PV",
  "zarautz|ES": "ES-PV",       "donostia-san sebastian|ES": "ES-PV",

  // Comunitat Valenciana (ES-VC)
  "valencia|ES": "ES-VC",      "alicante|ES": "ES-VC",
  "castellon|ES": "ES-VC",     "cheste|ES": "ES-VC",
  "benidorm|ES": "ES-VC",      "denia|ES": "ES-VC",

  // ── South Korea ───────────────────────────────────────────────────────────
  "seoul|KR": "KR-11",
  "busan|KR": "KR-26",
  "daegu|KR": "KR-27",
  "incheon|KR": "KR-28",
  "gwangju|KR": "KR-29",
  "daejeon|KR": "KR-30",
  "ulsan|KR": "KR-31",
  "jeju|KR": "KR-49",

  // ── Belgium ───────────────────────────────────────────────────────────────
  "brussels|BE": "BE-BRU",     "bruxelles|BE": "BE-BRU",
  "brussel|BE": "BE-BRU",
  "antwerp|BE": "BE-VAN",      "antwerpen|BE": "BE-VAN",
  "ghent|BE": "BE-VOV",        "gent|BE": "BE-VOV",
  "bruges|BE": "BE-VWV",       "brugge|BE": "BE-VWV",
  "leuven|BE": "BE-VBR",
  "liege|BE": "BE-WLG",        "luik|BE": "BE-WLG",
  "spa|BE": "BE-WLG",          "stavelot|BE": "BE-WLG",
  "francorchamps|BE": "BE-WLG","spa-francorchamps|BE": "BE-WLG",
  "namur|BE": "BE-WNA",
  "mons|BE": "BE-WHT",         "charleroi|BE": "BE-WHT",
};

// ── Per-country admin-1 type filter (type_en fallback for unlisted countries) ────
const ADMIN1_PREFERRED_TYPES: Record<string, string[]> = {
  // Only used as last-resort fallback when iso_3166_2 is absent/mismatched.
  IT: ["region", "autonomous region"],
  ES: ["autonomous community", "autonomous city"],
};

// ── ISO 3166-2 whitelists (primary filter — most reliable key in the dataset) ──
// For Italy: regions have NUMERIC codes (IT-21 … IT-88); provinces have ALPHA codes (IT-BO, …).
const IT_REGION_ISO3166_2 = new Set([
  "IT-21","IT-23","IT-25","IT-32","IT-34","IT-36",
  "IT-42","IT-45","IT-52","IT-55","IT-57","IT-62",
  "IT-65","IT-67","IT-72","IT-75","IT-77","IT-78",
  "IT-82","IT-88",
  // Autonomous provinces of Trentino-Alto Adige (present separately in some dataset editions)
  "IT-BZ","IT-TN",
]);

// For Spain: autonomous community codes vs province codes are distinct in ISO 3166-2.
const ES_COMMUNITY_ISO3166_2 = new Set([
  "ES-AN","ES-AR","ES-AS","ES-CB","ES-CE",
  "ES-CL","ES-CM","ES-CN","ES-CT","ES-EX",
  "ES-GA","ES-IB","ES-MC","ES-MD","ES-ML",
  "ES-NC","ES-PV","ES-RI","ES-VC",
]);

// HASC whitelist kept as secondary fallback for datasets that lack iso_3166_2.
const ES_COMMUNITY_HASC = new Set([
  "ES.AN","ES.AR","ES.AS","ES.IB","ES.PM",
  "ES.CN","ES.CB","ES.CM","ES.CL","ES.CT","ES.CA",
  "ES.EX","ES.GA","ES.MD","ES.MU","ES.NA","ES.NC",
  "ES.PV","ES.LO","ES.LR","ES.VC","ES.VL",
  "ES.CE","ES.ML",
]);

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
  const props = feature.properties ?? {};

  if (iso === "ES") {
    // 1st: ISO 3166-2 whitelist — most reliable
    const code = String(props.iso_3166_2 ?? "").toUpperCase().trim();
    if (code.startsWith("ES-") && code !== "ES--99") return ES_COMMUNITY_ISO3166_2.has(code);
    // 2nd: HASC whitelist
    const hasc = String(props.hasc ?? "").trim();
    if (hasc.startsWith("ES.") && hasc !== "-9.-9") return ES_COMMUNITY_HASC.has(hasc);
    // 3rd: type_en
    const typeEn = String(props.type_en ?? "").toLowerCase();
    return ["autonomous community", "autonomous city"].some((t) => typeEn.includes(t));
  }

  if (iso === "IT") {
    // 1st: ISO 3166-2 whitelist (numeric suffix = region, alpha suffix = province)
    const code = String(props.iso_3166_2 ?? "").toUpperCase().trim();
    if (code.startsWith("IT-") && code !== "IT--99") return IT_REGION_ISO3166_2.has(code);
    // 2nd: type_en — match only pure "region" or "autonomous region", NOT "province"
    const typeEn = String(props.type_en ?? "").toLowerCase();
    return (typeEn === "region" || typeEn === "autonomous region");
  }

  const preferred = ADMIN1_PREFERRED_TYPES[iso];
  if (!preferred) return true;
  const typeEn = String(props.type_en ?? "").toLowerCase();
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

// ── Stable subdivision key (ISO 3166-2 primary, hasc secondary, name fallback) ──
// Used in both computeSubdivData (add) and subdivStyle (lookup) so keys always match.
function subdivKeyOf(feature: GeoFeature, countryIso: string): string | null {
  const props = feature.properties ?? {};
  const normStr = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  // 1st: iso_3166_2 — most stable identifier
  const iso3166 = String(props.iso_3166_2 ?? "").trim().toUpperCase();
  if (iso3166 && iso3166 !== "-99" && iso3166.includes("-") && !iso3166.startsWith("--")) {
    return iso3166;
  }
  // 2nd: hasc code (e.g. "IT.TN")
  const hasc = String(props.hasc ?? "").trim();
  if (hasc && hasc !== "-9.-9" && hasc.includes(".")) return `hasc:${hasc}`;
  // 3rd: normalised name (last resort)
  const name = (props.name as string) ?? "";
  if (name) return `name:${countryIso}|${normStr(name)}`;
  return null;
}

// Extract country ISO-2 from a subdivKey
function countryFromSubdivKey(key: string): string {
  if (key.startsWith("hasc:")) return key.slice(5).split(".")[0].toUpperCase();
  if (key.startsWith("name:")) return key.slice(5).split("|")[0].toUpperCase();
  return key.split("-")[0].toUpperCase(); // ISO 3166-2 e.g. "IT-52" → "IT"
}

// ── Debug: per-pin subdivision resolution info ────────────────────────────────
function computePinDebugInfo(
  allPins: Array<{ pin: WorldMapCity & { lat: number; lng: number }; type: "visited" | "ongoing" | "planned" | "wishlist" }>,
  admin1Geo: GeoCollection,
): PinDebugInfo[] {
  // Same pre-processing as computeSubdivData
  const allByCountry = new Map<string, GeoFeature[]>();
  for (const feature of admin1Geo.features) {
    const iso = countryIsoOfAdmin1(feature);
    if (!iso) continue;
    const list = allByCountry.get(iso) ?? [];
    list.push(feature);
    allByCountry.set(iso, list);
  }

  const featuresByCountry = new Map<string, GeoFeature[]>();
  const ADMIN1_FALLBACK_COUNT: Record<string, number> = { IT: 22, ES: 19 };
  for (const [iso, features] of allByCountry) {
    const preferred = ADMIN1_PREFERRED_TYPES[iso];
    if (!preferred) { featuresByCountry.set(iso, features); continue; }
    const filtered = features.filter((f) => isPreferredAdmin1(f, iso));
    if (filtered.length >= 5) {
      featuresByCountry.set(iso, filtered);
    } else {
      const n = ADMIN1_FALLBACK_COUNT[iso] ?? 20;
      const byArea = [...features].sort((a, b) => featureBBoxArea(b) - featureBBoxArea(a));
      featuresByCountry.set(iso, byArea.slice(0, n));
    }
  }

  return allPins.map(({ pin, type }) => {
    const iso = normIso(pin.country);

    if (FIXED_COORDS[iso]) {
      return { cityName: pin.name, countryIso: iso, regionName: null, iso3166_2: null, subdivKey: null, pinType: type, resolvedVia: "fixed-coord" as const };
    }

    const candidates = featuresByCountry.get(iso) ?? [];
    if (candidates.length === 0) {
      return { cityName: pin.name, countryIso: iso, regionName: null, iso3166_2: null, subdivKey: null, pinType: type, resolvedVia: "country-fallback" as const };
    }

    // Override: city-specific subdivision assignment (bypasses polygon/centroid lookup)
    const overrideCode = CITY_SUBDIVISION_OVERRIDE[`${normCity(pin.name)}|${iso}`];
    if (overrideCode) {
      const overrideFeat = candidates.find(
        (f) => String(f.properties?.iso_3166_2 ?? "").toUpperCase().trim() === overrideCode,
      );
      return {
        cityName: pin.name,
        countryIso: iso,
        regionName: overrideFeat ? ((overrideFeat.properties?.name as string) ?? null) : null,
        iso3166_2: overrideCode,
        subdivKey: overrideCode,
        pinType: type,
        resolvedVia: "override" as const,
      };
    }

    // Point-in-polygon: pick largest containing feature
    let bestFeature: GeoFeature | null = null;
    let bestArea = -1;
    for (const feature of candidates) {
      if (pointInGeoFeature(pin.lat, pin.lng, feature)) {
        const area = featureBBoxArea(feature);
        if (area > bestArea) { bestArea = area; bestFeature = feature; }
      }
    }
    if (bestFeature) {
      return {
        cityName: pin.name,
        countryIso: iso,
        regionName: (bestFeature.properties?.name as string) ?? null,
        iso3166_2: String(bestFeature.properties?.iso_3166_2 ?? "").trim() || null,
        subdivKey: subdivKeyOf(bestFeature, iso),
        pinType: type,
        resolvedVia: "point-in-polygon" as const,
      };
    }

    // Centroid fallback
    let nearDist = Infinity;
    let nearFeature: GeoFeature | null = null;
    for (const feature of candidates) {
      const c = featureCentroid(feature);
      if (!c) continue;
      const dist = Math.hypot(c.lat - pin.lat, c.lng - pin.lng);
      if (dist < nearDist) { nearDist = dist; nearFeature = feature; }
    }
    if (nearFeature && nearDist < 8) {
      return {
        cityName: pin.name,
        countryIso: iso,
        regionName: (nearFeature.properties?.name as string) ?? null,
        iso3166_2: String(nearFeature.properties?.iso_3166_2 ?? "").trim() || null,
        subdivKey: subdivKeyOf(nearFeature, iso),
        pinType: type,
        resolvedVia: "centroid-fallback" as const,
      };
    }

    return { cityName: pin.name, countryIso: iso, regionName: null, iso3166_2: null, subdivKey: null, pinType: type, resolvedVia: "country-fallback" as const };
  });
}

// ── Debug table component ─────────────────────────────────────────────────────
const PIN_TYPE_META = {
  visited:  { dot: "oklch(0.66 0.14 38)",   rowBg: "oklch(0.66 0.14 38 / 0.10)",  label: "Visitata" },
  ongoing:  { dot: "oklch(0.78 0.16 85)",    rowBg: "oklch(0.88 0.14 95 / 0.18)", label: "In corso" },
  planned:  { dot: "oklch(0.55 0 0)",        rowBg: "oklch(0.88 0 0 / 0.12)",     label: "Pianificata" },
  wishlist: { dot: "oklch(0.55 0.16 255)",   rowBg: "oklch(0.93 0.03 255 / 0.15)", label: "Wishlist" },
};

function SubdivisionDebugTable({ rows }: { rows: PinDebugInfo[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 overflow-auto rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">
        🔍 Debug regioni — {rows.length} pin attivi
      </p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Città</th>
            <th className="pb-2 pr-4 font-medium">Regione trovata</th>
            <th className="pb-2 pr-4 font-medium">Stato</th>
            <th className="pb-2 pr-4 font-medium">ISO 3166-2</th>
            <th className="pb-2 font-medium">Metodo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const meta = PIN_TYPE_META[row.pinType];
            return (
              <tr
                key={`${row.cityName}-${i}`}
                style={{ background: meta.rowBg }}
                className="border-b border-border/20 last:border-0"
              >
                <td className="py-1.5 pr-4">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white/60"
                      style={{ background: meta.dot, boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                    />
                    <span className="font-medium">{row.cityName}</span>
                  </span>
                </td>
                <td className="py-1.5 pr-4">
                  {row.regionName ?? <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="py-1.5 pr-4 font-mono text-[11px]">{row.countryIso}</td>
                <td className="py-1.5 pr-4">
                  {row.iso3166_2
                    ? <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{row.iso3166_2}</code>
                    : <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="py-1.5">
                  {row.resolvedVia === "point-in-polygon" && <span className="text-green-600 dark:text-green-400">✓ poly</span>}
                  {row.resolvedVia === "override" && <span className="text-purple-600 dark:text-purple-400">📌 override</span>}
                  {row.resolvedVia === "centroid-fallback" && <span className="text-yellow-600 dark:text-yellow-400">⚠ centroide</span>}
                  {row.resolvedVia === "fixed-coord" && <span className="text-blue-500">↗ fixed</span>}
                  {row.resolvedVia === "country-fallback" && <span className="text-red-500">✗ paese</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
  pins: Array<{ lat: number; lng: number; country: string; name: string }>,
  admin1Geo: GeoCollection,
): { subdivKeys: Set<string>; fallbackCountries: Set<string> } {
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
  const ADMIN1_FALLBACK_COUNT: Record<string, number> = { IT: 22, ES: 19 }; // 20 IT regions (+2 TN/BZ alt) + 19 ES communities
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

    // Override: city-specific subdivision assignment (bypasses polygon/centroid lookup)
    const overrideCode = CITY_SUBDIVISION_OVERRIDE[`${normCity(pin.name)}|${iso}`];
    if (overrideCode) { subdivKeys.add(overrideCode); continue; }

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
      const key = subdivKeyOf(bestFeature, iso);
      if (key) { subdivKeys.add(key); continue; }
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
      const key = subdivKeyOf(nearFeature, iso);
      if (key) { subdivKeys.add(key); continue; }
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
  lang = "en",
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
  lang?: string;
  className?: string;
}) {
  const [showDebug, setShowDebug] = useState(false);

  const { data: world, error } = useWorldBorders();
  const { data: subdivWorld, loading: subdivLoading, progress: subdivProgress } =
    useSubdivisionBorders(showSubdivisions);

  // Derive country ISO sets from both the explicit countries arrays AND the city data,
  // so that a trip with empty `countries` but with city pins still colors correctly.
  const visitedSet = useMemo(() => {
    const s = new Set(visitedCountries.map(normIso));
    for (const c of cities) { const n = normIso(c.country); if (n) s.add(n); }
    return s;
  }, [visitedCountries, cities]);

  const ongoingSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of ongoingCountries) { const n = normIso(c); if (!visitedSet.has(n)) s.add(n); }
    for (const c of ongoingCities) { const n = normIso(c.country); if (n && !visitedSet.has(n)) s.add(n); }
    return s;
  }, [ongoingCountries, ongoingCities, visitedSet]);

  const plannedSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of plannedCountries) { const n = normIso(c); if (!visitedSet.has(n) && !ongoingSet.has(n)) s.add(n); }
    for (const c of plannedCities) { const n = normIso(c.country); if (n && !visitedSet.has(n) && !ongoingSet.has(n)) s.add(n); }
    return s;
  }, [plannedCountries, plannedCities, visitedSet, ongoingSet]);

  const wishlistSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of wishlistCountries) {
      const n = normIso(c);
      if (!visitedSet.has(n) && !ongoingSet.has(n) && !plannedSet.has(n)) s.add(n);
    }
    for (const c of wishlistCities) {
      const n = normIso(c.country);
      if (n && !visitedSet.has(n) && !ongoingSet.has(n) && !plannedSet.has(n)) s.add(n);
    }
    return s;
  }, [wishlistCountries, wishlistCities, visitedSet, ongoingSet, plannedSet]);
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
    for (const key of ongoingSubdivData.subdivKeys) set.add(countryFromSubdivKey(key));
    return set;
  }, [ongoingSubdivData.subdivKeys]);

  const plannedSubdivCountries = useMemo(() => {
    const set = new Set<string>();
    for (const key of plannedSubdivData.subdivKeys) set.add(countryFromSubdivKey(key));
    return set;
  }, [plannedSubdivData.subdivKeys]);

  const wishlistSubdivCountries = useMemo(() => {
    const set = new Set<string>();
    for (const key of wishlistSubdivData.subdivKeys) set.add(countryFromSubdivKey(key));
    return set;
  }, [wishlistSubdivData.subdivKeys]);

  // Debug: per-pin subdivision resolution (only computed when subdivisions active + data loaded)
  const debugRows = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) return [];
    const allPins = [
      ...pins.map((p) => ({ pin: p, type: "visited" as const })),
      ...ongoingPins.map((p) => ({ pin: p, type: "ongoing" as const })),
      ...plannedPins.map((p) => ({ pin: p, type: "planned" as const })),
      ...wishlistPins.map((p) => ({ pin: p, type: "wishlist" as const })),
    ];
    return computePinDebugInfo(allPins, subdivWorld);
  }, [showSubdivisions, subdivWorld, pins, ongoingPins, plannedPins, wishlistPins]);

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

    // Only activate subdivision mode once the data is actually loaded.
    // While loading, render solid country fills so nothing goes invisible.
    const useSubdiv = showSubdivisions && !!subdivWorld;

    if (isHome) {
      if (useSubdiv) {
        const isFallback = visited && visitedSubdivData.fallbackCountries.has(iso);
        if (isFallback) {
          return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
        }
        // Transparent fill — subdivisions handle all coloring; just show the country border
        return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.48 0.13 145)", weight: 1 };
      }
      return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
    }

    if (useSubdiv) {
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
        // When subdivisions are resolved for this country, hide the country fill
        // (just keep the dashed border) so only the individual regions are colored.
        const hasResolvedSubdivs =
          wishlistSubdivCountries.has(iso!) && !wishlistSubdivData.fallbackCountries.has(iso!);
        if (hasResolvedSubdivs) {
          return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.6 0.13 255)", weight: 1, dashArray: "4 3" };
        }
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

    // No subdivisions (or data still loading)
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

    const countryIso = countryIsoOfAdmin1(feature);
    if (!countryIso) return emptyStyle;

    // Key is iso_3166_2 when available (primary), hasc (secondary), or normalised name (fallback).
    // computeSubdivData uses the same subdivKeyOf() so keys always match.
    const key = subdivKeyOf(feature, countryIso);
    if (!key) return emptyStyle;
    const isVisited = visitedSubdivData.subdivKeys.has(key);
    const isOngoing = !isVisited && ongoingSubdivData.subdivKeys.has(key);
    const isPlanned = !isVisited && !isOngoing && plannedSubdivData.subdivKeys.has(key);
    const isWishlist = !isVisited && !isOngoing && !isPlanned && wishlistSubdivData.subdivKeys.has(key);

    // Not in any active set → invisible (no border clutter from unvisited admin1 features)
    if (!isVisited && !isOngoing && !isPlanned && !isWishlist) return emptyStyle;

    const isInHome = !!homeIso && countryIso === homeIso;

    // ── Home country: green tones for regions WITH pins only ──
    if (isInHome) {
      if (isVisited) {
        return { fillColor: "oklch(0.55 0.17 145)", fillOpacity: 0.70, color: "oklch(0.40 0.14 145)", weight: 0.75 };
      }
      if (isOngoing) {
        return { fillColor: "oklch(0.58 0.15 145)", fillOpacity: 0.65, color: "oklch(0.42 0.13 145)", weight: 0.75 };
      }
      return emptyStyle;
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

    return emptyStyle;
  };

  if (error) {
    return (
      <>
        <div className={`grid place-items-center rounded-3xl bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
          Mappa non disponibile al momento
        </div>
      </>
    );
  }

  const geoKey = `country-v${visitedSet.size}-o${ongoingSet.size}-p${plannedSet.size}-w${wishlistSet.size}-h${homeIso}-s${showSubdivisions ? 1 : 0}-sl${subdivWorld ? 1 : 0}-vf${visitedSubdivData.fallbackCountries.size}-of${ongoingSubdivData.fallbackCountries.size}-pf${plannedSubdivData.fallbackCountries.size}-wf${wishlistSubdivData.fallbackCountries.size}-ws${wishlistSubdivCountries.size}`;
  const subdivKey = `subdiv-v${visitedSubdivData.subdivKeys.size}-o${ongoingSubdivData.subdivKeys.size}-p${plannedSubdivData.subdivKeys.size}-w${wishlistSubdivData.subdivKeys.size}-h${homeIso}`;

  return (
    <>
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
              <Tooltip direction="top" offset={[0, -6]}>{cityNameLocalized(c.name, lang)}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          ongoingPins.map((c, i) => (
            <Marker key={`o-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={ongoingPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{cityNameLocalized(c.name, lang)}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          plannedPins.map((c, i) => (
            <Marker key={`p-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={plannedPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{cityNameLocalized(c.name, lang)}</Tooltip>
            </Marker>
          ))}
        {showPins &&
          wishlistPins.map((c, i) => (
            <Marker key={`w-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={wishlistPinIcon}>
              <Tooltip direction="top" offset={[0, -6]}>{cityNameLocalized(c.name, lang)}</Tooltip>
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

    {showSubdivisions && !subdivLoading && debugRows.length > 0 && (
      <div className="mt-2 px-1">
        <label className="flex cursor-pointer items-center gap-2 w-fit select-none">
          <Switch checked={showDebug} onCheckedChange={setShowDebug} />
          <span className="text-xs text-muted-foreground">
            🔍 Debug regioni ({debugRows.length} pin)
          </span>
        </label>
        {showDebug && <SubdivisionDebugTable rows={debugRows} />}
      </div>
    )}
  </>
  );
}
