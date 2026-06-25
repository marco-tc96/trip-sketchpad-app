import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { CURRENCIES } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/trips/new")({
  component: NewTrip,
});

function NewTrip() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const profileFn = useServerFn(getProfile);
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const createFn = useServerFn(createTrip);
  const [form, setForm] = useState({
    title: "",
    destination: "",
    country: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    local_currency: "EUR",
    cover_emoji: "✈️",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const row = await createFn({ data: { ...form, timeline_mode: "days" } });
      qc.invalidateQueries({ queryKey: ["trips"] });
      nav({ to: "/trips/$tripId", params: { tripId: row.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-3xl font-bold">{t("new_trip")}</h1>
      <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <div className="space-y-1.5">
            <Label>Emoji</Label>
            <Input className="w-16 text-center text-xl" value={form.cover_emoji} onChange={(e) => setForm({ ...form, cover_emoji: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">{t("title")}</Label>
            <Input id="title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("destination")}</Label>
            <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("country")}</Label>
            <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("start_date")}</Label>
            <Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("end_date")}</Label>
            <Input type="date" required value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("local_currency")}</Label>
          <Select value={form.local_currency} onValueChange={(v) => setForm({ ...form, local_currency: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60">
              {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {profile.data && (
            <p className="text-xs text-muted-foreground">{t("home_currency")}: {profile.data.home_currency}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>{t("notes")}</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="flex gap-3">
          <Button type="button" variant="ghost" onClick={() => nav({ to: "/trips" })}>{t("cancel")}</Button>
          <Button type="submit" disabled={busy} className="ml-auto">{t("save")}</Button>
        </div>
      </form>
    </main>
  );
}