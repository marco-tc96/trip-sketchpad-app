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
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:oklch(0.97 0.02 250);border:2.5px solid oklch(0.55 0.16 255);box-shadow:0 2px 6px rgba(0,0,0,0.3)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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

async function loadAdmin1(): Promise<GeoCollection> {
  if (_admin1Cache) return _admin1Cache;
  if (_admin1Loading) return _admin1Loading;
  _admin1Loading = fetch(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
  )
    .then((r) => r.json())
    .then((geo: GeoCollection) => {
      _admin1Cache = geo;
      return geo;
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
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (data) return;
    let alive = true;
    loadAdmin1()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [data, enabled]);
  return { data, error };
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

function countryIsoOfAdmin1(feature: GeoFeature): string | null {
  const props = feature.properties ?? {};
  // 1. iso_3166_2: "IT-52" → "IT"
  const raw3166 = String(props.iso_3166_2 ?? "");
  const parts = raw3166.split("-");
  if (parts.length >= 2 && parts[0].length === 2 && raw3166 !== "-99") {
    return parts[0].toUpperCase();
  }
  // 2. hasc: "IT.TOS" → "IT"
  const hasc = String(props.hasc ?? "");
  const hp = hasc.split(".");
  if (hp.length >= 2 && hp[0].length === 2 && hp[0] !== "-9") {
    return hp[0].toUpperCase();
  }
  // 3. adm0_a3: "ITA" → "IT"
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

// ---- Point-in-polygon (ray casting) for GeoJSON Polygon/MultiPolygon ----
function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // xi=lng, yi=lat in GeoJSON
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

// Compute approximate centroid (arithmetic mean of outer ring vertices).
// Used as proximity fallback when point-in-polygon fails.
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

// For each pin, find its admin-1 subdivision via point-in-polygon.
// Fallback: nearest centroid within 8 degrees (handles simplified polygons).
function computeSubdivData(
  pins: Array<{ lat: number; lng: number; country: string }>,
  admin1Geo: GeoCollection,
): { subdivKeys: Set<string>; fallbackCountries: Set<string> } {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const subdivKeys = new Set<string>();
  const fallbackCountries = new Set<string>();

  // Group admin-1 features by country ISO for fast per-country lookup.
  const featuresByCountry = new Map<string, GeoFeature[]>();
  for (const feature of admin1Geo.features) {
    const iso = countryIsoOfAdmin1(feature);
    if (!iso) continue;
    const list = featuresByCountry.get(iso) ?? [];
    list.push(feature);
    featuresByCountry.set(iso, list);
  }

  for (const pin of pins) {
    const iso = pin.country.toUpperCase();
    // City-states: no meaningful subdivisions.
    if (FIXED_COORDS[iso]) {
      fallbackCountries.add(iso);
      continue;
    }
    const candidates = featuresByCountry.get(iso) ?? [];
    if (candidates.length === 0) {
      fallbackCountries.add(iso);
      continue;
    }

    // 1. Try exact point-in-polygon.
    let found = false;
    for (const feature of candidates) {
      if (pointInGeoFeature(pin.lat, pin.lng, feature)) {
        const name = (feature.properties?.name as string) ?? "";
        if (name) {
          subdivKeys.add(`${iso}|${norm(name)}`);
          found = true;
          break;
        }
      }
    }

    // 2. Proximity fallback — nearest centroid within 8°.
    //    Handles simplified polygons that don't precisely contain city points.
    if (!found) {
      let bestDist = Infinity;
      let bestFeature: GeoFeature | null = null;
      for (const feature of candidates) {
        const c = featureCentroid(feature);
        if (!c) continue;
        const dist = Math.hypot(c.lat - pin.lat, c.lng - pin.lng);
        if (dist < bestDist) { bestDist = dist; bestFeature = feature; }
      }
      if (bestFeature && bestDist < 8) {
        const name = (bestFeature.properties?.name as string) ?? "";
        if (name) {
          subdivKeys.add(`${iso}|${norm(name)}`);
          found = true;
        }
      }
    }

    if (!found) fallbackCountries.add(iso);
  }

  return { subdivKeys, fallbackCountries };
}

export function WorldMap({
  visitedCountries,
  cities,
  plannedCountries = [],
  plannedCities = [],
  homeCountry = null,
  showPins = true,
  showSubdivisions = false,
  className,
}: {
  visitedCountries: string[];
  cities: WorldMapCity[];
  plannedCountries?: string[];
  plannedCities?: WorldMapCity[];
  homeCountry?: string | null;
  showPins?: boolean;
  showSubdivisions?: boolean;
  className?: string;
}) {
  const { data: world, error } = useWorldBorders();
  const { data: subdivWorld } = useSubdivisionBorders(showSubdivisions);

  const visitedSet = useMemo(
    () => new Set(visitedCountries.map((c) => c.toUpperCase())),
    [visitedCountries],
  );
  const plannedSet = useMemo(
    () => new Set(plannedCountries.map((c) => c.toUpperCase()).filter((c) => !visitedSet.has(c))),
    [plannedCountries, visitedSet],
  );
  // FIX: homeIso is green regardless of whether the country is also visited.
  const homeIso = homeCountry ? homeCountry.toUpperCase() : null;

  const pins = useMemo(() => dedupePins(enrichCoords(cities)), [cities]);
  const plannedPins = useMemo(() => {
    const visitedKeys = new Set(pins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    return dedupePins(enrichCoords(plannedCities)).filter(
      (p) => !visitedKeys.has(`${p.country}|${p.name.toLowerCase()}`),
    );
  }, [plannedCities, pins]);

  const visitedSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(pins, subdivWorld);
  }, [pins, showSubdivisions, subdivWorld]);

  const plannedSubdivData = useMemo(() => {
    if (!showSubdivisions || !subdivWorld) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeSubdivData(plannedPins, subdivWorld);
  }, [plannedPins, showSubdivisions, subdivWorld]);

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
      if (!iso || (!visitedSet.has(iso) && !plannedSet.has(iso))) continue;
      const g = f.geometry as { coordinates?: unknown } | undefined;
      if (g?.coordinates) collect(g.coordinates);
    }
    for (const p of pins) pts.push([p.lat, p.lng]);
    for (const p of plannedPins) pts.push([p.lat, p.lng]);
    return pts.length > 0 ? L.latLngBounds(pts) : null;
  }, [world, visitedSet, plannedSet, pins, plannedPins]);

  // Country-level style.
  // Home country is always green — takes priority over visited (orange).
  const countryStyle = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
    const planned = !!iso && !visited && plannedSet.has(iso);
    // FIX: removed `&& !visited` — home country is always green.
    const isHome = !!iso && !!homeIso && iso === homeIso;

    if (isHome) {
      if (showSubdivisions) {
        // In subdivisions mode: transparent fill so visited subdivisions show on top,
        // but keep the green border.
        const isFallback = visited && visitedSubdivData.fallbackCountries.has(iso);
        if (isFallback) {
          // No subdivisions found — fill the whole country green.
          return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
        }
        return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.18, color: "oklch(0.48 0.13 145)", weight: 1 };
      }
      return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.55, color: "oklch(0.48 0.13 145)", weight: 1 };
    }

    if (showSubdivisions) {
      if (planned) {
        const hasResolvedSubdivs =
          plannedSubdivCountries.has(iso) && !plannedSubdivData.fallbackCountries.has(iso);
        if (hasResolvedSubdivs) {
          return { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.6 0.13 255)", weight: 0.75 };
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

    if (planned) {
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

  // Subdivision-level style.
  const subdivStyle = (feature?: GeoFeature) => {
    const emptyStyle = { fillColor: "transparent", fillOpacity: 0, color: "oklch(0.88 0.005 90)", weight: 0.3 };
    if (!feature?.properties) return emptyStyle;
    const props = feature.properties;
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    const countryIso = countryIsoOfAdmin1(feature);
    if (!countryIso) return emptyStyle;

    const featureName = norm((props.name as string) ?? "");
    const key = `${countryIso}|${featureName}`;
    const isVisited = visitedSubdivData.subdivKeys.has(key);
    const isPlanned = !isVisited && plannedSubdivData.subdivKeys.has(key);
    const isInHome = !!homeIso && countryIso === homeIso;

    if (isVisited) {
      return { fillColor: "oklch(0.66 0.14 38)", fillOpacity: 0.65, color: "oklch(0.5 0.13 38)", weight: 0.75 };
    }
    if (isPlanned) {
      return {
        fillColor: "oklch(0.93 0.03 255)", fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)", weight: 0.75, dashArray: "4 3",
      };
    }

    // Unvisited subdivision in home country: subtle green fill.
    if (isInHome) {
      return { fillColor: "oklch(0.65 0.15 145)", fillOpacity: 0.22, color: "oklch(0.48 0.13 145)", weight: 0.5 };
    }

    const isInVisited = visitedSet.has(countryIso);
    const isInPlanned = plannedSet.has(countryIso);
    return {
      fillColor: "transparent", fillOpacity: 0,
      color: isInVisited ? "oklch(0.72 0.09 38)" : isInPlanned ? "oklch(0.75 0.08 255)" : "oklch(0.88 0.005 90)",
      weight: isInVisited || isInPlanned ? 0.45 : 0.25,
    };
  };

  if (error) {
    return (
      <div className={`grid place-items-center rounded-3xl bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        Mappa non disponibile al momento
      </div>
    );
  }

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      minZoom={2}
      maxZoom={9}
      worldCopyJump
      attributionControl={false}
      zoomControl={false}
      className={className}
      style={{ background: "transparent" }}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png" />

      {world && (
        <GeoJSON
          key={`country-${visitedSet.size}-${plannedSet.size}-${homeIso}-${showSubdivisions}-${visitedSubdivData.fallbackCountries.size}-${plannedSubdivData.fallbackCountries.size}`}
          data={world as never}
          style={countryStyle as never}
        />
      )}

      {showSubdivisions && subdivWorld && (
        <GeoJSON
          key={`subdiv-${visitedSubdivData.subdivKeys.size}-${visitedSubdivData.fallbackCountries.size}-${plannedSubdivData.subdivKeys.size}-${homeIso}`}
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
        plannedPins.map((c, i) => (
          <Marker key={`p-${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={plannedPinIcon}>
            <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
          </Marker>
        ))}
      {world && <FitToVisited bounds={visitedBounds} />}
    </MapContainer>
  );
}
