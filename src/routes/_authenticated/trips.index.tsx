import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, MapPin, Calendar, Briefcase, Palmtree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { listTrips } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";
import { flagOf } from "@/lib/country-data";
import { CityCover } from "@/components/app/city-cover";
import { flagGradient } from "@/lib/flag-gradient";
import { supabase } from "@/integrations/supabase/client";

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
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [trips, today],
  );
  const past = useMemo(
    () =>
      trips
        .filter((tr) => tr.end_date < today)
        .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    [trips, today],
  );

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
  const tripType = ((trip as unknown as { trip_type?: string }).trip_type ?? "vacation") as "vacation" | "business";
  const [signed, setSigned] = useState<string | null>(null);
  // Whenever the user uploaded a photo, show it on the home card too —
  // regardless of the trip's internal cover_type selection.
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
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur ${
            tripType === "business" ? "bg-slate-800/70" : "bg-emerald-700/70"
          }`}
        >
          {tripType === "business" ? <Briefcase className="h-3 w-3" /> : <Palmtree className="h-3 w-3" />}
          {tripType === "business" ? "Lavoro" : "Vacanza"}
        </span>
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