import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, Globe2, MapPin, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { listTrips } from "@/lib/trips.functions";
import { flagOf, countryByIso } from "@/lib/country-data";

export const Route = createFileRoute("/_authenticated/stats")({
  component: StatsPage,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
type City = { name: string; country: string };

function getCities(t: Trip): City[] {
  const raw = (t as unknown as { cities?: unknown }).cities;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is City => !!c && typeof c === "object" && typeof (c as City).name === "string",
  );
}

function StatsPage() {
  const { t } = useTranslation();
  const fn = useServerFn(listTrips);
  const q = useQuery({ queryKey: ["trips"], queryFn: () => fn() });

  const trips = q.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const past = trips.filter((tr) => tr.end_date < today);

  const countrySet = new Set<string>();
  const cityKey = new Set<string>();
  let nights = 0;

  for (const tr of past) {
    const cs = (tr as unknown as { countries?: string[] }).countries ?? [];
    cs.forEach((c) => countrySet.add(c));
    getCities(tr).forEach((c) => cityKey.add(`${c.country}|${c.name}`));
    nights += Math.max(
      1,
      Math.round(
        (new Date(tr.end_date).getTime() - new Date(tr.start_date).getTime()) / 86400000,
      ),
    );
  }

  const tripsByYear = past.reduce<Record<string, number>>((acc, tr) => {
    const y = tr.start_date.slice(0, 4);
    acc[y] = (acc[y] ?? 0) + 1;
    return acc;
  }, {});
  const years = Object.entries(tripsByYear).sort((a, b) => b[0].localeCompare(a[0]));
  const maxYear = Math.max(1, ...Object.values(tripsByYear));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          {t("stats")}
        </h1>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <Stat icon={Globe2} label={t("countries")} value={countrySet.size} />
        <Stat icon={MapPin} label={t("cities")} value={cityKey.size} />
        <Stat icon={CalendarDays} label={t("nights")} value={nights} />
        <Stat icon={BarChart3} label={t("trips")} value={past.length} />
      </div>

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-serif text-lg font-semibold">{t("countries_visited")}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {countrySet.size === 0 && (
            <p className="text-sm text-muted-foreground">{t("no_trips")}</p>
          )}
          {[...countrySet].sort().map((iso) => (
            <span
              key={iso}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              <span>{flagOf(iso)}</span>
              <span>{countryByIso(iso)?.name ?? iso}</span>
            </span>
          ))}
        </div>
      </section>

      {years.length > 0 && (
        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-serif text-lg font-semibold">{t("trips_per_year")}</h2>
          <div className="mt-3 space-y-2">
            {years.map(([y, n]) => (
              <div key={y} className="flex items-center gap-3 text-sm">
                <span className="w-12 tabular-nums text-muted-foreground">{y}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-warm-gradient"
                    style={{ width: `${(n / maxYear) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function Stat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}