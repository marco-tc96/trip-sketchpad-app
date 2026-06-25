import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { CalendarDays, Wallet, Plane } from "lucide-react";
import { listExpenses, EXPENSE_CATEGORIES } from "@/lib/expenses.functions";
import { listItems } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { formatMoney } from "@/lib/currencies";

export const Route = createFileRoute("/_authenticated/trips/$tripId/")({
  component: Overview,
});

function Overview() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
  const tripFn = useServerFn(getTrip);
  const expFn = useServerFn(listExpenses);
  const itemFn = useServerFn(listItems);
  const profileFn = useServerFn(getProfile);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const expenses = useQuery({ queryKey: ["expenses", tripId], queryFn: () => expFn({ data: { trip_id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });

  if (!trip.data || !profile.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const homeCcy = profile.data.home_currency;
  const total = (expenses.data ?? []).reduce(
    (sum, e) => sum + Number(e.amount_home ?? (e.currency === homeCcy ? e.amount : 0)),
    0,
  );
  const days = Math.max(
    1,
    Math.round(
      (new Date(trip.data.end_date).getTime() - new Date(trip.data.start_date).getTime()) / 86400000,
    ) + 1,
  );
  const byCat = EXPENSE_CATEGORIES.map((c) => ({
    c,
    total: (expenses.data ?? [])
      .filter((e) => e.category === c)
      .reduce((s, e) => s + Number(e.amount_home ?? (e.currency === homeCcy ? e.amount : 0)), 0),
  }));
  const maxCat = Math.max(1, ...byCat.map((b) => b.total));

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Stat icon={CalendarDays} label={t("duration")} value={`${days} ${t("nights")}`} />
      <Stat icon={Plane} label={t("timeline")} value={`${items.data?.length ?? 0}`} />
      <Stat icon={Wallet} label={t("total")} value={formatMoney(total, homeCcy)} />

      <section className="md:col-span-3 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-serif text-lg font-semibold">{t("expense_breakdown")}</h2>
        <div className="mt-4 space-y-3">
          {byCat.map(({ c, total: ct }) => (
            <div key={c}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t(c)}</span>
                <span className="tabular-nums text-muted-foreground">{formatMoney(ct, homeCcy)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-warm-gradient" style={{ width: `${(ct / maxCat) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        {trip.data.notes && (
          <p className="mt-6 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-sm text-secondary-foreground">
            {trip.data.notes}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}