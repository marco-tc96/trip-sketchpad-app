import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BarChart3, Globe2, MapPin, CalendarDays, Briefcase, Palmtree, Footprints, Settings as SettingsIcon,
  Compass, Route as RouteIcon, Plane, TrainFront, Car, Bus, Ship, Bike, CarTaxiFront, TramFront,
} from "lucide-react";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { listTrips } from "@/lib/trips.functions";
import { listTransportItems } from "@/lib/itinerary.functions";
import { aggregateTransport, useTransportKm } from "@/lib/transport-stats";
import type { Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { flagOf, countryNameLocalized, cityNameLocalized, geocodeCity } from "@/lib/country-data";
import { SettingsDialog, type ProfileFormValues } from "@/components/app/settings-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
type City = { name: string; country: string };

const CONTINENT_BY_ISO: Record<string, string> = {
  IT:"Europe",FR:"Europe",DE:"Europe",ES:"Europe",PT:"Europe",GB:"Europe",NL:"Europe",BE:"Europe",CH:"Europe",AT:"Europe",
  PL:"Europe",SE:"Europe",NO:"Europe",DK:"Europe",FI:"Europe",GR:"Europe",CZ:"Europe",HU:"Europe",RO:"Europe",BG:"Europe",
  HR:"Europe",SK:"Europe",SI:"Europe",LT:"Europe",LV:"Europe",EE:"Europe",LU:"Europe",MT:"Europe",CY:"Europe",IE:"Europe",
  IS:"Europe",AL:"Europe",RS:"Europe",BA:"Europe",ME:"Europe",MK:"Europe",MD:"Europe",BY:"Europe",UA:"Europe",RU:"Europe",
  LI:"Europe",MC:"Europe",SM:"Europe",VA:"Europe",AD:"Europe",XK:"Europe",
  CN:"Asia",JP:"Asia",IN:"Asia",KR:"Asia",TH:"Asia",VN:"Asia",ID:"Asia",MY:"Asia",SG:"Asia",PH:"Asia",
  TW:"Asia",HK:"Asia",MO:"Asia",TR:"Asia",SA:"Asia",AE:"Asia",IL:"Asia",JO:"Asia",LB:"Asia",KW:"Asia",
  QA:"Asia",BH:"Asia",OM:"Asia",IQ:"Asia",IR:"Asia",SY:"Asia",YE:"Asia",AF:"Asia",PK:"Asia",BD:"Asia",
  LK:"Asia",NP:"Asia",BT:"Asia",MM:"Asia",KH:"Asia",LA:"Asia",MN:"Asia",KZ:"Asia",UZ:"Asia",TM:"Asia",
  TJ:"Asia",KG:"Asia",AZ:"Asia",AM:"Asia",GE:"Asia",PS:"Asia",TL:"Asia",
  NG:"Africa",EG:"Africa",ZA:"Africa",KE:"Africa",ET:"Africa",GH:"Africa",TZ:"Africa",MA:"Africa",DZ:"Africa",AO:"Africa",
  CM:"Africa",CI:"Africa",SN:"Africa",MG:"Africa",MZ:"Africa",ZM:"Africa",ZW:"Africa",TN:"Africa",LY:"Africa",SD:"Africa",
  SS:"Africa",UG:"Africa",CD:"Africa",CG:"Africa",GA:"Africa",BF:"Africa",ML:"Africa",NE:"Africa",TD:"Africa",SO:"Africa",
  ER:"Africa",DJ:"Africa",RW:"Africa",BI:"Africa",MW:"Africa",NA:"Africa",BW:"Africa",LS:"Africa",SZ:"Africa",MR:"Africa",
  GM:"Africa",GN:"Africa",SL:"Africa",LR:"Africa",GW:"Africa",BJ:"Africa",TG:"Africa",GQ:"Africa",CF:"Africa",CV:"Africa",
  ST:"Africa",KM:"Africa",MU:"Africa",SC:"Africa",
  US:"North America",CA:"North America",MX:"North America",GT:"North America",BZ:"North America",SV:"North America",
  HN:"North America",NI:"North America",CR:"North America",PA:"North America",CU:"North America",JM:"North America",
  HT:"North America",DO:"North America",TT:"North America",BB:"North America",LC:"North America",VC:"North America",
  GD:"North America",AG:"North America",DM:"North America",KN:"North America",
  BR:"South America",AR:"South America",CL:"South America",CO:"South America",PE:"South America",VE:"South America",
  EC:"South America",BO:"South America",PY:"South America",UY:"South America",GY:"South America",SR:"South America",
  AU:"Oceania",NZ:"Oceania",PG:"Oceania",FJ:"Oceania",SB:"Oceania",VU:"Oceania",WS:"Oceania",TO:"Oceania",
  KI:"Oceania",FM:"Oceania",PW:"Oceania",MH:"Oceania",NR:"Oceania",TV:"Oceania",
};

const CONTINENT_KEY: Record<string, string> = {
  "Europe":"continent_europe","Asia":"continent_asia","Africa":"continent_africa",
  "North America":"continent_north_america","South America":"continent_south_america","Oceania":"continent_oceania",
};

const CONTINENT_EMOJI: Record<string, string> = {
  "Europe": "🌍",
  "Africa": "🌍",
  "Asia": "🌏",
  "Oceania": "🌏",
  "North America": "🌎",
  "South America": "🌎",
};

// A plain side-view train/metro car — two windows, two wheels — used ONLY
// for "metro" below. Lucide's own train/tram icons (TrainFront, TramFront)
// are both FRONT-view glyphs that read as near-identical at this icon size,
// which is exactly why metro used to look like tram here; this custom glyph
// is deliberately a different silhouette (a horizontal wagon) so the two
// are unmistakable at a glance.
function MetroWagonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="18" height="11" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <rect x="6.3" y="8.3" width="3.6" height="2.4" rx="0.4" />
      <rect x="14.1" y="8.3" width="3.6" height="2.4" rx="0.4" />
      <circle cx="7.5" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </svg>
  );
}

// ── Transport stats: icon + i18n-label lookup per leg mode ─────────────────
const MODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  plane: Plane,
  train: TrainFront,
  car: Car,
  taxi: CarTaxiFront,
  moto: Bike,
  ferry: Ship,
  bus: Bus,
  metro: MetroWagonIcon,
  tram: TramFront,
};

const MODE_LABEL_KEY: Record<string, string> = {
  plane: "flight",
  train: "train",
  car: "car",
  taxi: "taxi",
  moto: "moto",
  ferry: "ferry",
  bus: "bus",
  metro: "metro",
  tram: "tram",
};

// Same per-mode colours used for journey lines/markers on the trip map page
// (see MODE_STYLE in trip-map.tsx) — kept in sync so a mode reads as the
// same colour everywhere in the app.
const MODE_COLOR: Record<string, string> = {
  car: "#ef4444",   // red-500
  moto: "#22c55e",  // green-500
  plane: "#38bdf8", // sky-400
  train: "#6b7280", // gray-500
  taxi: "#eab308",  // yellow-500
  bus: "#2563eb",   // blue-600
  metro: "#8b5cf6", // violet-500
  tram: "#10b981",  // emerald-500
  ferry: "#0d9488", // teal-600
};

// ── Farthest-points compass: geocode every visited city (once, then cached —
// both in-memory for the session and persisted to localStorage so a return
// visit is instant) and track the N/S/E/W extremes among them. ────────────
const CITY_GEOCACHE_KEY = "voyager_citygeocache_v2";
const CITY_GEOCACHE_KEY_LEGACY = "voyager_citygeocache_v1";
// Persisted cache holds ONLY successful geocodes. A failure is never written,
// so a city that failed once (transient rate-limit / timeout) is retried on
// the next visit instead of being permanently missing — which is exactly the
// bug that made a far-east city (e.g. Inje, KR) drop out and a closer one
// (e.g. Novalja, HR) be wrongly shown as the easternmost.
let _cityGeoPersisted: Record<string, { lat: number; lng: number }> = {};
// Load valid coordinates, keeping the already-resolved cities so the compass
// shows immediately. The legacy (v1) cache is migrated too — dropping only its
// poisoned null entries — so existing users don't have to re-geocode from
// scratch (which is why the panel appeared empty after the cache-key bump).
function _mergeValidGeo(raw: string | null) {
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, { lat: number; lng: number } | null>;
    for (const [k, v] of Object.entries(parsed)) {
      if (v && typeof v.lat === "number" && typeof v.lng === "number" && !_cityGeoPersisted[k]) {
        _cityGeoPersisted[k] = v;
      }
    }
  } catch {
    /* ignore */
  }
}
try {
  if (typeof localStorage !== "undefined") {
    _mergeValidGeo(localStorage.getItem(CITY_GEOCACHE_KEY));
    _mergeValidGeo(localStorage.getItem(CITY_GEOCACHE_KEY_LEGACY));
  }
} catch {
  /* ignore */
}
let _cityGeoSaveTimer: ReturnType<typeof setTimeout> | undefined;
function persistCityGeoCache() {
  if (_cityGeoSaveTimer) clearTimeout(_cityGeoSaveTimer);
  _cityGeoSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CITY_GEOCACHE_KEY, JSON.stringify(_cityGeoPersisted));
    } catch {
      /* ignore */
    }
  }, 500);
}

// In-memory cache of ONLY successfully resolved coordinates.
const _cityGeoCache = new Map<string, { lat: number; lng: number }>(
  Object.entries(_cityGeoPersisted),
);

// Geocode a single city, retrying transient failures (rate limits / timeouts)
// with backoff. Only a valid result is cached/persisted; a persistent failure
// returns null WITHOUT poisoning the cache, so it stays eligible for retry.
async function coordsFor(name: string, country: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${country}|${name}`;
  const cached = _cityGeoCache.get(key);
  if (cached) return cached;
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = await geocodeCity(name, country);
    if (c && typeof c.lat === "number" && typeof c.lng === "number") {
      _cityGeoCache.set(key, c);
      _cityGeoPersisted[key] = c;
      persistCityGeoCache();
      return c;
    }
    await new Promise<void>((r) => setTimeout(r, 1500));
  }
  return null;
}

type ExtremePoint = { name: string; country: string; lat: number; lng: number };

// Progressive: returns whatever is already resolved (instant on repeat
// visits thanks to the persisted cache) and properly recomputes — via real
// state, not a memo keyed only on the (unchanging) city list — every time a
// new city resolves in the background, geocoding one at a time to stay
// polite to the (rate-limited) geocoding service. Every visited city is
// eventually included; nothing is capped or sampled.
function resolvedPointsFor(cities: City[]): ExtremePoint[] {
  const out: ExtremePoint[] = [];
  for (const c of cities) {
    const coords = _cityGeoCache.get(`${c.country}|${c.name}`);
    if (coords) out.push({ name: c.name, country: c.country, lat: coords.lat, lng: coords.lng });
  }
  return out;
}

function useExtremePoints(cities: City[]): { points: ExtremePoint[]; resolving: boolean } {
  const key = cities.map((c) => `${c.country}|${c.name}`).join(",");
  const [points, setPoints] = useState<ExtremePoint[]>(() => resolvedPointsFor(cities));
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let alive = true;
    // Re-sync immediately for the new city list (covers cities already
    // cached, e.g. from a previous visit) before kicking off any new fetches.
    setPoints(resolvedPointsFor(cities));
    if (cities.length === 0) { setResolving(false); return; }
    const pending = cities.filter((c) => !_cityGeoCache.has(`${c.country}|${c.name}`));
    if (pending.length === 0) { setResolving(false); return; }
    setResolving(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      for (let i = 0; i < pending.length; i++) {
        if (!alive) break;
        const c = pending[i];
        await coordsFor(c.name, c.country);
        if (!alive) break;
        setPoints(resolvedPointsFor(cities));
        // Nominatim's usage policy caps client-side use at ~1 request/sec —
        // matches the pacing already used elsewhere in this codebase
        // (see useLocalizedCityNames) to avoid getting rate-limited/blocked,
        // which previously made every single city fail and the whole panel
        // disappear.
        if (i < pending.length - 1) {
          await new Promise<void>((r) => { timer = setTimeout(r, 1100); });
        }
      }
    })()
      .catch(() => { /* ignore */ })
      .finally(() => { if (alive) setResolving(false); });
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { points, resolving };
}

function getCities(tr: Trip): City[] {
  const raw = (tr as unknown as { cities?: unknown }).cities;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is City => !!c && typeof c === "object" && typeof (c as City).name === "string");
}

type ProfileData = {
  username?: string | null;
  home_country?: string | null;
  birth_country?: string | null;
};

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const profFn = useServerFn(getProfile);
  const updFn = useServerFn(updateProfile);
  const tripsFn = useServerFn(listTrips);
  const transportItemsFn = useServerFn(listTransportItems);
  const prof = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => tripsFn() });
  const transportItems = useQuery({ queryKey: ["transport-items"], queryFn: () => transportItemsFn() });
  const lang = i18n.language || "it";

  const profData = prof.data as (typeof prof.data & ProfileData) | undefined;

  const formInitial: ProfileFormValues = {
    display_name: prof.data?.display_name ?? "",
    username: profData?.username ?? "",
    home_currency: prof.data?.home_currency ?? "EUR",
    language: (prof.data?.language as Lang) ?? "it",
    home_country: profData?.home_country ?? "",
    birth_country: profData?.birth_country ?? "",
  };

  async function handleSaveSettings(values: ProfileFormValues) {
    try {
      await updFn({
        data: {
          display_name: values.display_name,
          username: values.username || null,
          home_currency: values.home_currency,
          language: values.language,
          home_country: values.home_country || null,
          birth_country: values.birth_country || null,
        },
      });
      setLanguage(values.language);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("saved"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("error_generic");
      toast.error(msg === "username_taken" ? t("username_taken") : msg);
      throw e;
    }
  }

  const stats = useMemo(() => {
    const all = trips.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const WISHLIST_SENTINEL = "2099-01-01";
    // Exclude wishlist trips; split into past and ongoing
    const realTrips = all.filter((tr) => tr.start_date < WISHLIST_SENTINEL);
    const past = realTrips.filter((tr) => tr.end_date < today);
    const ongoing = realTrips.filter((tr) => tr.start_date <= today && tr.end_date >= today);
    // Both past and ongoing contribute to all statistics
    const forStats = [...past, ...ongoing];

    const homeIso = profData?.home_country?.toUpperCase() ?? null;
    const countrySet = new Set<string>();
    const cityKey = new Set<string>();
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, { name: string; country: string; count: number }>();
    const continentCounts = new Map<string, number>();
    const countryFirstVisit = new Map<string, string>();
    const cityFirstVisit = new Map<string, string>();
    const continentFirstVisit = new Map<string, string>();
    let nights = 0, business = 0, vacation = 0, daytrip = 0;
    const byYear: Record<string, { business: number; vacation: number; daytrip: number }> = {};

    const sortedForStats = [...forStats].sort((a, b) => a.start_date.localeCompare(b.start_date));

    for (const tr of sortedForStats) {
      const cs = (tr as unknown as { countries?: string[] }).countries ?? [];
      const continentsThisTrip = new Set<string>();
      cs.forEach((c) => {
        countrySet.add(c);
        countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
        if (!countryFirstVisit.has(c)) countryFirstVisit.set(c, tr.start_date);
        const continent = CONTINENT_BY_ISO[c.toUpperCase()];
        if (continent) continentsThisTrip.add(continent);
      });
      continentsThisTrip.forEach((cont) => {
        continentCounts.set(cont, (continentCounts.get(cont) ?? 0) + 1);
        if (!continentFirstVisit.has(cont)) continentFirstVisit.set(cont, tr.start_date);
      });
      getCities(tr).forEach((c) => {
        cityKey.add(`${c.country}|${c.name}`);
        const k = `${c.country}|${c.name}`;
        const cur = cityCounts.get(k);
        if (cur) cur.count += 1;
        else cityCounts.set(k, { name: c.name, country: c.country, count: 1 });
        if (!cityFirstVisit.has(k)) cityFirstVisit.set(k, tr.start_date);
      });
      // For ongoing trips, use today as effective end date so nights increments daily
      const isOngoing = tr.start_date <= today && tr.end_date >= today;
      const effectiveEnd = isOngoing ? today : tr.end_date;
      nights += Math.max(1, Math.round(
        (new Date(effectiveEnd).getTime() - new Date(tr.start_date).getTime()) / 86400000,
      ));
      const rawType = (tr as unknown as { trip_type?: string }).trip_type;
      const ttype: "business"|"daytrip"|"vacation" = rawType === "business" ? "business" : rawType === "daytrip" ? "daytrip" : "vacation";
      if (ttype === "business") business += 1; else if (ttype === "daytrip") daytrip += 1; else vacation += 1;
      const y = tr.start_date.slice(0, 4);
      byYear[y] = byYear[y] ?? { business: 0, vacation: 0, daytrip: 0 };
      byYear[y][ttype] += 1;
    }

    const years = Object.entries(byYear).map(([y, v]) => ({ y, ...v, total: v.business + v.vacation + v.daytrip })).sort((a, b) => b.y.localeCompare(a.y));
    const countriesRanked = [...countryCounts.entries()]
      .map(([iso, count]) => ({ iso, count, firstVisit: countryFirstVisit.get(iso) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));
    const homeCountryCount = homeIso ? (countryCounts.get(homeIso) ?? 0) : 0;
    const foreignCountriesRanked = countriesRanked.filter((r) => r.iso.toUpperCase() !== (homeIso ?? ""));
    const citiesRanked = [...cityCounts.entries()]
      .map(([k, v]) => ({ ...v, firstVisit: cityFirstVisit.get(k) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));
    const continentsRanked = [...continentCounts.entries()]
      .map(([name, count]) => ({ name, count, firstVisit: continentFirstVisit.get(name) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));

    return {
      tripCount: forStats.length,
      // Trip ids contributing to the stats above (past + ongoing, wishlist
      // excluded) — used to filter the cross-trip transport-items query
      // below so the transport section stays consistent with every other
      // stat on this page.
      forStatsIds: new Set(forStats.map((tr) => tr.id)),
      countries: [...countrySet].sort((a, b) =>
        countryNameLocalized(a, lang).localeCompare(countryNameLocalized(b, lang), lang),
      ),
      countriesRanked, homeCountryCount, foreignCountriesRanked, citiesRanked, continentsRanked,
      cityCount: cityKey.size, nights, business, vacation, daytrip, years,
      maxYear: Math.max(1, ...years.map((v) => v.total)),
    };
  }, [trips.data, prof.data, lang]);

  // Cross-trip transport statistics — uses per vehicle, top line/route/
  // station, and (progressively, via geocoding) km travelled per mode.
  const transportAgg = useMemo(() => {
    const rows = (transportItems.data ?? []).filter((r) => stats.forStatsIds.has(r.trip_id));
    return aggregateTransport(rows);
  }, [transportItems.data, stats.forStatsIds]);
  const { kmByMode, resolving: kmResolving } = useTransportKm(transportAgg.legsByMode);

  // Every distinct visited city (name+country), used to resolve the
  // farthest-points compass below.
  const visitedCities = useMemo<City[]>(
    () => stats.citiesRanked.map((c) => ({ name: c.name, country: c.country })),
    [stats.citiesRanked],
  );
  const { points: extremePoints, resolving: extremesResolving } = useExtremePoints(visitedCities);
  const extremes = useMemo(() => {
    if (extremePoints.length === 0) return null;
    return {
      north: extremePoints.reduce((a, b) => (b.lat > a.lat ? b : a)),
      south: extremePoints.reduce((a, b) => (b.lat < a.lat ? b : a)),
      east: extremePoints.reduce((a, b) => (b.lng > a.lng ? b : a)),
      west: extremePoints.reduce((a, b) => (b.lng < a.lng ? b : a)),
    };
  }, [extremePoints]);

  const homeCountryIso = profData?.home_country;
  const birthCountryIso = profData?.birth_country;
  const username = profData?.username;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Profile header */}
      <div className="relative flex items-center gap-4 pb-6">
        <span aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground/70 ring-1 ring-border">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8v1H4v-1z" />
          </svg>
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-serif text-2xl font-bold leading-tight">{prof.data?.display_name || t("display_name")}</p>
          {username && <p className="text-sm text-muted-foreground">@{username}</p>}
          {/* Show birth country → home country if different, otherwise just home country */}
          {(homeCountryIso || birthCountryIso) && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              {birthCountryIso && birthCountryIso !== homeCountryIso && (
                <>
                  <span>{flagOf(birthCountryIso)}</span>
                  <span>{countryNameLocalized(birthCountryIso, lang)}</span>
                  {homeCountryIso && <span className="opacity-50">→</span>}
                </>
              )}
              {homeCountryIso && (
                <>
                  <span>{flagOf(homeCountryIso)}</span>
                  <span>{countryNameLocalized(homeCountryIso, lang)}</span>
                </>
              )}
            </p>
          )}
        </div>

        <SettingsDialog initial={formInitial} onSave={handleSaveSettings} trigger={
          <button
            type="button"
            aria-label={t("edit_settings")}
            className="absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        } />
      </div>

      <section className="mt-0">
        <div className="flex items-center justify-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">{t("stats")}</h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat icon={Globe2} label={t("countries")} value={stats.countries.length} />
          <Stat icon={MapPin} label={t("cities")} value={stats.cityCount} />
          <Stat icon={CalendarDays} label={t("nights")} value={stats.nights} />
          <Stat icon={BarChart3} label={t("trips")} value={stats.tripCount} />
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-center font-serif text-base font-semibold">{t("countries_visited")}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.countries.length === 0 && <p className="text-sm text-muted-foreground">{t("no_trips")}</p>}
            {stats.countries.map((iso) => (
              <span key={iso} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                <span>{flagOf(iso)}</span>
                <span>{countryNameLocalized(iso, lang)}</span>
              </span>
            ))}
          </div>
        </div>

        {stats.countriesRanked.length > 0 && (
          <div className="mt-4 space-y-4">
            {homeCountryIso && stats.homeCountryCount > 0 && (
              <RankList title={t("home_country_trips")} rows={[{ key: homeCountryIso, left: <><span>{flagOf(homeCountryIso)}</span><span>{countryNameLocalized(homeCountryIso, lang)}</span></>, count: stats.homeCountryCount }]} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.foreignCountriesRanked.length > 0 && (
                <RankList
                  title={homeCountryIso ? t("most_visited_foreign_countries") : t("most_visited_countries")}
                  rows={stats.foreignCountriesRanked.map((r) => ({ key: r.iso, left: <><span>{flagOf(r.iso)}</span><span>{countryNameLocalized(r.iso, lang)}</span></>, count: r.count }))}
                />
              )}
              <RankList
                title={t("most_visited_cities")}
                rows={stats.citiesRanked.map((r) => ({ key: `${r.country}|${r.name}`, left: <><span>{flagOf(r.country)}</span><span>{cityNameLocalized(r.name, lang)}</span></>, count: r.count }))}
              />
            </div>
            {stats.continentsRanked.length > 0 && (
              <RankList
                title={t("most_visited_continents")}
                rows={stats.continentsRanked.map((r) => ({ key: r.name, left: <><span>{CONTINENT_EMOJI[r.name] ?? "🌍"}</span><span>{t(CONTINENT_KEY[r.name] ?? r.name)}</span></>, count: r.count }))}
              />
            )}
          </div>
        )}

        {visitedCities.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-center font-serif text-base font-semibold">{t("extremes_title")}</h3>
            {extremes ? (
              <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 grid-rows-3 items-center justify-items-center gap-2">
                <div />
                <CompassChip dir="N" title={t("northernmost")} point={extremes.north} lang={lang} />
                <div />

                <CompassChip dir="W" title={t("westernmost")} point={extremes.west} lang={lang} />
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <Compass className="h-6 w-6" />
                </span>
                <CompassChip dir="E" title={t("easternmost")} point={extremes.east} lang={lang} />

                <div />
                <CompassChip dir="S" title={t("southernmost")} point={extremes.south} lang={lang} />
                <div />
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-muted-foreground">
                {extremesResolving ? t("loading") : t("no_trips")}
              </p>
            )}
          </div>
        )}

        {(stats.business + stats.vacation + stats.daytrip) > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-center font-serif text-base font-semibold">{t("work_vs_vacation")}</h3>
            <div className="mt-3 flex items-center justify-center gap-5">
              <PieChart business={stats.business} vacation={stats.vacation} daytrip={stats.daytrip} />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /><Palmtree className="h-3.5 w-3.5 text-emerald-600" /><span className="tabular-nums font-medium">{stats.vacation}</span><span className="text-muted-foreground">{t("vacation")}</span></li>
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-slate-600" /><Briefcase className="h-3.5 w-3.5 text-slate-700" /><span className="tabular-nums font-medium">{stats.business}</span><span className="text-muted-foreground">{t("business")}</span></li>
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /><Footprints className="h-3.5 w-3.5 text-amber-600" /><span className="tabular-nums font-medium">{stats.daytrip}</span><span className="text-muted-foreground">{t("daytrip")}</span></li>
              </ul>
            </div>
          </div>
        )}

        {stats.years.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-center font-serif text-base font-semibold">{t("trips_per_year")}</h3>
            <div className="mt-3 space-y-2">
              {stats.years.map((row) => {
                const vacPct = (row.vacation / stats.maxYear) * 100;
                const bizPct = (row.business / stats.maxYear) * 100;
                const dayPct = (row.daytrip / stats.maxYear) * 100;
                return (
                  <div key={row.y} className="flex items-center gap-3 text-sm">
                    <span className="w-12 tabular-nums text-muted-foreground">{row.y}</span>
                    <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-emerald-500" style={{ width: `${vacPct}%` }} title={`${row.vacation} ${t("vacation")}`} />
                      <div className="h-full bg-slate-600" style={{ width: `${bizPct}%` }} title={`${row.business} ${t("business")}`} />
                      <div className="h-full bg-amber-500" style={{ width: `${dayPct}%` }} title={`${row.daytrip} ${t("daytrip")}`} />
                    </div>
                    <span className="w-8 text-right tabular-nums">{row.total}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {transportAgg.vehicleCounts.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center justify-center gap-2">
              <RouteIcon className="h-4 w-4 text-primary" />
              <h3 className="font-serif text-base font-semibold">{t("transport_stats")}</h3>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {transportAgg.vehicleCounts.map((v) => {
                const Icon = MODE_ICON[v.mode] ?? RouteIcon;
                const color = MODE_COLOR[v.mode];
                const km = kmByMode[v.mode];
                return (
                  <div key={v.mode} className="flex flex-col items-center rounded-2xl border border-border bg-secondary/30 p-4 text-center">
                    <Icon className="h-4 w-4" style={color ? { color } : undefined} />
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t(MODE_LABEL_KEY[v.mode] ?? v.mode)}</p>
                    <p className="mt-0.5 font-serif text-xl font-semibold tabular-nums">{v.count}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {km !== undefined && km > 0 ? `${km.toLocaleString(lang)} km` : (kmResolving ? "…" : "—")}
                    </p>
                  </div>
                );
              })}
            </div>

            {transportAgg.topLines.length > 0 && (
              <div className="mt-4">
                <p className="text-center text-xs font-medium text-muted-foreground">{t("most_used_line")}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {transportAgg.topLines.map((r) => {
                    const Icon = MODE_ICON[r.mode] ?? RouteIcon;
                    const color = MODE_COLOR[r.mode];
                    return (
                      <li key={r.mode} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} />
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{t(MODE_LABEL_KEY[r.mode] ?? r.mode)}</span>
                          <span className="truncate font-medium">
                            {r.name}
                            {r.city && <span className="ml-1 text-muted-foreground">({r.city})</span>}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">{r.count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {transportAgg.topRoutes.length > 0 && (
              <div className="mt-4">
                <p className="text-center text-xs font-medium text-muted-foreground">{t("most_used_route")}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {transportAgg.topRoutes.map((r) => {
                    const Icon = MODE_ICON[r.mode] ?? RouteIcon;
                    const color = MODE_COLOR[r.mode];
                    return (
                      <li key={r.mode} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} />
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{t(MODE_LABEL_KEY[r.mode] ?? r.mode)}</span>
                          <span className="truncate font-medium">{r.a} ↔ {r.b}</span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">{r.count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {transportAgg.topStations.length > 0 && (
              <div className="mt-4">
                <p className="text-center text-xs font-medium text-muted-foreground">{t("most_used_station")}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {transportAgg.topStations.map((r) => {
                    const Icon = MODE_ICON[r.mode] ?? RouteIcon;
                    const color = MODE_COLOR[r.mode];
                    return (
                      <li key={r.mode} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Icon className="h-3.5 w-3.5 shrink-0" style={color ? { color } : undefined} />
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.mode === "plane" ? t("mode_plane") : t(MODE_LABEL_KEY[r.mode] ?? r.mode)}
                          </span>
                          <span className="truncate font-medium">
                            {r.name}
                            {r.city && <span className="ml-1 text-muted-foreground">({r.city})</span>}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums font-medium">{r.count}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function PieChart({ business, vacation, daytrip }: { business: number; vacation: number; daytrip: number }) {
  const total = business + vacation + daytrip;
  if (total === 0) return null;
  const r = 38; const c = 2 * Math.PI * r;
  const vacLen = (vacation / total) * c; const bizLen = (business / total) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(245 158 11)" strokeWidth="20" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(71 85 105)" strokeWidth="20" strokeDasharray={`${vacLen + bizLen} ${c}`} />
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(16 185 129)" strokeWidth="20" strokeDasharray={`${vacLen} ${c}`} />
    </svg>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// One corner of the farthest-points compass — cardinal letter (universal,
// language-independent), flag, localized city + country name. `title` (the
// translated "northernmost"/"southernmost"/etc.) is used as a tooltip so the
// compact badge still stays accessible/understandable.
function CompassChip({
  dir, title, point, lang,
}: { dir: string; title: string; point: ExtremePoint; lang: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-0.5 text-center" title={title}>
      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">{dir}</span>
      <span className="text-lg leading-none">{flagOf(point.country)}</span>
      <span className="w-full truncate text-xs font-medium leading-tight">
        {cityNameLocalized(point.name, lang)}
      </span>
      <span className="w-full truncate text-[10px] leading-tight text-muted-foreground">
        {countryNameLocalized(point.country, lang)}
      </span>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: Array<{ key: string; left: React.ReactNode; count: number }> }) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h3 className="text-center font-serif text-base font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.slice(0, 12).map((r) => {
          const pct = (r.count / max) * 100;
          return (
            <li key={r.key} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{r.left}</span>
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums font-medium">{r.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
