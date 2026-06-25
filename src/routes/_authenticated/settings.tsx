import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getProfile, updateProfile } from "@/lib/profile.functions";
import { CURRENCIES } from "@/lib/currencies";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fn = useServerFn(getProfile);
  const updFn = useServerFn(updateProfile);
  const q = useQuery({ queryKey: ["profile"], queryFn: () => fn() });
  const [form, setForm] = useState({ home_currency: "EUR", language: "it" as Lang, display_name: "" });

  useEffect(() => {
    if (q.data) {
      setForm({
        home_currency: q.data.home_currency,
        language: q.data.language as Lang,
        display_name: q.data.display_name ?? "",
      });
    }
  }, [q.data]);

  async function save() {
    try {
      await updFn({ data: { ...form } });
      setLanguage(form.language);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="font-serif text-3xl font-bold">{t("settings")}</h1>
      <div className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="space-y-1.5">
          <Label>{t("title")}</Label>
          <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        </div>
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
        <Button onClick={save} className="w-full">{t("save")}</Button>
      </div>
    </main>
  );
}