import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
      map.setView(points[0], 8, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [24, 24], maxZoom: 9 });
  }, [map, points]);
  return null;
}

export function TripMap({
  cities,
  className,
}: {
  cities: MapCity[];
  className?: string;
}) {
  const points = useMemo<[number, number][]>(
    () =>
      cities
        .filter(
          (c): c is Required<Pick<MapCity, "lat" | "lng">> & MapCity =>
            typeof c.lat === "number" && typeof c.lng === "number",
        )
        .map((c) => [c.lat, c.lng]),
    [cities],
  );
  const ref = useRef<L.Map | null>(null);

  if (points.length === 0) {
    return (
      <div className={`grid place-items-center bg-muted text-xs text-muted-foreground ${className ?? ""}`}>
        Nessuna coordinata disponibile
      </div>
    );
  }

  return (
    <MapContainer
      ref={ref}
      center={points[0]}
      zoom={4}
      scrollWheelZoom={false}
      attributionControl={false}
      zoomControl={false}
      className={className}
      style={{ background: "transparent" }}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      {cities
        .filter(
          (c): c is Required<Pick<MapCity, "lat" | "lng">> & MapCity =>
            typeof c.lat === "number" && typeof c.lng === "number",
        )
        .map((c, i) => (
          <Marker key={`${c.country}-${c.name}-${i}`} position={[c.lat, c.lng]} icon={pinIcon}>
            <Tooltip direction="top" offset={[0, -8]}>
              {c.name}
            </Tooltip>
          </Marker>
        ))}
      <FitBounds points={points} />
    </MapContainer>
  );
}