import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geocodeCity } from "@/lib/country-data";

export type MapCity = { name: string; country: string; lat?: number; lng?: number };
export type MapRoute = { from: string; to: string; mode: string; country?: string };

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

// Colour (and optional dash pattern) per transport mode for the route lines.
const MODE_STYLE: Record<string, { color: string; dash?: string }> = {
  plane:    { color: "#0ea5e9", dash: "2 8" },   // sky, dotted
  ferry:    { color: "#06b6d4", dash: "8 6" },   // cyan, dashed
  train:    { color: "#f59e0b" },                // amber
  bus:      { color: "#3b82f6" },                // blue
  metro:    { color: "#8b5cf6" },                // violet
  tram:     { color: "#10b981" },                // emerald
  car:      { color: "#f97316" },                // orange
  moto:     { color: "#f97316" },                // orange
  transfer: { color: "#94a3b8" },                // slate
};
const modeStyle = (mode: string) => MODE_STYLE[mode] ?? MODE_STYLE.transfer;

// Custom pin so we don't depend on Leaflet's default marker images.
const pinIcon = L.divIcon({
  className: "voyager-pin",
  html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:oklch(0.66 0.14 38);border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Strip IATA airport codes so a leg endpoint like "FCO - Roma" or
// "Bologna Guglielmo Marconi Airport (BLQ)" geocodes on its real place name.
function cleanPlace(s: string): string {
  return (s ?? "")
    .replace(/\s*\([A-Z]{3}\)\s*$/, "")
    .replace(/^[A-Z]{3}\s*-\s*/, "")
    .trim();
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 5, { animate: false });
      return;
    }
    const b = L.latLngBounds(points);
    map.fitBounds(b, { padding: [32, 32], maxZoom: 6 });
  }, [map, points]);
  return null;
}

export function TripMap({
  cities,
  countries,
  routes,
  showRoutes,
  className,
  noTiles,
  compact,
}: {
  cities: MapCity[];
  countries?: string[];
  routes?: MapRoute[];
  showRoutes?: boolean;
  className?: string;
  noTiles?: boolean;
  compact?: boolean;
}) {
  // Async geocoding cache for cities + route endpoints without stored coords.
  // Value is null when geocoding failed (explicit failure, not "pending").
  const [geoCache, setGeoCache] = useState<Record<string, { lat: number; lng: number } | null>>({});

  // Unique route endpoints that need geocoding (only when routes are shown).
  const routeEndpoints = useMemo<Array<{ name: string; country?: string }>>(() => {
    if (!showRoutes || !routes || routes.length === 0) return [];
    const seen = new Map<string, { name: string; country?: string }>();
    for (const r of routes) {
      for (const raw of [r.from, r.to]) {
        const name = cleanPlace(raw);
        if (!name) continue;
        const key = `${r.country ?? ""}|${name}`;
        if (!seen.has(key)) seen.set(key, { name, country: r.country });
      }
    }
    return [...seen.values()];
  }, [routes, showRoutes]);

  useEffect(() => {
    const targets: Array<{ name: string; country?: string }> = [
      ...cities
        .filter((c) => typeof c.lat !== "number" || typeof c.lng !== "number")
        .map((c) => ({ name: c.name, country: c.country })),
      ...routeEndpoints,
    ];
    const missing = targets.filter((t) => !(`${t.country ?? ""}|${t.name}` in geoCache));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, { lat: number; lng: number } | null> = {};
      for (const tgt of missing) {
        const key = `${tgt.country ?? ""}|${tgt.name}`;
        if (key in geoCache || key in updates) continue;
        const result = await geocodeCity(tgt.name, tgt.country ?? "");
        updates[key] = result; // null on failure — stored explicitly
      }
      if (!cancelled && Object.keys(updates).length > 0) {
        setGeoCache((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities, routeEndpoints]);

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

  // Resolve a route endpoint to coordinates (geocode → centroid fallback).
  const resolve = useMemo(() => {
    return (raw: string, country?: string): [number, number] | null => {
      const name = cleanPlace(raw);
      const key = `${country ?? ""}|${name}`;
      const cached = geoCache[key];
      if (cached) return [cached.lat, cached.lng];
      if (key in geoCache && geoCache[key] === null && country) {
        const centroid = COUNTRY_CENTROIDS[country.toUpperCase()];
        if (centroid) return centroid;
      }
      return null;
    };
  }, [geoCache]);

  // Build the polylines for the legs that could be geocoded.
  const routeLines = useMemo(() => {
    if (!showRoutes || !routes) return [] as Array<{ a: [number, number]; b: [number, number]; mode: string; key: string }>;
    const out: Array<{ a: [number, number]; b: [number, number]; mode: string; key: string }> = [];
    routes.forEach((r, i) => {
      const a = resolve(r.from, r.country);
      const b = resolve(r.to, r.country);
      if (a && b) out.push({ a, b, mode: r.mode, key: `${i}-${r.from}-${r.to}` });
    });
    return out;
  }, [routes, showRoutes, resolve]);

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
  const cityPoints = points.length > 0 ? points : fallbackPoints;
  // When showing routes, fit the view to include every leg endpoint too.
  const boundsPoints = useMemo<[number, number][]>(
    () => (showRoutes ? [...cityPoints, ...routeLines.flatMap((l) => [l.a, l.b])] : cityPoints),
    [cityPoints, routeLines, showRoutes],
  );

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
      className={className}
      style={{ background: "transparent" }}
    >
      {!noTiles && (
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
      )}

      {showRoutes &&
        routeLines.map((l) => {
          const st = modeStyle(l.mode);
          return (
            <Polyline
              key={l.key}
              positions={[l.a, l.b]}
              pathOptions={{ color: st.color, weight: 3, opacity: 0.9, dashArray: st.dash }}
            />
          );
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
              <strong>{c.name}</strong>
            </Popup>
            <Tooltip direction="top" offset={[0, -8]}>
              {c.name}
            </Tooltip>
          </Marker>
        ))}
      <FitBounds points={boundsPoints} />
    </MapContainer>
  );
}
