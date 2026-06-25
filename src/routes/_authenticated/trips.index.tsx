import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, MapPin, Calendar } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listTrips } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/trips/")({
  component: TripsList,
});

function TripsList() {
  const { t } = useTranslation();
  const fn = useServerFn(listTrips);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });

  const today = new Date().toISOString().slice(0, 10);
  const trips = q.data ?? [];
  const planned = trips.filter((tr) => tr.start_date > today);
  const ongoing = trips.filter((tr) => tr.start_date <= today && tr.end_date >= today);
  const past = trips.filter((tr) => tr.end_date < today);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            {t("trips")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("start_planning")}</p>
        </div>
        <Button asChild className="rounded-full shrink-0">
          <Link to="/trips/new"><Plus className="mr-1.5 h-4 w-4" />{t("new_trip")}</Link>
        </Button>
      </div>

      {q.isLoading ? (
        <p className="mt-10 text-sm text-muted-foreground">{t("loading")}</p>
      ) : trips.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-10 space-y-10">
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
        <Link to="/trips/new"><Plus className="mr-1.5 h-4 w-4" />{t("new_trip")}</Link>
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
  trips: Awaited<ReturnType<typeof listTrips>>;
  accent: "primary" | "accent" | "muted";
}) {
  const dotClass =
    accent === "primary" ? "bg-primary" : accent === "accent" ? "bg-accent" : "bg-muted-foreground/40";
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((tr) => <TripCard key={tr.id} trip={tr} />)}
      </div>
    </section>
  );
}

function TripCard({ trip }: { trip: Awaited<ReturnType<typeof listTrips>>[number] }) {
  const nights = Math.max(
    1,
    Math.round(
      (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) /
        86400000,
    ),
  );
  return (
    <Link
      to="/trips/$tripId"
      params={{ tripId: trip.id }}
      className="group flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl">{trip.cover_emoji ?? "✈️"}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-secondary-foreground">
          {trip.local_currency}
        </span>
      </div>
      <div>
        <h3 className="font-serif text-xl font-semibold leading-tight tracking-tight">
          {trip.title}
        </h3>
        {trip.destination && (
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {trip.destination}
            {trip.country ? `, ${trip.country}` : ""}
          </p>
        )}
      </div>
      <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {fmt(trip.start_date)} → {fmt(trip.end_date)}
        </span>
        <span>· {nights}n</span>
      </div>
    </Link>
  );
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}