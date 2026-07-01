import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BarChart3, Globe2, MapPin, CalendarDays, Briefcase, Palmtree, Footprints, Settings as SettingsIcon,
} from "lucide-react";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { listTrips } from "@/lib/trips.functions";
import type { Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { flagOf, countryNameLocalized, cityNameLocalized } from "@/lib/country-data";
import { SettingsDialog, type ProfileFormValues } from "@/components/app/settings-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type Trip = Awaited<ReturnType<typeof listTrips>>[number];
type City = { name: string; country: string };

const CONTINENT_BY_ISO: Record<string, string> = {
  IT:"Europe",FR:"Europe",DE:"Europe",ES:"Europe",PT:"Europe",GB:"Europe",NL:"Europe",BE:"Europe",CH:"Europe",AT:"Europe",
  PL:"Europe",SE:"Europe",NO:"Europe",DK:"Europe",FI:"Europe",GR:"Europe",CZ:"Europe",HU:"Europe",RO:"Europe",BG:"Europe",
  HR:"Europe",SK:"Europe",SI:"Europe",LT:"Europe",LV:"Europe",EE:"Europe",LU:"Europe",MT:"Europe",CY:"Europe",IE:"Europe",
  IS:"Europe",AL:"Europe",RS:"Europe",BA:"Europe",ME:"Europe",MK:"Europe",MD:"Europe",BY:"Europe",UA:"Europe",RU:"Europe",
  LI:"Europe",MC:"Europe",SM:"Europe",VA:"Europe",AD:"Europe",XK:"Europe",
  CN:"Asia",JP:"Asia",IN:"Asia",KR:"Asia",TH:"Asia",VN:"Asia",ID:"Asia",MY:"Asia",SG:"Asia",PH:"Asia",
  TW:"Asia",HK:"Asia",MO:"Asia",TR:"Asia",SA:"Asia",AE:"Asia",IL:"Asia",JO:"Asia",LB:"Asia",KW:"Asia",
  QA:"Asia",BH:"Asia",OM:"Asia",IQ:"Asia",IR:"Asia",SY:"Asia",YE:"Asia",AF:"Asia",PK:"Asia",BD:"Asia",
  LK:"Asia",NP:"Asia",BT:"Asia",MM:"Asia",KH:"Asia",LA:"Asia",MN:"Asia",KZ:"Asia",UZ:"Asia",TM:"Asia",
  TJ:"Asia",KG:"Asia",AZ:"Asia",AM:"Asia",GE:"Asia",PS:"Asia",TL:"Asia",
  NG:"Africa",EG:"Africa",ZA:"Africa",KE:"Africa",ET:"Africa",GH:"Africa",TZ:"Africa",MA:"Africa",DZ:"Africa",AO:"Africa",
  CM:"Africa",CI:"Africa",SN:"Africa",MG:"Africa",MZ:"Africa",ZM:"Africa",ZW:"Africa",TN:"Africa",LY:"Africa",SD:"Africa",
  SS:"Africa",UG:"Africa",CD:"Africa",CG:"Africa",GA:"Africa",BF:"Africa",ML:"Africa",NE:"Africa",TD:"Africa",SO:"Africa",
  ER:"Africa",DJ:"Africa",RW:"Africa",BI:"Africa",MW:"Africa",NA:"Africa",BW:"Africa",LS:"Africa",SZ:"Africa",MR:"Africa",
  GM:"Africa",GN:"Africa",SL:"Africa",LR:"Africa",GW:"Africa",BJ:"Africa",TG:"Africa",GQ:"Africa",CF:"Africa",CV:"Africa",
  ST:"Africa",KM:"Africa",MU:"Africa",SC:"Africa",
  US:"North America",CA:"North America",MX:"North America",GT:"North America",BZ:"North America",SV:"North America",
  HN:"North America",NI:"North America",CR:"North America",PA:"North America",CU:"North America",JM:"North America",
  HT:"North America",DO:"North America",TT:"North America",BB:"North America",LC:"North America",VC:"North America",
  GD:"North America",AG:"North America",DM:"North America",KN:"North America",
  BR:"South America",AR:"South America",CL:"South America",CO:"South America",PE:"South America",VE:"South America",
  EC:"South America",BO:"South America",PY:"South America",UY:"South America",GY:"South America",SR:"South America",
  AU:"Oceania",NZ:"Oceania",PG:"Oceania",FJ:"Oceania",SB:"Oceania",VU:"Oceania",WS:"Oceania",TO:"Oceania",
  KI:"Oceania",FM:"Oceania",PW:"Oceania",MH:"Oceania",NR:"Oceania",TV:"Oceania",
};

const CONTINENT_KEY: Record<string, string> = {
  "Europe":"continent_europe","Asia":"continent_asia","Africa":"continent_africa",
  "North America":"continent_north_america","South America":"continent_south_america","Oceania":"continent_oceania",
};

const CONTINENT_EMOJI: Record<string, string> = {
  "Europe": "🌍",
  "Africa": "🌍",
  "Asia": "🌏",
  "Oceania": "🌏",
  "North America": "🌎",
  "South America": "🌎",
};

function getCities(tr: Trip): City[] {
  const raw = (tr as unknown as { cities?: unknown }).cities;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is City => !!c && typeof c === "object" && typeof (c as City).name === "string");
}

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const profFn = useServerFn(getProfile);
  const updFn = useServerFn(updateProfile);
  const tripsFn = useServerFn(listTrips);
  const prof = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => tripsFn() });
  const lang = i18n.language || "it";

  const formInitial: ProfileFormValues = {
    display_name: prof.data?.display_name ?? "",
    username: (prof.data as { username?: string | null } | undefined)?.username ?? "",
    home_currency: prof.data?.home_currency ?? "EUR",
    language: (prof.data?.language as Lang) ?? "it",
    home_country: (prof.data as { home_country?: string | null } | undefined)?.home_country ?? "",
  };

  async function handleSaveSettings(values: ProfileFormValues) {
    try {
      await updFn({ data: { display_name: values.display_name, username: values.username || null, home_currency: values.home_currency, language: values.language, home_country: values.home_country || null } });
      setLanguage(values.language);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
      throw e;
    }
  }

  const stats = useMemo(() => {
    const all = trips.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    // Only count completed past trips — exclude:
    //   • planned trips (end_date >= today, i.e. future)
    //   • ongoing trips (start_date <= today && end_date >= today)
    //   • wishlist trips (trip_type === "wishlist", sentinel dates 2099)
    const past = all.filter((tr) =>
      tr.end_date < today &&
      (tr as unknown as { trip_type?: string }).trip_type !== "wishlist",
    );
    const homeIso = (prof.data as { home_country?: string | null } | undefined)?.home_country?.toUpperCase() ?? null;
    const countrySet = new Set<string>();
    const cityKey = new Set<string>();
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, { name: string; country: string; count: number }>();
    const continentCounts = new Map<string, number>();
    const countryFirstVisit = new Map<string, string>();
    const cityFirstVisit = new Map<string, string>();
    const continentFirstVisit = new Map<string, string>();
    let nights = 0, business = 0, vacation = 0, daytrip = 0;
    const byYear: Record<string, { business: number; vacation: number; daytrip: number }> = {};

    const sortedPast = [...past].sort((a, b) => a.start_date.localeCompare(b.start_date));

    for (const tr of sortedPast) {
      const cs = (tr as unknown as { countries?: string[] }).countries ?? [];
      const continentsThisTrip = new Set<string>();
      cs.forEach((c) => {
        countrySet.add(c);
        countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
        if (!countryFirstVisit.has(c)) countryFirstVisit.set(c, tr.start_date);
        const continent = CONTINENT_BY_ISO[c.toUpperCase()];
        if (continent) continentsThisTrip.add(continent);
      });
      continentsThisTrip.forEach((cont) => {
        continentCounts.set(cont, (continentCounts.get(cont) ?? 0) + 1);
        if (!continentFirstVisit.has(cont)) continentFirstVisit.set(cont, tr.start_date);
      });
      getCities(tr).forEach((c) => {
        cityKey.add(`${c.country}|${c.name}`);
        const k = `${c.country}|${c.name}`;
        const cur = cityCounts.get(k);
        if (cur) cur.count += 1;
        else cityCounts.set(k, { name: c.name, country: c.country, count: 1 });
        if (!cityFirstVisit.has(k)) cityFirstVisit.set(k, tr.start_date);
      });
      nights += Math.max(1, Math.round((new Date(tr.end_date).getTime() - new Date(tr.start_date).getTime()) / 86400000));
      const rawType = (tr as unknown as { trip_type?: string }).trip_type;
      const ttype: "business"|"daytrip"|"vacation" = rawType === "business" ? "business" : rawType === "daytrip" ? "daytrip" : "vacation";
      if (ttype === "business") business += 1; else if (ttype === "daytrip") daytrip += 1; else vacation += 1;
      const y = tr.start_date.slice(0, 4);
      byYear[y] = byYear[y] ?? { business: 0, vacation: 0, daytrip: 0 };
      byYear[y][ttype] += 1;
    }

    const years = Object.entries(byYear).map(([y, v]) => ({ y, ...v, total: v.business + v.vacation + v.daytrip })).sort((a, b) => b.y.localeCompare(a.y));
    const countriesRanked = [...countryCounts.entries()]
      .map(([iso, count]) => ({ iso, count, firstVisit: countryFirstVisit.get(iso) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));
    const homeCountryCount = homeIso ? (countryCounts.get(homeIso) ?? 0) : 0;
    const foreignCountriesRanked = countriesRanked.filter((r) => r.iso.toUpperCase() !== (homeIso ?? ""));
    const citiesRanked = [...cityCounts.entries()]
      .map(([k, v]) => ({ ...v, firstVisit: cityFirstVisit.get(k) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));
    const continentsRanked = [...continentCounts.entries()]
      .map(([name, count]) => ({ name, count, firstVisit: continentFirstVisit.get(name) ?? "" }))
      .sort((a, b) => b.count - a.count || a.firstVisit.localeCompare(b.firstVisit));

    return {
      past,
      countries: [...countrySet].sort((a, b) =>
        countryNameLocalized(a, lang).localeCompare(countryNameLocalized(b, lang), lang),
      ),
      countriesRanked, homeCountryCount, foreignCountriesRanked, citiesRanked, continentsRanked,
      cityCount: cityKey.size, nights, business, vacation, daytrip, years,
      maxYear: Math.max(1, ...years.map((v) => v.total)),
    };
  }, [trips.data, prof.data, lang]);

  const homeCountryIso = (prof.data as { home_country?: string | null } | undefined)?.home_country;
  const username = (prof.data as { username?: string | null } | undefined)?.username;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      {/* Profile header */}
      <div className="relative flex items-center gap-4 pb-6">
        {/* Avatar */}
        <span aria-hidden className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground/70 ring-1 ring-border">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-12 w-12">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8v1H4v-1z" />
          </svg>
        </span>

        {/* Name / username / country */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-serif text-2xl font-bold leading-tight">{prof.data?.display_name || t("display_name")}</p>
          {username && <p className="text-sm text-muted-foreground">@{username}</p>}
          {homeCountryIso && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{flagOf(homeCountryIso)}</span>
              <span>{countryNameLocalized(homeCountryIso, lang)}</span>
            </p>
          )}
        </div>

        {/* Settings gear — top right */}
        <SettingsDialog initial={formInitial} onSave={handleSaveSettings} trigger={
          <button
            type="button"
            aria-label={t("edit_settings")}
            className="absolute right-0 top-0 grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="h-4 w-4" />
          </button>
        } />
      </div>

      <section className="mt-0">
        <div className="flex items-center justify-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="font-serif text-lg font-semibold">{t("stats")}</h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Stat icon={Globe2} label={t("countries")} value={stats.countries.length} />
          <Stat icon={MapPin} label={t("cities")} value={stats.cityCount} />
          <Stat icon={CalendarDays} label={t("nights")} value={stats.nights} />
          <Stat icon={BarChart3} label={t("trips")} value={stats.past.length} />
        </div>

        <div className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
          <h3 className="text-center font-serif text-base font-semibold">{t("countries_visited")}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {stats.countries.length === 0 && <p className="text-sm text-muted-foreground">{t("no_trips")}</p>}
            {stats.countries.map((iso) => (
              <span key={iso} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
                <span>{flagOf(iso)}</span>
                <span>{countryNameLocalized(iso, lang)}</span>
              </span>
            ))}
          </div>
        </div>

        {stats.countriesRanked.length > 0 && (
          <div className="mt-4 space-y-4">
            {homeCountryIso && stats.homeCountryCount > 0 && (
              <RankList title={t("home_country_trips")} rows={[{ key: homeCountryIso, left: <><span>{flagOf(homeCountryIso)}</span><span>{countryNameLocalized(homeCountryIso, lang)}</span></>, count: stats.homeCountryCount }]} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.foreignCountriesRanked.length > 0 && (
                <RankList
                  title={homeCountryIso ? t("most_visited_foreign_countries") : t("most_visited_countries")}
                  rows={stats.foreignCountriesRanked.map((r) => ({ key: r.iso, left: <><span>{flagOf(r.iso)}</span><span>{countryNameLocalized(r.iso, lang)}</span></>, count: r.count }))}
                />
              )}
              <RankList
                title={t("most_visited_cities")}
                rows={stats.citiesRanked.map((r) => ({ key: `${r.country}|${r.name}`, left: <><span>{flagOf(r.country)}</span><span>{cityNameLocalized(r.name, lang)}</span></>, count: r.count }))}
              />
            </div>
            {stats.continentsRanked.length > 0 && (
              <RankList
                title={t("most_visited_continents")}
                rows={stats.continentsRanked.map((r) => ({ key: r.name, left: <><span>{CONTINENT_EMOJI[r.name] ?? "🌍"}</span><span>{t(CONTINENT_KEY[r.name] ?? r.name)}</span></>, count: r.count }))}
              />
            )}
          </div>
        )}

        {(stats.business + stats.vacation + stats.daytrip) > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-center font-serif text-base font-semibold">{t("work_vs_vacation")}</h3>
            <div className="mt-3 flex items-center justify-center gap-5">
              <PieChart business={stats.business} vacation={stats.vacation} daytrip={stats.daytrip} />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /><Palmtree className="h-3.5 w-3.5 text-emerald-600" /><span className="tabular-nums font-medium">{stats.vacation}</span><span className="text-muted-foreground">{t("vacation")}</span></li>
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-slate-600" /><Briefcase className="h-3.5 w-3.5 text-slate-700" /><span className="tabular-nums font-medium">{stats.business}</span><span className="text-muted-foreground">{t("business")}</span></li>
                <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-amber-500" /><Footprints className="h-3.5 w-3.5 text-amber-600" /><span className="tabular-nums font-medium">{stats.daytrip}</span><span className="text-muted-foreground">{t("daytrip")}</span></li>
              </ul>
            </div>
          </div>
        )}

        {stats.years.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="text-center font-serif text-base font-semibold">{t("trips_per_year")}</h3>
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
  const r = 38; const c = 2 * Math.PI * r;
  const vacLen = (vacation / total) * c; const bizLen = (business / total) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(245 158 11)" strokeWidth="20" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(71 85 105)" strokeWidth="20" strokeDasharray={`${vacLen + bizLen} ${c}`} />
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(16 185 129)" strokeWidth="20" strokeDasharray={`${vacLen} ${c}`} />
    </svg>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-border bg-card p-4 text-center shadow-soft">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: Array<{ key: string; left: React.ReactNode; count: number }> }) {
  if (rows.length === 0) return null;
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <h3 className="text-center font-serif text-base font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.slice(0, 12).map((r) => {
          const pct = (r.count / max) * 100;
          return (
            <li key={r.key} className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{r.left}</span>
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
