import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BarChart3, Globe2, MapPin, CalendarDays, User, Briefcase, Palmtree } from "lucide-react";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { listTrips } from "@/lib/trips.functions";
import { CURRENCIES } from "@/lib/currencies";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { allCountries, flagOf, countryNameLocalized } from "@/lib/country-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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
  const qc = useQueryClient();
  const profFn = useServerFn(getProfile);
  const updFn = useServerFn(updateProfile);
  const tripsFn = useServerFn(listTrips);
  const prof = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => tripsFn() });

  const [form, setForm] = useState({
    home_currency: "EUR",
    language: "it" as Lang,
    display_name: "",
    home_country: "" as string,
  });

  useEffect(() => {
    if (prof.data) {
      setForm({
        home_currency: prof.data.home_currency,
        language: prof.data.language as Lang,
        display_name: prof.data.display_name ?? "",
        home_country: (prof.data as { home_country?: string | null }).home_country ?? "",
      });
    }
  }, [prof.data]);

  async function save() {
    try {
      await updFn({
        data: {
          home_currency: form.home_currency,
          language: form.language,
          display_name: form.display_name,
          home_country: form.home_country || null,
        },
      });
      setLanguage(form.language);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  // ---- Stats ----
  const stats = useMemo(() => {
    const all = trips.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const past = all.filter((tr) => tr.end_date < today);
    const countrySet = new Set<string>();
    const cityKey = new Set<string>();
    let nights = 0;
    let business = 0;
    let vacation = 0;
    const byYear: Record<string, { business: number; vacation: number }> = {};
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
      const ttype = (tr as unknown as { trip_type?: string }).trip_type === "business" ? "business" : "vacation";
      if (ttype === "business") business += 1; else vacation += 1;
      const y = tr.start_date.slice(0, 4);
      byYear[y] = byYear[y] ?? { business: 0, vacation: 0 };
      byYear[y][ttype] += 1;
    }
    const years = Object.entries(byYear)
      .map(([y, v]) => ({ y, ...v, total: v.business + v.vacation }))
      .sort((a, b) => b.y.localeCompare(a.y));
    return {
      past,
      countries: [...countrySet].sort(),
      cityCount: cityKey.size,
      nights,
      business,
      vacation,
      years,
      maxYear: Math.max(1, ...years.map((v) => v.total)),
    };
  }, [trips.data]);

  const lang = i18n.language || "it";
  const countries = useMemo(
    () =>
      allCountries()
        .map((c) => ({ ...c, label: countryNameLocalized(c.iso, lang) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [lang],
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <User className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          {t("profile")}
        </h1>
      </div>

      {/* Editable profile */}
      <section className="mt-6 space-y-5 rounded-3xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h2 className="font-serif text-lg font-semibold">{t("account_details")}</h2>
        <div className="space-y-1.5">
          <Label>{t("display_name")}</Label>
          <Input
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("home_currency")}</Label>
            <Select value={form.home_currency} onValueChange={(v) => setForm({ ...form, home_currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("language")}</Label>
            <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v as Lang })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("home_country")}</Label>
          <Select
            value={form.home_country || "_none"}
            onValueChange={(v) => setForm({ ...form, home_country: v === "_none" ? "" : v })}
          >
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="_none">—</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.iso} value={c.iso}>
                  {c.flag} {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={save} className="w-full sm:w-auto">{t("save")}</Button>
      </section>

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

        {(stats.business + stats.vacation) > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-serif text-base font-semibold">Lavoro vs vacanza</h3>
            <div className="mt-3 flex items-center gap-5">
              <PieChart business={stats.business} vacation={stats.vacation} />
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
                return (
                  <div key={row.y} className="flex items-center gap-3 text-sm">
                    <span className="w-12 tabular-nums text-muted-foreground">{row.y}</span>
                    <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-emerald-500" style={{ width: `${vacPct}%` }} title={`${row.vacation} ${t("vacation")}`} />
                      <div className="h-full bg-slate-600" style={{ width: `${bizPct}%` }} title={`${row.business} ${t("business")}`} />
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

function PieChart({ business, vacation }: { business: number; vacation: number }) {
  const total = business + vacation;
  if (total === 0) return null;
  const r = 38;
  const c = 2 * Math.PI * r;
  const vacLen = (vacation / total) * c;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(71 85 105)" strokeWidth="20" />
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