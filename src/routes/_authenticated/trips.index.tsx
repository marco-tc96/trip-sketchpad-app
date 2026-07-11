import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Calendar, Briefcase, Palmtree, Footprints, Cloud, Compass, Globe2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { listTrips, getTodayInboundItems } from "@/lib/trips.functions";
import { flagOf, cityNameLocalized } from "@/lib/country-data";
import { CityCover } from "@/components/app/city-cover";
import { flagGradient } from "@/lib/flag-gradient";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/trips/")({
  component: TripsList,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
type TripAccent = "ongoing" | "planned" | "past" | "wishlist" | "favorites";

function naiveLocalToUtcMs(naiveDateStr: string, utcPlusMinutes: number): number {
  return new Date(naiveDateStr).getTime() - utcPlusMinutes * 60_000;
}

// ── Stat ring (Apple Activity Rings style) ──────────────────────────────────
function StatRing({
  label,
  value,
  max,
  sublabel,
  color,
}: {
  label: string;
  value: number;
  max: number;
  sublabel?: string;
  color: string;
}) {
  const R = 36;
  const circ = 2 * Math.PI * R;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circ * (1 - pct);
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative h-20 w-20">
        <svg width="80" height="80" viewBox="0 0 100 100">
          {/* Track */}
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            strokeWidth="11"
            className="stroke-muted/30"
          />
          {/* Progress */}
          <circle
            cx="50" cy="50" r={R}
            fill="none"
            stroke={color}
            strokeWidth="11"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={offset}
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">/{max}</span>
        </div>
      </div>
      <p className="text-center text-xs font-medium leading-tight">{label}</p>
      {sublabel && (
        <p className="text-center text-[10px] leading-tight text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

// ── Countdown card ──────────────────────────────────────────────────────────
function CountdownCard({
  nextPlanned,
  nextOngoing,
}: {
  nextPlanned: Trip | null;
  nextOngoing: Trip | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";

  const trip = nextPlanned ?? nextOngoing;

  if (!trip) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border bg-card p-6 text-center">
        <Globe2 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{t("no_upcoming_trips")}</p>
        <Link
          to="/trips/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
        >
          {t("new_trip")}
        </Link>
      </div>
    );
  }

  const isOngoing = !nextPlanned && !!nextOngoing;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const startMs = new Date(trip.start_date).setHours(0, 0, 0, 0);
  const daysLeft = Math.round((startMs - todayMs) / 86400000);

  const countries: string[] = Array.isArray(
    (trip as unknown as { countries?: string[] }).countries,
  )
    ? (trip as unknown as { countries: string[] }).countries
    : [];
  const flagStr =
    countries.length > 0 ? countries.slice(0, 4).map(flagOf).join(" ") : "✈️";
  const cities = getCities(trip);
  const gradient = flagGradient(countries);
  const coverEmoji = (trip as unknown as { cover_emoji?: string | null }).cover_emoji;

  const countdownLabel =
    isOngoing
      ? null
      : daysLeft <= 0
        ? fmt(trip.start_date)
        : daysLeft === 1
          ? t("day_to_departure", { n: 1 })
          : t("days_to_departure", { n: daysLeft });

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className="group overflow-hidden rounded-3xl shadow-soft ring-1 ring-border/40 transition hover:shadow-md"
    >
      {/* Gradient hero */}
      <div className="relative p-5" style={{ background: gradient }}>
        <div className="absolute inset-0 bg-black/25" />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-white/70">
              {isOngoing ? t("ongoing") : t("next_trip")}
            </p>
            <h2 className="font-serif text-xl font-bold leading-tight text-white line-clamp-2">
              {coverEmoji ? <span className="mr-1">{coverEmoji}</span> : null}
              {trip.title}
            </h2>
          </div>
          <span className="shrink-0 text-3xl leading-none">{flagStr}</span>
        </div>
        {cities.length > 0 && (
          <p className="relative z-10 mt-2 flex items-center gap-1 text-[13px] text-white/85">
            <MapPin className="h-3 w-3 shrink-0" />
            {cities.map((c) => cityNameLocalized(c.name, lang)).join(" · ")}
          </p>
        )}
      </div>

      {/* Countdown strip */}
      <div className="flex items-center justify-between bg-card px-5 py-3">
        <span className="text-xs text-muted-foreground">
          {fmt(trip.start_date)} → {isOngoing ? "…" : fmt(trip.end_date)}
        </span>
        {isOngoing ? (
          <span className="rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
            {t("ongoing")}
          </span>
        ) : countdownLabel ? (
          <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary">
            {countdownLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function TripsList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const fn = useServerFn(listTrips);
  const inboundFn = useServerFn(getTodayInboundItems);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });
  const inboundQ = useQuery({ queryKey: ["today-inbound"], queryFn: () => inboundFn() });

  const today = new Date().toISOString().slice(0, 10);
  const utcOffsetMinutes = -new Date().getTimezoneOffset();
  const trips = q.data ?? [];

  // ── Current year stats ───────────────────────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearStr = String(currentYear);
  const jan1Ms = new Date(currentYear, 0, 1).getTime();
  const dayOfYear = Math.floor((Date.now() - jan1Ms) / 86400000) + 1;

  // ── Scroll-to-top on mount ────────────────────────────────────────────────
  useLayoutEffect(() => {
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => { history.scrollRestoration = prev; };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    const mountTime = Date.now();
    function guard() {
      if (Date.now() - mountTime < 800 && window.scrollY > 50) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }
    window.addEventListener("scroll", guard);
    return () => window.removeEventListener("scroll", guard);
  }, []);

  // Inject View Transitions CSS once per session
  useEffect(() => {
    if (document.getElementById("vt-trips-style")) return;
    const s = document.createElement("style");
    s.id = "vt-trips-style";
    s.textContent = [
      "::view-transition-group(*){animation-duration:560ms;animation-timing-function:cubic-bezier(0.22,1.45,0.36,1)}",
      "::view-transition-image-pair(*){isolation:isolate}",
      "::view-transition-old(root){animation:vt-fade-out 300ms ease forwards}",
      "::view-transition-new(root){animation:vt-fade-in 300ms ease forwards}",
      "[data-vt-dir='back']::view-transition-group(*){animation-duration:380ms;animation-timing-function:cubic-bezier(0.4,0,0.2,1)}",
      "[data-vt-dir='back']::view-transition-old(root){animation:vt-fade-out 220ms ease forwards}",
      "[data-vt-dir='back']::view-transition-new(root){animation:vt-fade-in 220ms ease forwards}",
      "@keyframes vt-fade-out{from{opacity:1}to{opacity:0}}",
      "@keyframes vt-fade-in{from{opacity:0}to{opacity:1}}",
    ].join("");
    document.head.appendChild(s);
  }, []);

  // ── Favorites (localStorage) ─────────────────────────────────────────────
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("trip_favorites");
      return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const todayInboundMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const item of inboundQ.data ?? []) map.set(item.trip_id, item.end_at);
    return map;
  }, [inboundQ.data]);

  const isConcluded = useMemo(() => (tr: Trip): boolean => {
    if (tr.end_date < today) return true;
    if (tr.end_date > today) return false;
    if (!todayInboundMap.has(tr.id)) return false;
    const endAt = todayInboundMap.get(tr.id);
    if (!endAt) return false;
    return naiveLocalToUtcMs(endAt, utcOffsetMinutes) <= Date.now();
  }, [today, todayInboundMap, utcOffsetMinutes]);

  const WISHLIST_SENTINEL = "2099-01-01";
  const wishlistTrips = useMemo(() => trips.filter((tr) => tr.start_date >= WISHLIST_SENTINEL), [trips]);
  const realTrips = useMemo(() => trips.filter((tr) => tr.start_date < WISHLIST_SENTINEL), [trips]);

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

  // Favorites: include any trip that is favorited
  const favoriteTrips = useMemo(
    () => trips.filter((tr) => favorites.has(tr.id)),
    [trips, favorites],
  );

  // ── Stats: total (all-time past trips) ───────────────────────────────────
  const visitedCountries = useMemo(() => {
    const set = new Set<string>();
    for (const tr of past) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, [past]);

  const totalCities = useMemo(() => {
    const seen = new Set<string>();
    for (const tr of past) {
      for (const c of getCities(tr)) {
        seen.add(`${c.country}|${c.name.toLowerCase()}`);
      }
    }
    return seen.size;
  }, [past]);

  // ── Stats: this year ─────────────────────────────────────────────────────
  const countriesThisYear = useMemo(() => {
    const set = new Set<string>();
    for (const tr of [...past, ...ongoing]) {
      if (tr.end_date >= `${yearStr}-01-01` && tr.start_date <= `${yearStr}-12-31`) {
        const cs = (tr as unknown as { countries?: string[] }).countries;
        if (Array.isArray(cs)) cs.forEach((c) => set.add(c));
      }
    }
    return set.size;
  }, [past, ongoing, yearStr]);

  const citiesThisYear = useMemo(() => {
    const seen = new Set<string>();
    for (const tr of [...past, ...ongoing]) {
      if (tr.end_date >= `${yearStr}-01-01` && tr.start_date <= `${yearStr}-12-31`) {
        for (const c of getCities(tr)) {
          seen.add(`${c.country}|${c.name.toLowerCase()}`);
        }
      }
    }
    return seen.size;
  }, [past, ongoing, yearStr]);

  const daysThisYear = useMemo(() => {
    const days = new Set<string>();
    const nowIso = new Date().toISOString().slice(0, 10);
    for (const tr of [...past, ...ongoing]) {
      const tripStart = tr.start_date > `${yearStr}-01-01` ? tr.start_date : `${yearStr}-01-01`;
      const tripEnd = tr.end_date < nowIso ? tr.end_date : nowIso;
      if (tripEnd < `${yearStr}-01-01` || tripStart > `${yearStr}-12-31`) continue;
      const start = new Date(tripStart);
      const end = new Date(tripEnd);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso.startsWith(yearStr)) days.add(iso);
      }
    }
    return days.size;
  }, [past, ongoing, yearStr]);

  const allTripsCount = trips.length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl font-bold">{t("trips")}</h1>
        </div>
      </div>

      {!q.isLoading && allTripsCount > 0 && (
        <div className="mt-6 space-y-4">
          {/* Countdown to next trip */}
          <CountdownCard
            nextPlanned={planned[0] ?? null}
            nextOngoing={ongoing[0] ?? null}
          />

          {/* Year stats rings */}
          <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="border-b border-border/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t("stats_year", { year: currentYear })}
              </p>
            </div>
            <div className="flex items-start justify-around gap-2 p-5">
              <StatRing
                label={t("countries")}
                value={countriesThisYear}
                max={Math.max(visitedCountries.length, countriesThisYear, 1)}
                color="oklch(0.62 0.22 25)"
              />
              <StatRing
                label={t("cities")}
                value={citiesThisYear}
                max={Math.max(totalCities, citiesThisYear, 1)}
                color="oklch(0.7 0.18 95)"
              />
              <StatRing
                label={t("days_traveled")}
                value={daysThisYear}
                max={Math.max(dayOfYear, daysThisYear, 1)}
                color="oklch(0.62 0.16 255)"
              />
            </div>
          </section>
        </div>
      )}

      {q.isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("loading")}</p>
      ) : allTripsCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          {ongoing.length > 0 && (
            <Section title={t("ongoing")} trips={ongoing} accent="ongoing" />
          )}
          {planned.length > 0 && (
            <Section title={t("planned")} trips={planned} accent="planned" />
          )}
          {past.length > 0 && (
            <Section title={t("past")} trips={past} accent="past" withYearSelector />
          )}
          {favoriteTrips.length > 0 && (
            <Section title={t("favorites")} trips={favoriteTrips} accent="favorites" />
          )}
          {wishlistTrips.length > 0 && (
            <Section title={t("wishlist")} trips={wishlistTrips} accent="wishlist" />
          )}
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

const ACCENT_COLORS: Record<TripAccent, string> = {
  favorites: "oklch(0.58 0.22 25)",
  ongoing:   "oklch(0.78 0.16 85)",
  planned:   "oklch(0.65 0 0)",
  past:      "oklch(0.55 0.14 38)",
  wishlist:  "oklch(0.55 0.13 255)",
};
const ACCENT_LIGHT: Record<TripAccent, string> = {
  favorites: "oklch(0.95 0.05 25)",
  ongoing:   "oklch(0.95 0.04 85)",
  planned:   "oklch(0.95 0 0)",
  past:      "oklch(0.95 0.03 38)",
  wishlist:  "oklch(0.95 0.02 255)",
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
  const isFirstDotMount = useRef(true);

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
    if (isFirstDotMount.current) { isFirstDotMount.current = false; return; }
    dotRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [idx]);

  const dotColor = ACCENT_COLORS[accent];
  const dotLightColor = ACCENT_LIGHT[accent];

  function go(dir: number) {
    setIdx((i) => Math.max(0, Math.min(filtered.length - 1, i + dir)));
  }

  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (Math.abs(dx) > 5 && Math.abs(dx) > Math.abs(dy)) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setDragging(true);
    setDragX(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    setDragX(e.touches[0].clientX - touchStartX.current);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const peekPx = (PEEK_VW / 100) * (carouselRef.current?.offsetWidth ?? 400);
    const rawScrollOffset = idx - dx / peekPx;
    const newIdx = Math.max(0, Math.min(filtered.length - 1, Math.round(rawScrollOffset)));
    setIdx(newIdx);
    setDragX(0);
    setDragging(false);
    touchStartX.current = null;
  }

  const PEEK_VW = 22;

  return (
    <section>
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
                const peekPx = (PEEK_VW / 100) * (carouselRef.current?.offsetWidth ?? 400);
                const rawScrollOffset = idx - dragX / peekPx;
                const scrollOffset =
                  rawScrollOffset < 0
                    ? rawScrollOffset * 0.18
                    : rawScrollOffset > filtered.length - 1
                    ? (filtered.length - 1) + (rawScrollOffset - (filtered.length - 1)) * 0.18
                    : rawScrollOffset;

                return filtered.map((tr, i) => {
                  const eff = i - scrollOffset;
                  if (Math.abs(eff) > 2) return null;

                  const rotate     = eff * 5;
                  const scale      = Math.max(0.50, 1 - Math.abs(eff) * 0.22);
                  const brightness = Math.max(0.55, 1 - Math.abs(eff) * 0.45);
                  const translateVw = eff * PEEK_VW;
                  const zIndex =
                    Math.abs(eff) < 0.5 ? 10 :
                    Math.abs(eff) < 1.5 ? 5  : 3;

                  return (
                    <div
                      key={tr.id}
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: `translate(calc(-50% + ${translateVw}vw), -50%) rotate(${rotate}deg) scale(${scale})`,
                        zIndex,
                        filter: brightness < 1 ? `brightness(${brightness})` : undefined,
                        transition: dragging
                          ? "none"
                          : "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), filter 0.4s ease",
                        transformOrigin: "center center",
                        willChange: "transform",
                        pointerEvents: Math.abs(eff) < 0.5 ? "auto" : "none",
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
              <div className="mx-auto flex items-center gap-2">
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

function TripCard({
  trip,
  carousel = false,
}: {
  trip: Trip;
  carousel?: boolean;
}) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
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

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    const doNav = () => { void navigate({ to: "/trips/$tripId", params: { tripId: trip.id } }); };
    if (typeof document.startViewTransition === "function") {
      document.documentElement.dataset.vtDir = "forward";
      const vt = document.startViewTransition(doNav);
      vt.finished.finally(() => { delete document.documentElement.dataset.vtDir; });
    } else {
      doNav();
    }
  }

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      onClick={handleClick}
      style={{ viewTransitionName: `card-${trip.id}` } as React.CSSProperties}
      className={`group relative flex aspect-[9/16] shrink-0 flex-col justify-end overflow-hidden rounded-2xl border border-border shadow-soft transition hover:-translate-y-1 hover:shadow-xl ${
        carousel ? "w-[72vw] max-w-[260px]" : "w-[58vw] max-w-[240px] sm:w-auto sm:max-w-none"
      }`}
    >
      <CityCover src={inlineSrc} gradient={gradient} eager={carousel} className="transition duration-700 group-hover:scale-[1.06]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* Top-left: trip type pill */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <TripTypePill tripType={tripType} />
      </div>

      {/* Top-right: flag */}
      {flagStr && (
        <div className="absolute right-3 top-3 z-20 rounded-full bg-black/45 px-2 py-0.5 text-sm leading-none backdrop-blur">{flagStr}</div>
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
