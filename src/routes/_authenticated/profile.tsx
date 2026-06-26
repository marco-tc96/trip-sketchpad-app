import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BarChart3, Globe2, MapPin, CalendarDays, User } from "lucide-react";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { listTrips } from "@/lib/trips.functions";
import { CURRENCIES } from "@/lib/currencies";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { allCountries, flagOf, countryByIso, countryNameLocalized } from "@/lib/country-data";
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
    const byYear = past.reduce<Record<string, number>>((acc, tr) => {
      const y = tr.start_date.slice(0, 4);
      acc[y] = (acc[y] ?? 0) + 1;
      return acc;
    }, {});
    const years = Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0]));
    return {
      past,
      countries: [...countrySet].sort(),
      cityCount: cityKey.size,
      nights,
      years,
      maxYear: Math.max(1, ...Object.values(byYear)),
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
                <span>{countryByIso(iso)?.name ?? iso}</span>
              </span>
            ))}
          </div>
        </div>

        {stats.years.length > 0 && (
          <div className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-serif text-base font-semibold">{t("trips_per_year")}</h3>
            <div className="mt-3 space-y-2">
              {stats.years.map(([y, n]) => (
                <div key={y} className="flex items-center gap-3 text-sm">
                  <span className="w-12 tabular-nums text-muted-foreground">{y}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-warm-gradient"
                      style={{ width: `${(n / stats.maxYear) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
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