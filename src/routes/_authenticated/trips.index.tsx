import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Calendar, Briefcase, Palmtree, Footprints, Cloud, Compass, Globe2, ChevronDown, Plus } from "lucide-react";
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

// Darken an oklch() colour by scaling its lightness — used for the record ring.
function darkenOklch(c: string, f = 0.62): string {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
  if (!m) return c;
  const L = Math.max(0, parseFloat(m[1]) * f);
  return `oklch(${L.toFixed(3)} ${m[2]} ${m[3]})`;
}

// ── Stat ring (Apple Activity Rings style) ──────────────────────────────────
// Outer (lighter) ring = this year's value. Inner (darker) ring = the best single
// year on record for the same metric, with that record value + year shown below.
function StatRing({
  label,
  value,
  max,
  color,
  recordValue,
  recordYear,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  recordValue?: number;
  recordYear?: number;
}) {
  const dark = darkenOklch(color);
  const Ro = 40, Ri = 28, sw = 8;
  const circO = 2 * Math.PI * Ro, circI = 2 * Math.PI * Ri;
  const pctO = max > 0 ? Math.min(value / max, 1) : 0;
  const pctR = max > 0 ? Math.min((recordValue ?? 0) / max, 1) : 0;
  const hasRecord = typeof recordValue === "number" && !!recordYear;
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <div className="relative h-20 w-20">
        <svg width="80" height="80" viewBox="0 0 100 100">
          {/* Tracks */}
          <circle cx="50" cy="50" r={Ro} fill="none" strokeWidth={sw} className="stroke-muted/30" />
          <circle cx="50" cy="50" r={Ri} fill="none" strokeWidth={sw} className="stroke-muted/20" />
          {/* Record ring (inner, darker) */}
          {hasRecord && (
            <circle
              cx="50" cy="50" r={Ri}
              fill="none"
              stroke={dark}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={`${circI} ${circI}`}
              strokeDashoffset={circI * (1 - pctR)}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
            />
          )}
          {/* This-year ring (outer, lighter) */}
          <circle
            cx="50" cy="50" r={Ro}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${circO} ${circO}`}
            strokeDashoffset={circO * (1 - pctO)}
            transform="rotate(-90 50 50)"
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
          <span className="text-[10px] leading-tight text-muted-foreground">/{max}</span>
        </div>
      </div>
      <p className="text-center text-xs font-medium leading-tight">{label}</p>
      {hasRecord && (
        <p className="text-center text-[10px] font-semibold leading-tight tabular-nums" style={{ color: dark }}>
          {recordValue} · {recordYear}
        </p>
      )}
    </div>
  );
}

// ── Trip hero card ───────────────────────────────────────────────────────────
// Shared hero presentation for the "next trip" (orange countdown to departure)
// and, when one is underway, the "ongoing trip" (yellow countdown to its end) —
// stacked with the ongoing one on top, so it's never buried below the stats.
function TripHeroCard({ trip, variant }: { trip: Trip; variant: "ongoing" | "next" }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? "en";
  const isOngoing = variant === "ongoing";

  const todayMs = new Date().setHours(0, 0, 0, 0);
  const refMs = new Date(isOngoing ? trip.end_date : trip.start_date).setHours(0, 0, 0, 0);
  const daysLeft = Math.round((refMs - todayMs) / 86400000);

  const countries: string[] = Array.isArray(
    (trip as unknown as { countries?: string[] }).countries,
  )
    ? (trip as unknown as { countries: string[] }).countries
    : [];
  const flagStr =
    countries.length > 0 ? countries.map(flagOf).join(" ") : "✈️";
  const cities = getCities(trip);
  const gradient = flagGradient(countries);
  const coverEmoji = (trip as unknown as { cover_emoji?: string | null }).cover_emoji;

  const badgeLabel = isOngoing
    ? (daysLeft <= 0 ? t("last_day") : daysLeft === 1 ? t("day_to_end", { n: 1 }) : t("days_to_end", { n: daysLeft }))
    : (daysLeft <= 0 ? fmt(trip.start_date, lang) : daysLeft === 1 ? t("day_to_departure", { n: 1 }) : t("days_to_departure", { n: daysLeft }));

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className="group block overflow-hidden rounded-3xl shadow-md ring-1 ring-border/60 transition hover:shadow-lg"
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
          {fmtRange(trip.start_date, trip.end_date, lang)}
        </span>
        <span
          className={
            isOngoing
              ? "rounded-full bg-amber-400/15 px-3 py-0.5 text-xs font-bold text-amber-500 dark:text-amber-300"
              : "rounded-full bg-primary/10 px-3 py-0.5 text-xs font-bold text-primary"
          }
        >
          {badgeLabel}
        </span>
      </div>
    </Link>
  );
}

// Empty state shown only when there's neither an ongoing nor a next trip.
function EmptyHeroCard() {
  const { t } = useTranslation();
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

  // ── Scroll restoration on mount ──────────────────────────────────────────
  // Cold app start (first time this route mounts since the app was loaded)
  // always opens at the top, never on the historic-trips section — every time
  // this route mounts (cold start OR coming back to the Viaggi tab), regardless
  // of where the page was scrolled to before navigating away.
  useLayoutEffect(() => {
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    sessionStorage.removeItem("trips-scroll");
    window.scrollTo(0, 0);
    return () => { history.scrollRestoration = prev; };
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
  // The most recently-started ongoing trip is featured as a hero card above the
  // stats (see render below) instead of buried in the "Ongoing" list — the list
  // below only shows any OTHER ongoing trips, if more than one is underway.
  const primaryOngoing = ongoing[0] ?? null;
  const ongoingRest = useMemo(
    () => ongoing.filter((tr) => tr.id !== primaryOngoing?.id),
    [ongoing, primaryOngoing],
  );
  const planned = useMemo(
    () => realTrips.filter((tr) => tr.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [realTrips, today],
  );
  const past = useMemo(
    () => realTrips.filter((tr) => isConcluded(tr)).sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [realTrips, isConcluded],
  );

  // Favorites: stored on the trip row (DB) so they sync across devices.
  const favoriteTrips = useMemo(
    () => trips.filter((tr) => (tr as unknown as { favorite?: boolean }).favorite),
    [trips],
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

  // ── Stats: best single year on record (inner ring) ──────────────────────────
  const yearStats = useMemo(() => {
    const map = new Map<number, { countries: Set<string>; cities: Set<string>; days: Set<string> }>();
    const ensure = (y: number) => {
      let s = map.get(y);
      if (!s) { s = { countries: new Set(), cities: new Set(), days: new Set() }; map.set(y, s); }
      return s;
    };
    for (const tr of [...past, ...ongoing]) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      const startY = parseInt(tr.start_date.slice(0, 4), 10);
      const endY = parseInt(tr.end_date.slice(0, 4), 10);
      for (let y = startY; y <= endY; y++) {
        const s = ensure(y);
        if (Array.isArray(cs)) cs.forEach((c) => s.countries.add(c));
        for (const c of getCities(tr)) s.cities.add(`${c.country}|${c.name.toLowerCase()}`);
      }
      const end = tr.end_date < today ? tr.end_date : today;
      if (tr.start_date > end) continue;
      for (let d = new Date(tr.start_date); d <= new Date(end); d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        ensure(parseInt(iso.slice(0, 4), 10)).days.add(iso);
      }
    }
    return map;
  }, [past, ongoing, today]);

  const records = useMemo(() => {
    const best = { countries: { year: 0, val: 0 }, cities: { year: 0, val: 0 }, days: { year: 0, val: 0 } };
    for (const [y, s] of yearStats) {
      if (s.countries.size > best.countries.val) best.countries = { year: y, val: s.countries.size };
      if (s.cities.size > best.cities.val) best.cities = { year: y, val: s.cities.size };
      if (s.days.size > best.days.val) best.days = { year: y, val: s.days.size };
    }
    return best;
  }, [yearStats]);

  const allTripsCount = trips.length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl font-bold">{t("trips")}</h1>
        </div>
        <Link
          to="/trips/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("new_trip")}</span>
        </Link>
      </div>

      {/* ── Countdown + stats: always visible once loaded, regardless of favorites ── */}
      {!q.isLoading && (
        <div className="mt-6 space-y-4">
          {/* While a trip is ongoing, it's the ONLY hero shown — the next trip
              reappears on its own the day after the ongoing one ends. */}
          {primaryOngoing ? (
            <TripHeroCard trip={primaryOngoing} variant="ongoing" />
          ) : planned[0] ? (
            <TripHeroCard trip={planned[0]} variant="next" />
          ) : (
            <EmptyHeroCard />
          )}

          {/* Year stats rings — show only when there are real trips */}
          {allTripsCount > 0 && (
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
                  max={Math.max(visitedCountries.length, countriesThisYear, records.countries.val, 1)}
                  color="oklch(0.62 0.22 25)"
                  recordValue={records.countries.val || undefined}
                  recordYear={records.countries.year || undefined}
                />
                <StatRing
                  label={t("cities")}
                  value={citiesThisYear}
                  max={Math.max(totalCities, citiesThisYear, records.cities.val, 1)}
                  color="oklch(0.7 0.18 95)"
                  recordValue={records.cities.val || undefined}
                  recordYear={records.cities.year || undefined}
                />
                <StatRing
                  label={t("days_traveled")}
                  value={daysThisYear}
                  max={Math.max(dayOfYear, daysThisYear, records.days.val, 1)}
                  color="oklch(0.62 0.16 255)"
                  recordValue={records.days.val || undefined}
                  recordYear={records.days.year || undefined}
                />
              </div>
            </section>
          )}
        </div>
      )}

      {q.isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("loading")}</p>
      ) : allTripsCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          {ongoingRest.length > 0 && (
            <Section title={t("ongoing")} trips={ongoingRest} accent="ongoing" />
          )}
          {planned.length > 0 && (
            <CompactSection title={t("planned")} trips={planned} accentColor={ACCENT_COLORS.planned} />
          )}
          {past.length > 0 && (
            <Section title={t("past")} trips={past} accent="past" withYearSelector />
          )}
          {favoriteTrips.length > 0 && (
            <CompactSection title={t("favorites")} trips={favoriteTrips} accentColor={ACCENT_COLORS.favorites} />
          )}
          {wishlistTrips.length > 0 && (
            <CompactSection title={t("wishlist")} trips={wishlistTrips} accentColor={ACCENT_COLORS.wishlist} />
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
  const gridRef = useRef<HTMLDivElement>(null);
  const [expandedPast, setExpandedPast] = useState(false);
  const [gridLayout, setGridLayout] = useState<{ cols: number; rowH: number; gap: number }>({ cols: 4, rowH: 0, gap: 12 });

  const years = useMemo(() => {
    const ys = new Set(trips.map((tr) => tr.start_date.slice(0, 4)));
    return [...ys].sort().reverse();
  }, [trips]);
  const [selectedYear, setSelectedYear] = useState<string>("all");

  const filtered = useMemo(() => {
    if (!withYearSelector || selectedYear === "all") return trips;
    return trips.filter((tr) => tr.start_date.startsWith(selectedYear));
  }, [trips, withYearSelector, selectedYear]);

  useEffect(() => { setIdx(0); setDragX(0); setExpandedPast(false); }, [selectedYear]);

  // Measure the desktop grid so we can cap the past-trips list to 3 rows.
  // Column count and card height are responsive, so we read them from the DOM
  // and recompute on resize.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      if (!el.children.length) return;
      const style = getComputedStyle(el);
      const cols = style.gridTemplateColumns.split(" ").filter((s) => s && s !== "none").length || 1;
      const gap = parseFloat(style.rowGap) || 0;
      const rowH = (el.children[0] as HTMLElement).offsetHeight;
      setGridLayout((prev) =>
        prev.cols === cols && prev.rowH === rowH && prev.gap === gap ? prev : { cols, rowH, gap },
      );
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [filtered.length]);

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
      {(() => {
        // Only the "all years" past view collapses to 3 rows; a selected year
        // shows every trip as before. Mobile (carousel above) is unaffected.
        const collapsible = withYearSelector && selectedYear === "all";
        const rows = 3;
        const canCollapse = collapsible && gridLayout.rowH > 0 && filtered.length > gridLayout.cols * rows;
        const isCollapsed = canCollapse && !expandedPast;
        const maxHeight = gridLayout.rowH * rows + gridLayout.gap * rows + Math.round(gridLayout.rowH * 0.3);
        const hiddenCount = filtered.length - gridLayout.cols * rows;
        return (
          <div className="relative hidden sm:block">
            <div
              ref={gridRef}
              className="grid grid-cols-3 gap-3 lg:grid-cols-4"
              style={isCollapsed ? { maxHeight, overflow: "hidden" } : undefined}
            >
              {filtered.map((tr) => (
                <TripCard key={tr.id} trip={tr} />
              ))}
            </div>
            {isCollapsed && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-56 items-end justify-center bg-gradient-to-b from-transparent to-background">
                <button
                  type="button"
                  onClick={() => setExpandedPast(true)}
                  className="pointer-events-auto mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground shadow-soft transition hover:bg-muted"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  {t("show_more", { count: hiddenCount })}
                </button>
              </div>
            )}
          </div>
        );
      })()}
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

// ── Compact section (vertical list of compact cards) ────────────────────
// Shared by Favorites, Planned (prossimi viaggi) and Wishlist.
function CompactSection({
  title,
  trips,
  accentColor,
}: {
  title: string;
  trips: Trip[];
  accentColor: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: accentColor }}
        >
          {trips.length}
        </span>
      </div>
      {/* Vertical list — no horizontal scroll */}
      <div className="flex flex-col gap-3">
        {trips.map((trip) => (
          <CompactTripCard key={trip.id} trip={trip} />
        ))}
      </div>
    </section>
  );
}

// ── Compact trip card (square thumbnail left, all info to the right) ─────
function CompactTripCard({ trip }: { trip: Trip }) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language ?? "en";

  const countries: string[] = Array.isArray((trip as unknown as { countries?: string[] }).countries)
    ? (trip as unknown as { countries: string[] }).countries : [];
  const storedCover = (trip as unknown as { cover_url?: string | null }).cover_url ?? null;
  const coverType = (trip as unknown as { cover_type?: string }).cover_type ?? "auto";
  const coverBg = (trip as unknown as { cover_bg?: string | null }).cover_bg ?? null;
  const gradient = coverType === "color" && coverBg ? coverBg : flagGradient(countries);
  const flagStr = countries.length > 0 ? countries.map(flagOf).join(" ") : "✈️";
  const isWishlist = trip.start_date >= "2099-01-01";
  const cities = getCities(trip);
  const coverEmoji = (trip as unknown as { cover_emoji?: string | null }).cover_emoji;

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
      className="relative flex min-h-[96px] items-center overflow-hidden rounded-2xl bg-card ring-1 ring-border/50 shadow-sm transition hover:shadow-md hover:ring-border"
    >
      {/* Trip photo as the background of the card — bleeds from the left edge
          across, then fades into the base card colour so the text stays readable */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-28 sm:w-36">
        <CityCover src={inlineSrc} gradient={gradient} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-card" />
      </div>

      {/* Info — sits on the solid side of the card, clear of the photo */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-0.5 pt-3 pb-8 pl-[7.5rem] pr-3 sm:pl-[9.5rem]">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {coverEmoji ? <span className="mr-1">{coverEmoji}</span> : null}
          {trip.title}
        </p>
        {cities.length > 0 && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            <MapPin className="mr-0.5 inline h-3.5 w-3.5" />
            {cities.map((c) => cityNameLocalized(c.name, lang)).join(" · ")}
          </p>
        )}
        {!isWishlist && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/70">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            {fmtRange(trip.start_date, trip.end_date, lang)}
          </p>
        )}
      </div>

      {/* Flag(s) inside a pill — bottom-right corner, like the historic trip cards */}
      {flagStr && (
        <div className="absolute bottom-2 right-2 z-20 rounded-full bg-black/45 px-2 py-0.5 text-sm leading-none text-white backdrop-blur">
          {flagStr}
        </div>
      )}
    </Link>
  );
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
  const flagStr = countries.length > 0 ? countries.map(flagOf).join(" ") : "";

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
            {fmtRange(trip.start_date, trip.end_date, lang)}
          </div>
        )}
      </div>
    </Link>
  );
}

function fmt(d: string, lang?: string) {
  return new Date(d).toLocaleDateString(lang, { day: "2-digit", month: "short", year: "numeric" });
}

// Same month+year → compact to "24-27 set 2026" instead of "24 set 2026 →
// 27 set 2026", so the pill takes up less room; four-digit year throughout.
function fmtRange(start: string, end: string, lang?: string): string {
  const s = new Date(start);
  const e = new Date(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    const d1 = s.toLocaleDateString(lang, { day: "2-digit" });
    const d2 = e.toLocaleDateString(lang, { day: "2-digit" });
    const my = e.toLocaleDateString(lang, { month: "short", year: "numeric" });
    return `${d1}-${d2} ${my}`;
  }
  return `${fmt(start, lang)} → ${fmt(end, lang)}`;
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
