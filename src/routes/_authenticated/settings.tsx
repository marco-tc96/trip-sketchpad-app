import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { CURRENCIES } from "@/lib/currencies";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import { allCountries, countryNameLocalized } from "@/lib/country-data";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getProfile);
  const updFn = useServerFn(updateProfile);
  const q = useQuery({ queryKey: ["profile"], queryFn: () => fn() });
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({
    home_currency: "EUR",
    language: "it" as Lang,
    display_name: "",
    home_country: "" as string,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.data) {
      setForm({
        home_currency: q.data.home_currency,
        language: q.data.language as Lang,
        display_name: q.data.display_name ?? "",
        home_country: (q.data as { home_country?: string | null }).home_country ?? "",
      });
    }
  }, [q.data]);

  const lang = i18n.language || "it";
  const countries = useMemo(
    () =>
      allCountries()
        .map((c) => ({ ...c, label: countryNameLocalized(c.iso, lang) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [lang],
  );

  async function save() {
    setBusy(true);
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
      nav({ to: "/profile" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      <Link
        to="/profile"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("profile")}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-bold">{t("settings")}</h1>

      <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
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

        <div className="space-y-1.5">
          <Label>{t("appearance")}</Label>
          <div className="inline-flex rounded-full border border-border bg-secondary/40 p-1 text-sm">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                theme === "light"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              {t("light_mode")}
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                theme === "dark"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              {t("dark_mode")}
            </button>
          </div>
        </div>

        <Button onClick={save} disabled={busy} className="w-full">{t("save")}</Button>
      </div>
    </main>
  );
}
