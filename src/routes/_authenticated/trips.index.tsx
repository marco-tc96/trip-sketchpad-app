import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, MapPin, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { listTrips } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";
import { coverPhotoFor, flagOf, hashSeed } from "@/lib/country-data";

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  const nights = Math.max(
    1,
    Math.round(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        86400000,
    ),
  );
  const cities = getCities(trip);
  const countries: string[] = Array.isArray((trip as unknown as { countries?: string[] }).countries)
    ? ((trip as unknown as { countries: string[] }).countries)
    : [];
  const coverQuery =
    cities[0]?.name || trip.destination || countries[0] || trip.country || "travel";
  const photo =
    (trip as unknown as { cover_url?: string | null }).cover_url ??
    coverPhotoFor(coverQuery, hashSeed(trip.id));

  const flagStr =
    countries.length > 0
      ? countries.slice(0, 4).map(flagOf).join(" ")
      : "";

  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className="group relative flex h-44 flex-col justify-end overflow-hidden rounded-2xl border border-border shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <img
        src={photo}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="absolute inset-0 bg-card-overlay" />
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5">
        {flagStr && (
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-sm leading-none backdrop-blur">
            {flagStr}
          </span>
        )}
        <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
          {trip.local_currency}
        </span>
      </div>
      <div className="relative z-10 flex flex-col gap-1 p-3.5 text-white">
        <h3 className="font-serif text-base font-semibold leading-tight tracking-tight line-clamp-1">
          {trip.cover_emoji ? <span className="mr-1.5">{trip.cover_emoji}</span> : null}
          {trip.title}
        </h3>
        {(cities.length > 0 || trip.destination) && (
          <p className="flex items-center gap-1 text-[12px] text-white/85 line-clamp-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {cities.length > 0
              ? cities.slice(0, 3).map((c) => c.name).join(" · ")
              : trip.destination}
          </p>
        )}
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-white/80">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {fmt(trip.start_date)} → {fmt(trip.end_date)}
          </span>
          <span>· {nights}n</span>
        </div>
      </div>
    </Link>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}