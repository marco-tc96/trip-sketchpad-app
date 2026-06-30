import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// NOTE: country-state-city is intentionally NOT imported here — it causes
// Vite pre-bundling failures in this environment. Coordinates are supplied
// directly from the stored city data (lat/lng saved at trip-creation time).
// Subdivision detection uses point-in-polygon on the admin-1 GeoJSON instead
// of name matching, which is more accurate and requires no extra package.

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

// Extract 2-letter country ISO from an admin-1 feature (iso_3166_2 "IT-52" → "IT").
function countryIsoOfAdmin1(feature: GeoFeature): string | null {
  const props = feature.properties ?? {};
  const raw3166 = (props.iso_3166_2 as string) ?? "";
  const parts = raw3166.split("-");
  if (parts.length >= 2 && parts[0].length === 2 && raw3166 !== "-99") {
    return parts[0].toUpperCase();
  }
  // Fallback: hasc field ("IT.TOS" → "IT")
  const hasc = (props.hasc as string) ?? "";
  const hp = hasc.split(".");
  if (hp.length >= 2 && hp[0].length === 2) {
    return hp[0].toUpperCase();
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

// Returns only cities that already have coordinates (stored from the picker
// at trip-creation time, or from FIXED_COORDS for city-states).
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
// GeoJSON coordinates are [longitude, latitude].
function pointInRing(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // xi = lng, yi = lat
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

// ---- Subdivision detection via point-in-polygon ----
// For each pin, finds which admin-1 feature it falls into.
// Returns:
//   subdivKeys        – Set of "ISO|featureName" for matched subdivisions
//   fallbackCountries – ISO codes where no subdivision was matched (whole country colored)
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
    if (!found) {
      fallbackCountries.add(iso);
    }
  }

  return { subdivKeys, fallbackCountries };
}

export function WorldMap({
  visitedCountries,
  cities,
  plannedCountries = [],
  plannedCities = [],
  showPins = true,
  showSubdivisions = false,
  className,
}: {
  visitedCountries: string[];
  cities: WorldMapCity[];
  plannedCountries?: string[];
  plannedCities?: WorldMapCity[];
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
    () =>
      new Set(
        plannedCountries.map((c) => c.toUpperCase()).filter((c) => !visitedSet.has(c)),
      ),
    [plannedCountries, visitedSet],
  );

  const pins = useMemo(() => dedupePins(enrichCoords(cities)), [cities]);
  const plannedPins = useMemo(() => {
    const visitedKeys = new Set(pins.map((p) => `${p.country}|${p.name.toLowerCase()}`));
    return dedupePins(enrichCoords(plannedCities)).filter(
      (p) => !visitedKeys.has(`${p.country}|${p.name.toLowerCase()}`),
    );
  }, [plannedCities, pins]);

  // Subdivision detection via point-in-polygon — runs only when the admin-1
  // GeoJSON is loaded (lazy). Returns empty sets until then.
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

  // Set of country ISOs that have at least one resolved planned subdivision
  const plannedSubdivCountries = useMemo(() => {
    const set = new Set<string>();
    for (const key of plannedSubdivData.subdivKeys) {
      set.add(key.split("|")[0]);
    }
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
  const countryStyle = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
    const planned = !!iso && !visited && plannedSet.has(iso);

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
  // Uses the same key format as computeSubdivData: "ISO|normalizedFeatureName".
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

    if (isVisited) {
      return { fillColor: "oklch(0.66 0.14 38)", fillOpacity: 0.65, color: "oklch(0.5 0.13 38)", weight: 0.75 };
    }
    if (isPlanned) {
      return {
        fillColor: "oklch(0.93 0.03 255)", fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)", weight: 0.75, dashArray: "4 3",
      };
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
          key={`country-${visitedSet.size}-${plannedSet.size}-${showSubdivisions}-${visitedSubdivData.fallbackCountries.size}-${plannedSubdivData.fallbackCountries.size}`}
          data={world as never}
          style={countryStyle as never}
        />
      )}

      {showSubdivisions && subdivWorld && (
        <GeoJSON
          key={`subdiv-${visitedSubdivData.subdivKeys.size}-${visitedSubdivData.fallbackCountries.size}-${plannedSubdivData.subdivKeys.size}`}
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
