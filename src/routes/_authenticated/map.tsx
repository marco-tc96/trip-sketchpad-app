import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe2, Pin, PinOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { listTrips } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { WorldMap, type WorldMapCity } from "@/components/app/world-map";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
const WISHLIST_SENTINEL = "2099-01-01";

type CityObj = { name: string; country: string; lat?: number; lng?: number };
function getCities(trip: Trip): CityObj[] {
  const raw = (trip as unknown as { cities?: unknown }).cities;
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c): CityObj => ({
      name: String(c.name ?? ""),
      country: String(c.country ?? ""),
      lat: typeof c.lat === "number" ? c.lat : undefined,
      lng: typeof c.lng === "number" ? c.lng : undefined,
    }))
    .filter((c) => c.name.length > 0);
}

function MapPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";

  const fn = useServerFn(listTrips);
  const profileFn = useServerFn(getProfile);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const today = new Date().toISOString().slice(0, 10);
  const trips = q.data ?? [];
  const homeCountry =
    (profileQ.data as { home_country?: string | null } | undefined)?.home_country ?? null;

  const wishlistTrips = useMemo(
    () => trips.filter((tr) => tr.start_date >= WISHLIST_SENTINEL),
    [trips],
  );
  const realTrips = useMemo(
    () => trips.filter((tr) => tr.start_date < WISHLIST_SENTINEL),
    [trips],
  );

  const past = useMemo(
    () => realTrips.filter((tr) => tr.end_date < today),
    [realTrips, today],
  );
  const ongoing = useMemo(
    () => realTrips.filter((tr) => tr.start_date <= today && tr.end_date >= today),
    [realTrips, today],
  );
  const planned = useMemo(
    () => realTrips.filter((tr) => tr.start_date > today),
    [realTrips, today],
  );

  // ── Visited countries ────────────────────────────────────────────────────
  const visitedCountries = useMemo(() => {
    const set = new Set<string>();
    for (const tr of past) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, [past]);

  const visitedCities = useMemo<WorldMapCity[]>(() => {
    const seen = new Set<string>();
    const out: WorldMapCity[] = [];
    for (const tr of past) {
      for (const c of getCities(tr)) {
        const key = `${c.country}|${c.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [past]);

  // ── Ongoing overlays ────────────────────────────────────────────────────
  const ongoingCountries = useMemo(() => {
    const visited = new Set(visitedCountries.map((c) => c.toUpperCase()));
    const set = new Set<string>();
    for (const tr of ongoing) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs))
        cs.forEach((c) => {
          if (!visited.has(c.toUpperCase())) set.add(c);
        });
    }
    return Array.from(set);
  }, [ongoing, visitedCountries]);

  const ongoingCities = useMemo<WorldMapCity[]>(() => {
    const seen = new Set<string>();
    const out: WorldMapCity[] = [];
    for (const tr of ongoing) {
      for (const c of getCities(tr)) {
        const key = `${c.country}|${c.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [ongoing]);

  // ── Planned overlays ────────────────────────────────────────────────────
  const plannedCountries = useMemo(() => {
    const visited = new Set(visitedCountries.map((c) => c.toUpperCase()));
    const ongoingISOs = new Set(ongoingCountries.map((c) => c.toUpperCase()));
    const set = new Set<string>();
    for (const tr of planned) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs))
        cs.forEach((c) => {
          const u = c.toUpperCase();
          if (!visited.has(u) && !ongoingISOs.has(u)) set.add(c);
        });
    }
    return Array.from(set);
  }, [planned, visitedCountries, ongoingCountries]);

  const plannedCities = useMemo<WorldMapCity[]>(() => {
    const seen = new Set<string>();
    const out: WorldMapCity[] = [];
    for (const tr of planned) {
      for (const c of getCities(tr)) {
        const key = `${c.country}|${c.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [planned]);

  // ── Wishlist overlays ────────────────────────────────────────────────────
  const wishlistCountries = useMemo(() => {
    const set = new Set<string>();
    for (const tr of wishlistTrips) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, [wishlistTrips]);

  const wishlistCities = useMemo<WorldMapCity[]>(() => {
    const seen = new Set<string>();
    const out: WorldMapCity[] = [];
    for (const tr of wishlistTrips) {
      for (const c of getCities(tr)) {
        const key = `${c.country}|${c.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [wishlistTrips]);

  // ── Map settings (shared with homepage via localStorage) ─────────────────
  const [showPins, setShowPins] = useState(() => {
    try {
      return localStorage.getItem("map_showPins") !== "false";
    } catch {
      return true;
    }
  });
  const [showSubdivisions, setShowSubdivisions] = useState(() => {
    try {
      return localStorage.getItem("map_showSubdivisions") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("map_showPins", String(showPins));
    } catch {
      /* ignore */
    }
  }, [showPins]);
  useEffect(() => {
    try {
      localStorage.setItem("map_showSubdivisions", String(showSubdivisions));
    } catch {
      /* ignore */
    }
  }, [showSubdivisions]);

  return (
    <main className="flex h-[100svh] flex-col">
      {/* Header bar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur">
        <Globe2 className="h-4 w-4 text-primary" />
        <h1 className="text-sm font-semibold">{t("map")}</h1>
        <span className="text-xs text-muted-foreground/60">
          · {visitedCountries.length} {t("countries")}
        </span>

        <div className="ml-auto flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            {showPins ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{t("show_pins")}</span>
            <Switch checked={showPins} onCheckedChange={setShowPins} />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{t("show_subdivisions")}</span>
            <Switch checked={showSubdivisions} onCheckedChange={setShowSubdivisions} />
          </label>
        </div>
      </div>

      {/* Full-screen map */}
      <div className="flex-1 overflow-hidden pb-20">
        {q.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          </div>
        ) : (
          <WorldMap
            visitedCountries={visitedCountries}
            cities={visitedCities}
            ongoingCountries={ongoingCountries}
            ongoingCities={ongoingCities}
            plannedCountries={plannedCountries}
            plannedCities={plannedCities}
            wishlistCountries={wishlistCountries}
            wishlistCities={wishlistCities}
            homeCountry={homeCountry}
            showPins={showPins}
            showSubdivisions={showSubdivisions}
            lang={lang}
            className="h-full w-full"
          />
        )}
      </div>
    </main>
  );
}
