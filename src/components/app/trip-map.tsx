import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Country, City } from "country-state-city";

export type MapCity = { name: string; country: string; lat?: number; lng?: number };

// Custom pin so we don't depend on Leaflet's default marker images.
const pinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 6, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [32, 32], maxZoom: 8 });
  }, [map, points]);
  return null;
}

export function TripMap({
  cities,
  countries,
  className,
  noTiles,
  compact,
}: {
  cities: MapCity[];
  countries?: string[];
  className?: string;
  noTiles?: boolean;
  compact?: boolean;
}) {
  // Enrich missing coordinates by looking the city up by name within its
  // country. This way pins always show, even for cities saved before the
  // coordinate was captured.
  const enrichedCities = useMemo<MapCity[]>(() => {
    return cities.map((c) => {
      if (typeof c.lat === "number" && typeof c.lng === "number") return c;
      const iso = (c.country || "").toUpperCase();
      if (!iso || !c.name) return c;
      const match = (City.getCitiesOfCountry(iso) ?? []).find(
        (x) => x.name.toLowerCase() === c.name.toLowerCase(),
      );
      const lat = match?.latitude ? Number(match.latitude) : NaN;
      const lng = match?.longitude ? Number(match.longitude) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { ...c, lat, lng };
      }
      return c;
    });
  }, [cities]);
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
  // Country fallback when cities have no coordinates.
  const fallbackPoints = useMemo<[number, number][]>(() => {
    if (points.length > 0) return [];
    const isos = countries && countries.length > 0
      ? countries
      : Array.from(new Set(enrichedCities.map((c) => c.country))).filter(Boolean);
    const out: [number, number][] = [];
    for (const iso of isos) {
      const c = Country.getCountryByCode(iso);
      const lat = c?.latitude ? Number(c.latitude) : NaN;
      const lng = c?.longitude ? Number(c.longitude) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng]);
    }
    return out;
  }, [points.length, countries, enrichedCities]);
  const ref = useRef<L.Map | null>(null);

  const effective = points.length > 0 ? points : fallbackPoints;
  if (effective.length === 0) {
    return (
      <div className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        Nessuna coordinata disponibile
      </div>
    );
  }

  return (
    <MapContainer
      ref={ref}
      center={effective[0]}
      zoom={4}
      scrollWheelZoom={false}
      attributionControl={false}
      zoomControl={false}
      className={className}
      style={{ background: "transparent" }}
      dragging={!compact}
      doubleClickZoom={!compact}
      touchZoom={!compact}
      boxZoom={!compact}
      keyboard={!compact}
    >
      {!noTiles && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      )}
      {enrichedCities
        .filter(
          (c): c is Required<Pick<MapCity, "lat" | "lng">> & MapCity =>
            typeof c.lat === "number" && typeof c.lng === "number",
        )
        .map((c, i) => (
          <Marker key={`${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={pinIcon}>
            <Popup>
              <strong>{c.name}</strong>
            </Popup>
            <Tooltip direction="top" offset={[0, -8]}>{c.name}</Tooltip>
          </Marker>
        ))}
      <FitBounds points={effective} />
    </MapContainer>
  );
}