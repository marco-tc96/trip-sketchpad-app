import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { City, State } from "country-state-city";

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

// Fixed coordinates for city-states/territories not covered by the
// country-state-city city dataset.
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

<<<<<<< HEAD
// ---- Admin-1 subdivision GeoJSON (lazy-loaded only when the switch is ON) ----
let _subdivCache: GeoCollection | null = null;
let _subdivLoading: Promise<GeoCollection> | null = null;

async function loadSubdivisionBorders(): Promise<GeoCollection> {
  if (_subdivCache) return _subdivCache;
  if (_subdivLoading) return _subdivLoading;
  _subdivLoading = fetch(
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson",
  )
    .then((r) => r.json())
    .then((geo: GeoCollection) => {
      _subdivCache = geo;
      return geo;
    });
  return _subdivLoading;
}

function useSubdivisionBorders(enabled: boolean) {
  const [data, setData] = useState<GeoCollection | null>(_subdivCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    if (data) return;
    let alive = true;
    loadSubdivisionBorders()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [data, enabled]);
  return { data, error };
=======
function useAdmin1(enabled: boolean) {
  const [data, setData] = useState<GeoCollection | null>(_admin1Cache);
  useEffect(() => {
    if (!enabled || data) return;
    let alive = true;
    loadAdmin1()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* fall through — country fill remains */
      });
    return () => {
      alive = false;
    };
  }, [enabled, data]);
  return data;
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
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
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+(city|town|village)$/i, "")
      .trim();
  return cities.map((c) => {
    if (typeof c.lat === "number" && typeof c.lng === "number") return c;
    const iso = (c.country || "").toUpperCase();
    if (FIXED_COORDS[iso]) return { ...c, ...FIXED_COORDS[iso] };
    if (!iso || !c.name) return c;
    const pool = City.getCitiesOfCountry(iso) ?? [];
    const needle = normalize(c.name);
    const match =
      pool.find((x) => normalize(x.name) === needle) ||
      pool.find((x) => normalize(x.name).startsWith(needle)) ||
      pool.find((x) => normalize(x.name).includes(needle));
    const lat = match?.latitude ? Number(match.latitude) : NaN;
    const lng = match?.longitude ? Number(match.longitude) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { ...c, lat, lng };
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

// ---- Subdivision key computation ----
// For each visited city, look up the state/province it belongs to via
// country-state-city. Returns:
//   subdivKeys   – Set of "ISO|normalizedStateName" for matched subdivisions
//   fallbackCountries – ISOs where city→state matching failed (whole country colored)
function computeVisitedSubdivData(cities: WorldMapCity[]) {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const subdivKeys = new Set<string>();
  const fallbackCountries = new Set<string>();

  for (const city of cities) {
    const iso = city.country.toUpperCase();
    // City-states have no meaningful administrative subdivisions
    if (FIXED_COORDS[iso]) {
      fallbackCountries.add(iso);
      continue;
    }
    const pool = City.getCitiesOfCountry(iso) ?? [];
    const needle = norm(city.name);
    const match =
      pool.find((c) => norm(c.name) === needle) ||
      pool.find((c) => norm(c.name).startsWith(needle)) ||
      pool.find((c) => norm(c.name).includes(needle));

    if (match?.stateCode) {
      const state = State.getStateByCodeAndCountry(match.stateCode, iso);
      if (state?.name) {
        subdivKeys.add(`${iso}|${norm(state.name)}`);
      } else {
        fallbackCountries.add(iso);
      }
    } else {
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
  /** ISO 3166-1 alpha-2 codes of countries the user has visited. */
  visitedCountries: string[];
  cities: WorldMapCity[];
  /** Countries with a planned (future) trip but no past/ongoing one. */
  plannedCountries?: string[];
  /** Cities with a planned (future) trip but no past/ongoing one. */
  plannedCities?: WorldMapCity[];
  /** Whether to render the city pins at all. */
  showPins?: boolean;
<<<<<<< HEAD
  /**
   * When true, color only the specific administrative subdivisions (regions /
   * provinces / Länder / oblasts…) that contain a visited city, instead of
   * the whole country. Falls back to whole-country coloring when city→state
   * resolution fails (e.g. city-states or unmatched names).
   */
=======
  /** When true, color admin-1 subdivisions of visited cities instead of whole countries. */
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
  showSubdivisions?: boolean;
  className?: string;
}) {
  const { data: world, error } = useWorldBorders();
<<<<<<< HEAD
  const { data: subdivWorld } = useSubdivisionBorders(showSubdivisions);

=======
  const admin1 = useAdmin1(showSubdivisions);
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
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

<<<<<<< HEAD
  // Compute which subdivisions have been visited (only when the switch is ON)
  const visitedSubdivData = useMemo(() => {
    if (!showSubdivisions) {
      return { subdivKeys: new Set<string>(), fallbackCountries: new Set<string>() };
    }
    return computeVisitedSubdivData(cities);
  }, [cities, showSubdivisions]);
=======
  // For each visited city, resolve the admin-1 subdivision name via the
  // country-state-city library. Build a per-country set of normalized
  // state names to match against GeoJSON feature names. Countries where
  // a city couldn't be resolved fall back to whole-country fill so the
  // visited area is never invisible.
  const subdivisionIndex = useMemo(() => {
    const byCountry = new Map<string, Set<string>>();
    const fallbackCountries = new Set<string>();
    if (!showSubdivisions) return { byCountry, fallbackCountries };
    const normCityName = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+(city|town|village)$/i, "")
        .trim();
    for (const c of cities) {
      const iso = (c.country || "").toUpperCase();
      if (!iso || !c.name) continue;
      const pool = City.getCitiesOfCountry(iso) ?? [];
      const needle = normCityName(c.name);
      const match =
        pool.find((x) => normCityName(x.name) === needle) ||
        pool.find((x) => normCityName(x.name).startsWith(needle)) ||
        pool.find((x) => normCityName(x.name).includes(needle));
      const stateCode = match?.stateCode;
      const state = stateCode ? State.getStateByCodeAndCountry(stateCode, iso) : undefined;
      if (!state?.name) {
        fallbackCountries.add(iso);
        continue;
      }
      const set = byCountry.get(iso) ?? new Set<string>();
      set.add(normalizeName(state.name));
      byCountry.set(iso, set);
    }
    return { byCountry, fallbackCountries };
  }, [showSubdivisions, cities]);
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e

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
  // In subdivision mode:  planned countries keep the hatched blue treatment;
  // visited countries are transparent unless they are fallback countries
  // (city→state match failed) which get the normal orange fill.
  const countryStyle = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
    const planned = !!iso && !visited && plannedSet.has(iso);

    if (planned) {
      return {
        fillColor: "oklch(0.93 0.03 255)",
        fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)",
        weight: 1,
        dashArray: "4 3",
      };
    }
<<<<<<< HEAD

    if (showSubdivisions) {
      const isFallback =
        !!iso &&
        visited &&
        visitedSubdivData.fallbackCountries.has(iso);
      return {
        fillColor: isFallback ? "oklch(0.66 0.14 38)" : "transparent",
        fillOpacity: isFallback ? 0.55 : 0,
        color: visited ? "oklch(0.5 0.13 38)" : "oklch(0.82 0.01 90)",
        weight: visited ? 1 : 0.75,
      };
    }

=======
    // In subdivision mode, only fill the country if it's a fallback
    // (no matching subdivision found). Otherwise leave country layer
    // as borders only — the admin1 layer paints the visited regions.
    if (showSubdivisions) {
      const fallback = !!iso && visited && subdivisionIndex.fallbackCountries.has(iso);
      if (fallback) {
        return {
          fillColor: "oklch(0.66 0.14 38)",
          fillOpacity: 0.55,
          color: "oklch(0.5 0.13 38)",
          weight: 1,
        };
      }
      return {
        fillColor: "transparent",
        fillOpacity: 0,
        color: "oklch(0.82 0.01 90)",
        weight: 0.75,
      };
    }
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
    return {
      fillColor: visited ? "oklch(0.66 0.14 38)" : "transparent",
      fillOpacity: visited ? 0.55 : 0,
      color: visited ? "oklch(0.5 0.13 38)" : "oklch(0.82 0.01 90)",
      weight: visited ? 1 : 0.75,
    };
  };

<<<<<<< HEAD
  // Subdivision-level style (used only when showSubdivisions=true).
  // Extracts the 2-letter country code from the iso_3166_2 field (e.g. "IT-52" → "IT"),
  // then matches the normalized subdivision name against our computed set.
  const subdivStyle = (feature?: GeoFeature) => {
    const emptyStyle = {
      fillColor: "transparent",
      fillOpacity: 0,
      color: "oklch(0.88 0.005 90)",
      weight: 0.3,
    };
    if (!feature?.properties) return emptyStyle;

    const props = feature.properties;
    const norm = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

    // Extract 2-letter country ISO from iso_3166_2 ("IT-52" → "IT")
    const raw3166 = (props.iso_3166_2 as string) ?? "";
    const parts = raw3166.split("-");
    let countryIso: string | null = null;
    if (parts.length >= 2 && parts[0].length === 2 && raw3166 !== "-99") {
      countryIso = parts[0].toUpperCase();
    } else {
      // Fallback: try hasc ("IT.TOS" → "IT")
      const hasc = (props.hasc as string) ?? "";
      const hp = hasc.split(".");
      if (hp.length >= 2 && hp[0].length === 2) {
        countryIso = hp[0].toUpperCase();
      }
    }

    if (!countryIso) return emptyStyle;

    const subdivName = norm((props.name as string) ?? "");
    const key = `${countryIso}|${subdivName}`;
    const isVisited = visitedSubdivData.subdivKeys.has(key);

    if (isVisited) {
      return {
        fillColor: "oklch(0.66 0.14 38)",
        fillOpacity: 0.65,
        color: "oklch(0.5 0.13 38)",
        weight: 0.75,
      };
    }

    // Draw lighter borders only for countries that have been visited, to avoid
    // cluttering the whole map with thin province lines everywhere.
    const isInVisited = visitedSet.has(countryIso);
    return {
      fillColor: "transparent",
      fillOpacity: 0,
      color: isInVisited ? "oklch(0.72 0.09 38)" : "oklch(0.88 0.005 90)",
      weight: isInVisited ? 0.45 : 0.25,
=======
  // Admin1 styling: color only subdivisions matching visited cities,
  // and only when the parent country isn't in the fallback set.
  const admin1Style = (feature?: GeoFeature) => {
    const props = (feature?.properties ?? {}) as Record<string, unknown>;
    const name = typeof props.name === "string" ? (props.name as string) : "";
    // adm0_a3 is ISO 3166-1 alpha-3; map to alpha-2 via the world borders
    // dataset isn't readily available here, so compare against visited
    // entries by trying both: the admin1 dataset also exposes iso_3166_2
    // (e.g. "IT-52") whose prefix is alpha-2.
    const iso2 =
      typeof props.iso_3166_2 === "string" && (props.iso_3166_2 as string).length >= 2
        ? (props.iso_3166_2 as string).slice(0, 2).toUpperCase()
        : "";
    const iso = iso2;
    const visited =
      !!iso &&
      visitedSet.has(iso) &&
      !subdivisionIndex.fallbackCountries.has(iso) &&
      (subdivisionIndex.byCountry.get(iso)?.has(normalizeName(name)) ?? false);
    if (!visited) {
      return { fillOpacity: 0, opacity: 0, weight: 0 };
    }
    return {
      fillColor: "oklch(0.66 0.14 38)",
      fillOpacity: 0.6,
      color: "oklch(0.5 0.13 38)",
      weight: 0.7,
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
    };
  };

  if (error) {
    return (
      <div
        className={`grid place-items-center rounded-3xl bg-muted text-xs text-muted-foreground ${className ?? ""}`}
      >
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

      {/* Country-level layer: always rendered.
          In subdivision mode it only fills fallback countries + planned countries. */}
      {world && (
        <GeoJSON
<<<<<<< HEAD
          key={`country-${visitedSet.size}-${plannedSet.size}-${showSubdivisions}-${visitedSubdivData.fallbackCountries.size}`}
=======
          key={`w-${visitedSet.size}-${plannedSet.size}-${showSubdivisions ? 1 : 0}-${subdivisionIndex.fallbackCountries.size}`}
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
          data={world as never}
          style={countryStyle as never}
        />
      )}
<<<<<<< HEAD

      {/* Subdivision layer: rendered only when the switch is ON and data is loaded. */}
      {showSubdivisions && subdivWorld && (
        <GeoJSON
          key={`subdiv-${visitedSubdivData.subdivKeys.size}-${visitedSubdivData.fallbackCountries.size}`}
          data={subdivWorld as never}
          style={subdivStyle as never}
        />
      )}

=======
      {showSubdivisions && admin1 && (
        <GeoJSON
          key={`a1-${visitedSet.size}-${subdivisionIndex.byCountry.size}`}
          data={admin1 as never}
          style={admin1Style as never}
        />
      )}
>>>>>>> f069908ab41303142f6d26bec04104924e672b6e
      {showPins &&
        pins.map((c, i) => (
          <Marker
            key={`v-${c.country}-${c.name}-${i}`}
            position={[c.lat, c.lng]}
            icon={visitedPinIcon}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {c.name}
            </Tooltip>
          </Marker>
        ))}
      {showPins &&
        plannedPins.map((c, i) => (
          <Marker
            key={`p-${c.country}-${c.name}-${i}`}
            position={[c.lat, c.lng]}
            icon={plannedPinIcon}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {c.name}
            </Tooltip>
          </Marker>
        ))}
      {world && <FitToVisited bounds={visitedBounds} />}
    </MapContainer>
  );
}
