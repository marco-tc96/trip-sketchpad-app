import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, MapPin, Calendar, Briefcase, Palmtree, Footprints, Globe2, Pin, PinOff, Map as MapIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { listTrips } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";
import { flagOf } from "@/lib/country-data";
import { CityCover } from "@/components/app/city-cover";
import { flagGradient } from "@/lib/flag-gradient";
import { supabase } from "@/integrations/supabase/client";
import { WorldMap, type WorldMapCity } from "@/components/app/world-map";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/trips/")({
  component: TripsList,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];

function TripsList() {
  const { t } = useTranslation();
  const fn = useServerFn(listTrips);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });

  const today = new Date().toISOString().slice(0, 10);
  const trips = q.data ?? [];
  const ongoing = useMemo(
    () =>
      trips
        .filter((tr) => tr.start_date <= today && tr.end_date >= today)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [trips, today],
  );
  const planned = useMemo(
    () =>
      trips
        .filter((tr) => tr.start_date > today)
        .sort((a, b) => a.start_date.localeCompare(a.start_date)),
    [trips, today],
  );
  const past = useMemo(
    () =>
      trips
        .filter((tr) => tr.end_date < today)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [trips, today],
  );

  // The map's solid "visited" fill reflects places actually been to, not
  // future plans — built from ongoing + past trips only, same rule as the
  // "countries visited" stats on the profile page.
  const visitedTrips = useMemo(() => [...ongoing, ...past], [ongoing, past]);
  const visitedCountries = useMemo(() => {
    const set = new Set<string>();
    for (const tr of visitedTrips) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) cs.forEach((c) => set.add(c));
    }
    return Array.from(set);
  }, [visitedTrips]);
  const visitedCities = useMemo<WorldMapCity[]>(() => {
    const seen = new Set<string>();
    const out: WorldMapCity[] = [];
    for (const tr of visitedTrips) {
      for (const c of getCities(tr)) {
        const key = `${c.country}|${c.name.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(c);
      }
    }
    return out;
  }, [visitedTrips]);

  // Countries/cities that only show up in planned (future) trips — these
  // get the lighter "upcoming" hatched treatment on the map and a
  // visually distinct pin, instead of being silently invisible until the
  // trip actually happens.
  const plannedCountries = useMemo(() => {
    const visited = new Set(visitedCountries.map((c) => c.toUpperCase()));
    const set = new Set<string>();
    for (const tr of planned) {
      const cs = (tr as unknown as { countries?: string[] }).countries;
      if (Array.isArray(cs)) {
        cs.forEach((c) => {
          if (!visited.has(c.toUpperCase())) set.add(c);
        });
      }
    }
    return Array.from(set);
  }, [planned, visitedCountries]);
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

  // Pin visibility toggle, surfaced as a switch in the map card header.
  const [showPins, setShowPins] = useState(true);
  const [showSubdivisions, setShowSubdivisions] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            {t("trips")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("start_planning")}</p>
        </div>
        <Button asChild className="rounded-full shrink-0">
          <Link to="/trips/new">
            <Plus className="mr-1.5 h-4 w-4" />
            {t("new_trip")}
          </Link>
        </Button>
      </div>

      {!q.isLoading && trips.length > 0 && (
        <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Globe2 className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("countries_visited")}
            </h2>
            <span className="text-xs text-muted-foreground/70">
              · {visitedCountries.length}
            </span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("show_subdivisions")}</span>
              <Switch checked={showSubdivisions} onCheckedChange={setShowSubdivisions} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {showPins ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t("show_pins")}</span>
              <Switch checked={showPins} onCheckedChange={setShowPins} />
            </label>
          </div>
          <WorldMap
            visitedCountries={visitedCountries}
            cities={visitedCities}
            plannedCountries={plannedCountries}
            plannedCities={plannedCities}
            showPins={showPins}
            showSubdivisions={showSubdivisions}
            className="h-[280px] w-full sm:h-[360px]"
          />
        </section>
      )}

      {q.isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("loading")}</p>
      ) : trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          {ongoing.length > 0 && <Section title={t("ongoing")} trips={ongoing} accent="primary" />}
          {planned.length > 0 && <Section title={t("planned")} trips={planned} accent="accent" />}
          {past.length > 0 && <Section title={t("past")} trips={past} accent="muted" />}
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
      <Button asChild className="mt-4 rounded-full">
        <Link to="/trips/new">
          <Plus className="mr-1.5 h-4 w-4" />
          {t("new_trip")}
        </Link>
      </Button>
    </div>
  );
}

function Section({
  title,
  trips,
  accent,
}: {
  title: string;
  trips: Trip[];
  accent: "primary" | "accent" | "muted";
}) {
  const dotClass =
    accent === "primary"
      ? "bg-primary"
      : accent === "accent"
        ? "bg-accent"
        : "bg-muted-foreground/40";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground/70">· {trips.length}</span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {trips.map((tr) => (
          <TripCard key={tr.id} trip={tr} />
        ))}
      </div>
    </section>
  );
}

type CityObj = { name: string; country: string };

function getCities(trip: Trip): CityObj[] {
  const raw = (trip as unknown as { cities?: unknown }).cities;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is CityObj =>
      !!c && typeof c === "object" && typeof (c as CityObj).name === "string",
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const cities = getCities(trip);
  const countries: string[] = Array.isArray((trip as unknown as { countries?: string[] }).countries)
    ? ((trip as unknown as { countries: string[] }).countries)
    : [];
  const storedCover = (trip as unknown as { cover_url?: string | null }).cover_url ?? null;
  const tripType = ((trip as unknown as { trip_type?: string }).trip_type ?? "vacation") as
    | "vacation"
    | "business"
    | "daytrip";
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSigned(null);
    if (storedCover && !/^https?:\/\//i.test(storedCover)) {
      supabase.storage
        .from("trip-covers")
        .createSignedUrl(storedCover, 60 * 60)
        .then(({ data }) => {
          if (!cancelled) setSigned(data?.signedUrl ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [storedCover]);
  const inlineSrc =
    storedCover && /^https?:\/\//i.test(storedCover) ? storedCover : signed;
  const coverType = (trip as unknown as { cover_type?: string }).cover_type ?? "auto";
  const coverBg =
    (trip as unknown as { cover_bg?: string | null }).cover_bg ?? null;
  const gradient =
    coverType === "color" && coverBg ? coverBg : flagGradient(countries);

  const flagStr =
    countries.length > 0
      ? countries.slice(0, 4).map(flagOf).join(" ")
      : "";

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className="group relative flex aspect-[9/16] w-[58vw] max-w-[240px] shrink-0 snap-start flex-col justify-end overflow-hidden rounded-2xl border border-border shadow-soft transition hover:-translate-y-1 hover:shadow-xl sm:w-auto sm:max-w-none"
    >
      <CityCover
        src={inlineSrc}
        gradient={gradient}
        className="transition duration-700 group-hover:scale-[1.06]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <TripTypePill tripType={tripType} />
      </div>
      {flagStr && (
        <div className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-sm leading-none backdrop-blur">
          {flagStr}
        </div>
      )}
      <div className="relative z-10 flex flex-col gap-1.5 p-4 text-white">
        <h3 className="font-serif text-lg font-semibold leading-tight tracking-tight line-clamp-2">
          {trip.cover_emoji ? <span className="mr-1.5">{trip.cover_emoji}</span> : null}
          {trip.title}
        </h3>
        {(cities.length > 0 || trip.destination) && (
          <p className="flex items-center gap-1 text-[13px] text-white/90 line-clamp-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {cities.length > 0
              ? cities.slice(0, 3).map((c) => c.name).join(" · ")
              : trip.destination}
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-white/75">
          <Calendar className="h-3 w-3" />
          {fmt(trip.start_date)} → {fmt(trip.end_date)}
        </div>
      </div>
    </Link>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}

function TripTypePill({ tripType }: { tripType: "vacation" | "business" | "daytrip" }) {
  const { t } = useTranslation();
  const cfg =
    tripType === "business"
      ? { bg: "bg-slate-800/70", Icon: Briefcase }
      : tripType === "daytrip"
        ? { bg: "bg-amber-700/70", Icon: Footprints }
        : { bg: "bg-emerald-700/70", Icon: Palmtree };
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur ${cfg.bg}`}
    >
      <Icon className="h-3 w-3" />
      {t(tripType)}
    </span>
  );
}
