import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { City } from "country-state-city";

export type WorldMapCity = { name: string; country: string; lat?: number; lng?: number };

// Minimal local GeoJSON typings — avoids depending on the `geojson` types
// package being hoisted as a transitive dependency. We only ever read
// `properties` and `geometry.coordinates`, so a loose shape is enough.
type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
};
type GeoCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
};

// Pin styling reuses the same warm accent dot used elsewhere in the app
// (see trip-map.tsx) so the home map and the trip map read as the same
// visual language.
const pinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// World country borders, fetched once from a public CDN and cached in
// memory for the lifetime of the tab. This avoids bundling a multi-MB
// GeoJSON file with the app — it's the same approach already used for the
// airports dataset (lazy import) but here it's a runtime fetch since the
// file is too large to ship as an npm dependency.
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

// Pulls the ISO 3166-1 alpha-2 code out of the feature. The datasets/
// geo-countries dataset (our primary source) uses the exact property name
// "ISO3166-1-Alpha-2" and marks unassigned/disputed territories with the
// sentinel value "-99". A few other common property names are checked too,
// as a defensive fallback in case the data source ever changes.
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

export function WorldMap({
  visitedCountries,
  cities,
  className,
}: {
  /** ISO 3166-1 alpha-2 codes of countries the user has visited. */
  visitedCountries: string[];
  cities: WorldMapCity[];
  className?: string;
}) {
  const { data: world, error } = useWorldBorders();
  const visitedSet = useMemo(
    () => new Set(visitedCountries.map((c) => c.toUpperCase())),
    [visitedCountries],
  );

  // Same coordinate-enrichment strategy as TripMap: if a saved city is
  // missing lat/lng (older trips, created before coordinates were
  // captured), look it up by name within its country so the pin still
  // shows up instead of silently disappearing.
  const enrichedCities = useMemo<WorldMapCity[]>(() => {
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
  }, [cities]);

  // Dedupe pins on the same spot (e.g. two trips to the same city).
  const pins = useMemo(() => {
    const seen = new Set<string>();
    const list: (WorldMapCity & { lat: number; lng: number })[] = [];
    for (const c of enrichedCities) {
      if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
      const key = `${c.country}|${c.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(c as WorldMapCity & { lat: number; lng: number });
    }
    return list;
  }, [enrichedCities]);

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
      if (!iso || !visitedSet.has(iso)) continue;
      const g = f.geometry as { coordinates?: unknown } | undefined;
      if (g?.coordinates) collect(g.coordinates);
    }
    // Also include city pins, in case a country wasn't tagged but a city
    // was (e.g. legacy trips with cities but no countries array).
    for (const p of pins) pts.push([p.lat, p.lng]);
    return pts.length > 0 ? L.latLngBounds(pts) : null;
  }, [world, visitedSet, pins]);

  const style = (feature?: GeoFeature) => {
    const iso = feature ? isoOf(feature) : null;
    const visited = !!iso && visitedSet.has(iso);
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
          // Re-key when the visited set changes size so Leaflet re-renders
          // styles for every feature (GeoJSON layers don't auto-restyle on
          // prop changes otherwise).
          key={visitedSet.size}
          data={world as never}
          style={style as never}
        />
      )}
      {pins.map((c, i) => (
        <Marker key={`${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={pinIcon}>
          <Tooltip direction="top" offset={[0, -6]}>{c.name}</Tooltip>
        </Marker>
      ))}
      {world && <FitToVisited bounds={visitedBounds} />}
    </MapContainer>
  );
}
