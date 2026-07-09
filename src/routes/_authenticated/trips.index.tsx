import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Calendar, Briefcase, Palmtree, Footprints, Globe2, Pin, PinOff, Cloud, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { listTrips, getTodayInboundItems } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { flagOf, cityNameLocalized } from "@/lib/country-data";
import { CityCover } from "@/components/app/city-cover";
import { flagGradient } from "@/lib/flag-gradient";
import { supabase } from "@/integrations/supabase/client";
import { WorldMap, type WorldMapCity } from "@/components/app/world-map";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/trips/")({
  component: TripsList,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
type TripAccent = "ongoing" | "planned" | "past" | "wishlist";

/**
 * Converts a naive local-time ISO string to UTC milliseconds
 * given the UTC+ offset in minutes of the source timezone.
 */
function naiveLocalToUtcMs(naiveDateStr: string, utcPlusMinutes: number): number {
  return new Date(naiveDateStr).getTime() - utcPlusMinutes * 60_000;
}

function TripsList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const fn = useServerFn(listTrips);
  const inboundFn = useServerFn(getTodayInboundItems);
  const profileFn = useServerFn(getProfile);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });
  const inboundQ = useQuery({ queryKey: ["today-inbound"], queryFn: () => inboundFn() });
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const homeCountry = (profileQ.data as { home_country?: string | null } | undefined)?.home_country ?? null;

  const today = new Date().toISOString().slice(0, 10);
  // User's UTC+ offset in minutes (e.g. +120 for UTC+2)
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const trips = q.data ?? [];

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Map of trip_id → inbound end_at for trips ending today
  const todayInboundMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of inboundQ.data ?? []) {
      map.set(item.trip_id, item.end_at);
    }
    return map;
  }, [inboundQ.data]);

  /**
   * A trip is "concluded" (past) if:
   * - end_date < today, OR
   * - end_date === today AND the inbound (return) flight's end_at has passed
   *   (if no inbound item is stored, keep as ongoing until midnight)
   */
  const isConcluded = useMemo(() => (tr: Trip): boolean => {
    if (tr.end_date < today) return true;
    if (tr.end_date > today) return false;
    // end_date === today: check return flight
    if (!todayInboundMap.has(tr.id)) return false; // no inbound item → stays ongoing
    const endAt = todayInboundMap.get(tr.id);
    if (!endAt) return false; // inbound item exists but end_at is null
    const inboundUtcMs = naiveLocalToUtcMs(endAt, utcOffsetMinutes);
    return inboundUtcMs <= Date.now();
  }, [today, todayInboundMap, utcOffsetMinutes]);

  // Wishlist trips are identified by sentinel start_date "2099-01-01"
  const WISHLIST_SENTINEL = "2099-01-01";
  const wishlistTrips = useMemo(
    () => trips.filter((tr) => tr.start_date >= WISHLIST_SENTINEL),
    [trips],
  );
  const realTrips = useMemo(
    () => trips.filter((tr) => tr.start_date < WISHLIST_SENTINEL),
    [trips],
  );

  const ongoing = useMemo(
    () => realTrips.filter((tr) => tr.start_date <= today && !isConcluded(tr)).sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [realTrips, today, isConcluded],
  );
  const planned = useMemo(
    () => realTrips.filter((tr) => tr.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [realTrips, today],
  );
  const past = useMemo(
    () => realTrips.filter((tr) => isConcluded(tr)).sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [realTrips, isConcluded],
  );

  // Map data — past = orange, ongoing = yellow, planned = gray, wishlist = blue dashed
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

  const ongoingCountries = useMemo(() => {
    const visited = new Set(visitedCountries.map((c) => c.toUpperCase()));
    const set = new Set<string>();
    for (const tr of ongoing) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => { if (!visited.has(c.toUpperCase())) set.add(c); });
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

  const plannedCountries = useMemo(() => {
    const visited = new Set(visitedCountries.map((c) => c.toUpperCase()));
    const ongoingISOs = new Set(ongoingCountries.map((c) => c.toUpperCase()));
    const set = new Set<string>();
    for (const tr of planned) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => {
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

  const [showPins, setShowPins] = useState(() => {
    try { return localStorage.getItem("map_showPins") !== "false"; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem("map_showPins", String(showPins)); } catch { /* ignore */ }
  }, [showPins]);

  const allTripsCount = trips.length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* ── Page title ── */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl font-bold">{t("trips")}</h1>
        </div>
      </div>

      {!q.isLoading && allTripsCount > 0 && (
        <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
            <Globe2 className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("countries_visited")}</h2>
            <span className="text-xs text-muted-foreground/70">· {visitedCountries.length}</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              {showPins ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t("show_pins")}</span>
              <Switch checked={showPins} onCheckedChange={setShowPins} />
            </label>
          </div>
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
            showSubdivisions={false}
            lang={lang}
            className="h-[280px] w-full sm:h-[360px]"
          />
        </section>
      )}

      {q.isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("loading")}</p>
      ) : allTripsCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          {ongoing.length > 0 && <Section title={t("ongoing")} trips={ongoing} accent="ongoing" />}
          {planned.length > 0 && <Section title={t("planned")} trips={planned} accent="planned" />}
          {past.length > 0 && <Section title={t("past")} trips={past} accent="past" withYearSelector />}
          {wishlistTrips.length > 0 && <Section title={t("wishlist")} trips={wishlistTrips} accent="wishlist" />}
        </div>
      )}
    </main>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="mt-16 grid place-items-center rounded-3xl border border-dashed border-border p-12 text-center">
      <p className="text-sm text-muted-foreground">{t("no_trips")}</p>
      <div className="mt-4 flex gap-3">
        <Link
          to="/trips/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
        >
          {t("new_trip")}
        </Link>
        <Link
          to="/trips/new"
          search={{ wishlist: true } as never}
          className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.6_0.13_255)] px-4 py-2 text-sm font-medium text-[oklch(0.45_0.13_255)] transition hover:bg-[oklch(0.97_0.02_255)]"
        >
          <Cloud className="h-4 w-4" />
          {t("wishlist")}
        </Link>
      </div>
    </div>
  );
}

// Color per accent type matching map colors
const ACCENT_COLORS: Record<TripAccent, string> = {
  ongoing:  "oklch(0.78 0.16 85)",
  planned:  "oklch(0.65 0 0)",
  past:     "oklch(0.55 0.14 38)",
  wishlist: "oklch(0.55 0.13 255)",
};
const ACCENT_LIGHT: Record<TripAccent, string> = {
  ongoing:  "oklch(0.95 0.04 85)",
  planned:  "oklch(0.95 0 0)",
  past:     "oklch(0.95 0.03 38)",
  wishlist: "oklch(0.95 0.02 255)",
};

function Section({
  title,
  trips,
  accent,
  withYearSelector = false,
}: {
  title: string;
  trips: Trip[];
  accent: TripAccent;
  withYearSelector?: boolean;
}) {
  const { t } = useTranslation();
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const years = useMemo(() => {
    const ys = new Set(trips.map((tr) => tr.start_date.slice(0, 4)));
    return [...ys].sort().reverse();
  }, [trips]);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!withYearSelector || selectedYear === "all") return trips;
    return trips.filter((tr) => tr.start_date.startsWith(selectedYear));
  }, [trips, withYearSelector, selectedYear]);

  useEffect(() => { setIdx(0); setDragX(0); }, [selectedYear]);

  useEffect(() => {
    dotRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [idx]);

  const dotColor = ACCENT_COLORS[accent];
  const dotLightColor = ACCENT_LIGHT[accent];

  function go(dir: number) {
    setIdx((i) => Math.max(0, Math.min(filtered.length - 1, i + dir)));
  }

  // Native touchmove listener (passive:false) to block vertical scroll
  // during horizontal carousel swipes on mobile.
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      // Only block scroll once the gesture is clearly horizontal (>5 px and dx dominates)
      if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
      }
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []); // carouselRef is stable after mount

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
    setDragX(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const atStart = idx === 0 && dx > 0;
    const atEnd = idx === filtered.length - 1 && dx < 0;
    setDragX(atStart || atEnd ? dx * 0.18 : dx);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    setDragging(false);
    setDragX(0);
    if (dx < -60 && idx < filtered.length - 1) go(1);
    else if (dx > 60 && idx > 0) go(-1);
    touchStartX.current = null;
  }

  const PEEK_VW = 22;

  return (
    <section>
      {/* Header row */}
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground sm:text-left">
          {title}
        </h2>
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: dotColor }}
        >
          {filtered.length}
        </span>
        {withYearSelector && years.length > 1 && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="ml-auto cursor-pointer rounded-full border border-border bg-transparent px-2.5 py-0.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">{t("all_years")}</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      {/* ─── Mobile carousel ─── */}
      <div className="sm:hidden">
        {filtered.length === 0 ? null : filtered.length === 1 ? (
          <div className="flex justify-center">
            <TripCard trip={filtered[0]} carousel />
          </div>
        ) : (
          <>
            <div
              ref={carouselRef}
              className="-mx-4 relative overflow-hidden"
              style={{ height: "clamp(280px, calc(72vw * 16 / 9), 480px)" }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {(() => {
                // Compute drag fraction once for all cards:
                // peekPx = pixels between adjacent cards (PEEK_VW % of container width)
                const peekPx = (PEEK_VW / 100) * (carouselRef.current?.offsetWidth ?? 400);
                // dragFrac [-1,1]: how far through one full card-width we've dragged
                const dragFrac = dragging ? Math.max(-1, Math.min(1, dragX / peekPx)) : 0;

                return filtered.map((tr, i) => {
                  const offset = i - idx;
                  if (Math.abs(offset) > 1) return null;

                  // Effective fractional position: interpolates during drag so
                  // rotation/scale/brightness all animate smoothly while swiping
                  const eff = offset + dragFrac;

                  const isCurrent = offset === 0;
                  const rotate    = eff * 5;                                     // ±5deg max (was 8)
                  const scale     = Math.max(0.84, 1 - Math.abs(eff) * 0.16);   // 0.84 min (was 0.80)
                  const brightness = Math.max(0.55, 1 - Math.abs(eff) * 0.45);  // 0.55 min (was 0.48)
                  const translateVw = offset * PEEK_VW;

                  return (
                    <div
                      key={tr.id}
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: `translate(calc(-50% + ${translateVw}vw + ${dragging ? dragX : 0}px), -50%) rotate(${rotate}deg) scale(${scale})`,
                        zIndex: isCurrent ? 10 : 5,
                        filter: brightness < 1 ? `brightness(${brightness})` : undefined,
                        // expo-out easing → starts fast, decelerates naturally
                        transition: dragging
                          ? "none"
                          : "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease",
                        transformOrigin: "center center",
                        willChange: "transform",
                        pointerEvents: isCurrent ? "auto" : "none",
                      }}
                    >
                      <TripCard trip={tr} carousel />
                    </div>
                  );
                });
              })()}
            </div>

            {/* Emoji / flag dots */}
            <div
              ref={dotsRef}
              className="mt-4 flex items-center gap-2 overflow-x-auto px-4 py-2"
              style={{ scrollbarWidth: "none" }}
            >
              <div className="flex items-center gap-2 mx-auto">
                {filtered.map((tr, i) => {
                  const emoji = (tr as unknown as { cover_emoji?: string | null }).cover_emoji;
                  const countries = (tr as unknown as { countries?: string[] }).countries ?? [];
                  const dot = emoji || (countries.length > 0 ? flagOf(countries[0]) : "✈️");
                  const isActive = i === idx;
                  return (
                    <button
                      key={tr.id}
                      ref={(el) => { dotRefs.current[i] = el; }}
                      onClick={() => setIdx(i)}
                      style={isActive ? {
                        backgroundColor: dotLightColor,
                        boxShadow: `0 0 0 2px ${dotLightColor}, 0 0 0 4px ${dotColor}`,
                      } : {}}
                      className={`flex shrink-0 items-center justify-center rounded-full text-base transition-all duration-300 ${
                        isActive
                          ? "h-10 w-10 scale-110 shadow-sm"
                          : "h-8 w-8 bg-muted/40 opacity-45 hover:opacity-75 hover:scale-105"
                      }`}
                    >
                      {dot}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── Desktop grid ─── */}
      <div className="hidden sm:grid sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
        {filtered.map((tr) => (
          <TripCard key={tr.id} trip={tr} />
        ))}
      </div>
    </section>
  );
}

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

function TripCard({ trip, carousel = false }: { trip: Trip; carousel?: boolean }) {
  const { i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const cities = getCities(trip);
  const countries: string[] = Array.isArray((trip as unknown as { countries?: string[] }).countries)
    ? (trip as unknown as { countries: string[] }).countries : [];
  const storedCover = (trip as unknown as { cover_url?: string | null }).cover_url ?? null;
  const isWishlist = trip.start_date >= "2099-01-01";
  const tripType = (isWishlist ? "wishlist" : ((trip as unknown as { trip_type?: string }).trip_type ?? "vacation")) as "vacation" | "business" | "daytrip" | "wishlist";
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSigned(null);
    if (storedCover && !/^https?:\/\//i.test(storedCover)) {
      supabase.storage.from("trip-covers").createSignedUrl(storedCover, 60 * 60).then(({ data }) => {
        if (!cancelled) setSigned(data?.signedUrl ?? null);
      });
    }
    return () => { cancelled = true; };
  }, [storedCover]);
  const inlineSrc = storedCover && /^https?:\/\//i.test(storedCover) ? storedCover : signed;
  const coverType = (trip as unknown as { cover_type?: string }).cover_type ?? "auto";
  const coverBg = (trip as unknown as { cover_bg?: string | null }).cover_bg ?? null;
  const gradient = coverType === "color" && coverBg ? coverBg : flagGradient(countries);
  const flagStr = countries.length > 0 ? countries.slice(0, 4).map(flagOf).join(" ") : "";

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className={`group relative flex aspect-[9/16] shrink-0 flex-col justify-end overflow-hidden rounded-2xl border border-border shadow-soft transition hover:-translate-y-1 hover:shadow-xl ${
        carousel ? "w-[72vw] max-w-[260px]" : "w-[58vw] max-w-[240px] sm:w-auto sm:max-w-none"
      }`}
    >
      <CityCover src={inlineSrc} gradient={gradient} eager={carousel} className="transition duration-700 group-hover:scale-[1.06]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <TripTypePill tripType={tripType} />
      </div>
      {flagStr && (
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-sm leading-none backdrop-blur">{flagStr}</div>
      )}
      <div className="relative z-10 flex flex-col gap-1.5 p-4 text-white">
        <h3 className="font-serif text-lg font-semibold leading-tight tracking-tight line-clamp-2">
          {trip.cover_emoji ? <span className="mr-1.5">{trip.cover_emoji}</span> : null}
          {trip.title}
        </h3>
        {(cities.length > 0 || trip.destination) && (
          <p className="flex items-start gap-1 text-[13px] text-white/90">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{cities.length > 0 ? cities.map((c) => cityNameLocalized(c.name, lang)).join(" · ") : trip.destination}</span>
          </p>
        )}
        {!isWishlist && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/75">
            <Calendar className="h-3 w-3" />
            {fmt(trip.start_date)} → {fmt(trip.end_date)}
          </div>
        )}
      </div>
    </Link>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}

function TripTypePill({ tripType }: { tripType: "vacation" | "business" | "daytrip" | "wishlist" }) {
  const { t } = useTranslation();
  if (tripType === "wishlist") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-700/70 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
        <Cloud className="h-3 w-3" />{t("wishlist")}
      </span>
    );
  }
  const cfg = tripType === "business" ? { bg: "bg-slate-800/70", Icon: Briefcase }
    : tripType === "daytrip" ? { bg: "bg-amber-700/70", Icon: Footprints }
    : { bg: "bg-emerald-700/70", Icon: Palmtree };
  const Icon = cfg.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur ${cfg.bg}`}>
      <Icon className="h-3 w-3" />{t(tripType)}
    </span>
  );
}
