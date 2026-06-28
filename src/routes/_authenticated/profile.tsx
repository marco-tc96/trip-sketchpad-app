import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3, Globe2, MapPin, CalendarDays, Briefcase, Palmtree, Footprints,
  Settings as SettingsIcon,
} from "lucide-react";
import { getProfile } from "@/lib/profile.functions";
import { listTrips } from "@/lib/trips.functions";
import { flagOf, countryNameLocalized } from "@/lib/country-data";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
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

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const profFn = useServerFn(getProfile);
  const tripsFn = useServerFn(listTrips);
  const prof = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => tripsFn() });

  // ---- Stats ----
  const stats = useMemo(() => {
    const all = trips.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const past = all.filter((tr) => tr.end_date < today);
    const countrySet = new Set<string>();
    const cityKey = new Set<string>();
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, { name: string; country: string; count: number }>();
    let nights = 0;
    let business = 0;
    let vacation = 0;
    let daytrip = 0;
    const byYear: Record<string, { business: number; vacation: number; daytrip: number }> = {};
    for (const tr of past) {
      const cs = (tr as unknown as { countries?: string[] }).countries ?? [];
      cs.forEach((c) => {
        countrySet.add(c);
        countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
      });
      getCities(tr).forEach((c) => {
        cityKey.add(`${c.country}|${c.name}`);
        const k = `${c.country}|${c.name}`;
        const cur = cityCounts.get(k);
        if (cur) cur.count += 1;
        else cityCounts.set(k, { name: c.name, country: c.country, count: 1 });
      });
      nights += Math.max(
        1,
        Math.round(
          (new Date(tr.end_date).getTime() - new Date(tr.start_date).getTime()) / 86400000,
        ),
      );
      const rawType = (tr as unknown as { trip_type?: string }).trip_type;
      const ttype: "business" | "daytrip" | "vacation" =
        rawType === "business" ? "business" : rawType === "daytrip" ? "daytrip" : "vacation";
      if (ttype === "business") business += 1;
      else if (ttype === "daytrip") daytrip += 1;
      else vacation += 1;
      const y = tr.start_date.slice(0, 4);
      byYear[y] = byYear[y] ?? { business: 0, vacation: 0, daytrip: 0 };
      byYear[y][ttype] += 1;
    }
    const years = Object.entries(byYear)
      .map(([y, v]) => ({ y, ...v, total: v.business + v.vacation + v.daytrip }))
      .sort((a, b) => b.y.localeCompare(a.y));
    const countriesRanked = [...countryCounts.entries()]
      .map(([iso, count]) => ({ iso, count }))
      .sort((a, b) => b.count - a.count || a.iso.localeCompare(b.iso));
    const citiesRanked = [...cityCounts.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
    return {
      past,
      countries: [...countrySet].sort(),
      countriesRanked,
      citiesRanked,
      cityCount: cityKey.size,
      nights,
      business,
      vacation,
      daytrip,
      years,
      maxYear: Math.max(1, ...years.map((v) => v.total)),
    };
  }, [trips.data]);

  const lang = i18n.language || "it";
  const homeCountry = (prof.data as { home_country?: string | null } | undefined)?.home_country ?? null;
  const displayName = prof.data?.display_name || user?.email?.split("@")[0] || "—";
  const username = user?.email ? `@${user.email.split("@")[0]}` : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Profile header: name, username, country, then settings button */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-2xl font-bold tracking-tight sm:text-3xl">
            {displayName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {username && <span>{username}</span>}
            {homeCountry && (
              <span className="inline-flex items-center gap-1">
                {username && <span className="opacity-50">·</span>}
                <span>{flagOf(homeCountry)}</span>
                <span>{countryNameLocalized(homeCountry, lang)}</span>
              </span>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 shrink-0">
          <Link to="/settings">
            <SettingsIcon className="h-3.5 w-3.5" />
            {t("edit_settings")}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <section className="mt-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">{t("stats")}</h2>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <Stat icon={Globe2} label={t("countries")} value={stats.countries.length} />
          <Stat icon={MapPin} label={t("cities")} value={stats.cityCount} />
          <Stat icon={CalendarDays} label={t("nights")} value={stats.nights} />
          <Stat icon={BarChart3} label={t("trips")} value={stats.past.length} />
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="font-serif text-base font-semibold">{t("countries_visited")}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.countries.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("no_trips")}</p>
            )}
            {stats.countries.map((iso) => (
              <span
                key={iso}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                <span>{flagOf(iso)}</span>
                <span>{countryNameLocalized(iso, lang)}</span>
              </span>
            ))}
          </div>
        </div>

        {stats.countriesRanked.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <RankList
              title={t("most_visited_countries")}
              rows={stats.countriesRanked.map((r) => ({
                key: r.iso,
                left: <><span>{flagOf(r.iso)}</span><span>{countryNameLocalized(r.iso, lang)}</span></>,
                count: r.count,
              }))}
            />
            <RankList
              title={t("most_visited_cities")}
              rows={stats.citiesRanked.map((r) => ({
                key: `${r.country}|${r.name}`,
                left: <><span>{flagOf(r.country)}</span><span>{r.name}</span></>,
                count: r.count,
              }))}
            />
          </div>
        )}

        {(stats.business + stats.vacation + stats.daytrip) > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-serif text-base font-semibold">Lavoro vs vacanza</h3>
            <div className="mt-3 flex items-center gap-5">
              <PieChart business={stats.business} vacation={stats.vacation} daytrip={stats.daytrip} />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
                  <Palmtree className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="tabular-nums font-medium">{stats.vacation}</span>
                  <span className="text-muted-foreground">{t("vacation")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-slate-600" />
                  <Briefcase className="h-3.5 w-3.5 text-slate-700" />
                  <span className="tabular-nums font-medium">{stats.business}</span>
                  <span className="text-muted-foreground">{t("business")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-amber-500" />
                  <Footprints className="h-3.5 w-3.5 text-amber-600" />
                  <span className="tabular-nums font-medium">{stats.daytrip}</span>
                  <span className="text-muted-foreground">{t("daytrip")}</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {stats.years.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-serif text-base font-semibold">{t("trips_per_year")}</h3>
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
      </section>
    </main>
  );
}

function PieChart({ business, vacation, daytrip }: { business: number; vacation: number; daytrip: number }) {
  const total = business + vacation + daytrip;
  if (total === 0) return null;
  const r = 38;
  const c = 2 * Math.PI * r;
  const vacLen = (vacation / total) * c;
  const bizLen = (business / total) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      {/* base: amber for daytrip */}
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(245 158 11)" strokeWidth="20" />
      {/* business arc */}
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke="rgb(71 85 105)"
        strokeWidth="20"
        strokeDasharray={`${vacLen + bizLen} ${c}`}
      />
      {/* vacation arc on top */}
      <circle
        cx="50" cy="50" r={r}
        fill="none"
        stroke="rgb(16 185 129)"
        strokeWidth="20"
        strokeDasharray={`${vacLen} ${c}`}
      />
    </svg>
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

function RankList({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; left: React.ReactNode; count: number }>;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h3 className="font-serif text-base font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.slice(0, 12).map((r) => {
          const pct = (r.count / max) * 100;
          return (
            <li key={r.key} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                {r.left}
              </span>
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