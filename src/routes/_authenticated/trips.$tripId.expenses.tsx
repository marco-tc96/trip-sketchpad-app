import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Wallet, Bus, Hotel, Utensils, Gift, Sparkles, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES,
} from "@/lib/expenses.functions";
import { listItems } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { getFxRate } from "@/lib/fx.functions";
import { formatMoney } from "@/lib/currencies";
import { currencyForCountryAt } from "@/lib/country-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Fallback "major" currencies offered as a secondary (dimmed) option even when
// they are not part of the trip. Kept small on purpose.
const SECONDARY_CURRENCIES = ["USD", "GBP", "JPY"];

// One colour + icon per expense category. The hex is used by the pie chart and
// the legend dots; the bg class colours the matching icon in the list — so the
// list icons and the pie slices always share the same colour.
type Category = (typeof EXPENSE_CATEGORIES)[number];
const CATEGORY_STYLE: Record<Category, { hex: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  transport: { hex: "#0ea5e9", bg: "bg-sky-500",     icon: Bus },
  lodging:   { hex: "#6366f1", bg: "bg-indigo-500",  icon: Hotel },
  food:      { hex: "#f59e0b", bg: "bg-amber-500",   icon: Utensils },
  souvenir:  { hex: "#f43f5e", bg: "bg-rose-500",    icon: Gift },
  activity:  { hex: "#10b981", bg: "bg-emerald-500", icon: Sparkles },
  other:     { hex: "#64748b", bg: "bg-slate-500",   icon: MoreHorizontal },
};

export const Route = createFileRoute("/_authenticated/trips/$tripId/expenses")({
  component: ExpensesView,
});

function ExpensesView() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(listExpenses);
  const tripFn = useServerFn(getTrip);
  const profFn = useServerFn(getProfile);
  const delFn = useServerFn(deleteExpense);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const list = useQuery({ queryKey: ["expenses", tripId], queryFn: () => fn({ data: { trip_id: tripId } }) });

  // Retroactively-added trip (already underway/past when logged) — expense
  // tracking doesn't apply here (see the trip page's tab list, which already
  // hides the link to this route). Bounce back to the timeline in case this
  // URL is reached another way (bookmark, browser back/forward, ...).
  const isWishlist = (trip.data?.start_date ?? "") >= "2099-01-01";
  const isRetroactiveTrip = !!trip.data && !isWishlist && trip.data.start_date < trip.data.created_at.slice(0, 10);
  useEffect(() => {
    if (isRetroactiveTrip) nav({ to: "/trips/$tripId/timeline", params: { tripId } });
  }, [isRetroactiveTrip, tripId]);

  if (!trip.data || !profile.data || isRetroactiveTrip) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  const homeCcy = profile.data.home_currency;
  const expenses = list.data ?? [];
  const toHome = (e: { amount: number | string; amount_home?: number | string | null; currency: string }) =>
    Number(e.amount_home ?? (e.currency === homeCcy ? e.amount : 0));
  const total = expenses.reduce((s, e) => s + toHome(e), 0);

  // Totals per category (in home currency) — drives the pie chart + legend.
  const catTotals = EXPENSE_CATEGORIES
    .map((cat) => ({ cat, value: expenses.filter((e) => e.category === cat).reduce((s, e) => s + toHome(e), 0) }))
    .filter((x) => x.value > 0);

  // Primary currencies = the trip's countries' currencies + the trip's own
  // local currency + the user's home currency. These are shown prominently.
  const tripCountries: string[] = Array.isArray((trip.data as unknown as { countries?: string[] }).countries)
    ? (trip.data as unknown as { countries: string[] }).countries
    : [];
  const primaryCurrencies = Array.from(
    new Set(
      [
        trip.data.local_currency,
        ...tripCountries.map((iso) => currencyForCountryAt(iso, trip.data!.start_date)),
        homeCcy,
      ].filter(Boolean) as string[],
    ),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <AddExpenseDialog
          tripId={tripId}
          tripCurrency={trip.data.local_currency}
          homeCurrency={homeCcy}
          primaryCurrencies={primaryCurrencies}
        />
      </div>

      {/* Total + breakdown, both in Timeline-style stat cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <Wallet className="h-5 w-5 text-primary" />
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("total")}</p>
          <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{formatMoney(total, homeCcy)}</p>
        </div>

        {catTotals.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("expense_breakdown")}</p>
            <div className="mt-2 flex items-center gap-3">
              <CategoryPie segments={catTotals.map((x) => ({ hex: CATEGORY_STYLE[x.cat].hex, value: x.value }))} />
              <ul className="min-w-0 flex-1 space-y-1">
                {catTotals.map((x) => (
                  <li key={x.cat} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CATEGORY_STYLE[x.cat].hex }} />
                    <span className="truncate text-muted-foreground">{t(x.cat)}</span>
                    <span className="ml-auto shrink-0 tabular-nums font-medium">{formatMoney(x.value, homeCcy)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("no_expenses")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {expenses.map((e) => {
            const st = CATEGORY_STYLE[e.category as Category] ?? CATEGORY_STYLE.other;
            const Icon = st.icon;
            return (
              <li key={e.id} className="flex items-center gap-3 p-4">
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ${st.bg}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title || t(e.category)}</p>
                  <p className="text-xs text-muted-foreground">{t(e.category)} · {fmtDate(e.spent_on)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatMoney(Number(e.amount), e.currency)}</p>
                  {e.amount_home && e.currency !== homeCcy && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ≈ {formatMoney(Number(e.amount_home), homeCcy)}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    if (!confirm(t("delete_confirm"))) return;
                    await delFn({ data: { id: e.id } });
                    qc.invalidateQueries({ queryKey: ["expenses", tripId] });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Donut pie chart (same visual style as the profile page) for an arbitrary set
// of coloured segments, drawn clockwise from the top.
function CategoryPie({ segments }: { segments: Array<{ hex: string; value: number }> }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  const r = 38;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" className="h-24 w-24 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" className="stroke-muted/30" strokeWidth="20" />
      {segments.map((seg, i) => {
        const len = (seg.value / total) * c;
        const circle = (
          <circle
            key={i}
            cx="50" cy="50" r={r} fill="none"
            stroke={seg.hex}
            strokeWidth="20"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-acc}
          />
        );
        acc += len;
        return circle;
      })}
    </svg>
  );
}

function AddExpenseDialog({
  tripId, tripCurrency, homeCurrency, primaryCurrencies,
}: {
  tripId: string; tripCurrency: string; homeCurrency: string; primaryCurrencies: string[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createFn = useServerFn(createExpense);
  const fxFn = useServerFn(getFxRate);
  const itemsFn = useServerFn(listItems);
  const items = useQuery({
    queryKey: ["items", tripId],
    queryFn: () => itemsFn({ data: { trip_id: tripId } }),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: "food" as (typeof EXPENSE_CATEGORIES)[number],
    title: "",
    amount: "",
    currency: tripCurrency || primaryCurrencies[0] || homeCurrency,
    spent_on: new Date().toISOString().slice(0, 10),
    note: "",
    itinerary_item_id: "",
  });

  // Major currencies shown dimmed, only if not already in the primary list.
  const secondaryCurrencies = SECONDARY_CURRENCIES.filter((c) => !primaryCurrencies.includes(c));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    let amount_home: number | null = null;
    let fx_rate: number | null = null;
    if (form.currency === homeCurrency) {
      amount_home = amt;
      fx_rate = 1;
    } else {
      try {
        const fx = await fxFn({ data: { from: form.currency, to: homeCurrency } });
        if (fx.rate) {
          fx_rate = fx.rate;
          amount_home = Math.round(amt * fx.rate * 100) / 100;
        }
      } catch { /* ignore */ }
    }
    try {
      await createFn({
        data: {
          trip_id: tripId,
          category: form.category,
          title: form.title || null,
          amount: amt,
          currency: form.currency,
          amount_home,
          home_currency: homeCurrency,
          fx_rate,
          spent_on: form.spent_on,
          note: form.note || null,
          itinerary_item_id: form.itinerary_item_id || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["expenses", tripId] });
      setOpen(false);
      setForm({ ...form, title: "", amount: "", note: "", itinerary_item_id: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full"><Plus className="mr-1.5 h-4 w-4" />{t("add_expense")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("add_expense")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("category")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as typeof form.category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("date")}</Label>
              <Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("title")}</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div className="space-y-1.5">
              <Label>{t("amount")}</Label>
              <Input type="number" inputMode="decimal" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("currency")}</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {/* Trip + home currencies — prominent */}
                  {primaryCurrencies.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  {/* Major world currencies — dimmed, secondary */}
                  {secondaryCurrencies.map((c) => (
                    <SelectItem key={c} value={c} className="text-muted-foreground">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {items.data && items.data.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t("link_to_item")}</Label>
              <Select value={form.itinerary_item_id || "none"} onValueChange={(v) => setForm({ ...form, itinerary_item_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("none")}</SelectItem>
                  {items.data.map((it) => <SelectItem key={it.id} value={it.id}>{it.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("notes")}</Label>
            <Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit">{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
