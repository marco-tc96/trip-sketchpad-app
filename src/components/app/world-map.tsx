import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { City } from "country-state-city";

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
// country-state-city city dataset (see citiesOfCountry's CITYLESS_FALLBACK
// in country-data.ts). Without this, a saved city like "Hong Kong" or
// "Macao" has no lat/lng to enrich from and its pin silently never shows.
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

// Planned (not-yet-visited) cities get a visually distinct pin: hollow
// center + dashed-feel ring in the accent blue used for "planned" trips
// elsewhere in the app, so it reads as "on the map, but not been there yet".
const plannedPinIcon = L.divIcon({
  className: "voyager-pin-planned",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:oklch(0.97 0.02 250);border:2.5px solid oklch(0.55 0.16 255);box-shadow:0 2px 6px rgba(0,0,0,0.3)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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

function useWorldBorders() {
  const [data, setData] = useState<GeoCollection | null>(_worldCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (data) return;
    let alive = true;
    loadWorldBorders()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [data]);
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

function FitToVisited({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    try {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 5 });
    } catch {
      // ignore invalid bounds (e.g. no visited countries yet)
    }
  }, [map, bounds]);
  return null;
}

function enrichCoords(cities: WorldMapCity[]): (WorldMapCity & { lat?: number; lng?: number })[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

export function WorldMap({
  visitedCountries,
  cities,
  plannedCountries = [],
  plannedCities = [],
  showPins = true,
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
  className?: string;
}) {
  const { data: world, error } = useWorldBorders();
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

  const style = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
    const planned = !!iso && !visited && plannedSet.has(iso);
    if (planned) {
      // Light diagonal-stripe fill via a repeating pattern fill isn't
      // natively supported by Leaflet's vector styling, so we approximate
      // "hatched" with a very light, semi-transparent fill plus a dashed
      // border — visually reads as "not solid / upcoming" against the
      // solid visited-country fill, while staying inside Leaflet's path
      // style API (fillPattern would require an SVG defs hack per-path).
      return {
        fillColor: "oklch(0.93 0.03 255)",
        fillOpacity: 0.55,
        color: "oklch(0.6 0.13 255)",
        weight: 1,
        dashArray: "4 3",
      };
    }
    return {
      fillColor: visited ? "oklch(0.66 0.14 38)" : "transparent",
      fillOpacity: visited ? 0.55 : 0,
      color: visited ? "oklch(0.5 0.13 38)" : "oklch(0.82 0.01 90)",
      weight: visited ? 1 : 0.75,
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
          key={`${visitedSet.size}-${plannedSet.size}`}
          data={world as never}
          style={style as never}
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
