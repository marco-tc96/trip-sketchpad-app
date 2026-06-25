import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  listExpenses, createExpense, deleteExpense, EXPENSE_CATEGORIES,
} from "@/lib/expenses.functions";
import { listItems } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { getFxRate } from "@/lib/fx.functions";
import { CURRENCIES, formatMoney } from "@/lib/currencies";
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

export const Route = createFileRoute("/_authenticated/trips/$tripId/expenses")({
  component: ExpensesView,
});

function ExpensesView() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fn = useServerFn(listExpenses);
  const tripFn = useServerFn(getTrip);
  const profFn = useServerFn(getProfile);
  const delFn = useServerFn(deleteExpense);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const list = useQuery({ queryKey: ["expenses", tripId], queryFn: () => fn({ data: { trip_id: tripId } }) });

  if (!trip.data || !profile.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  const homeCcy = profile.data.home_currency;
  const expenses = list.data ?? [];
  const total = expenses.reduce(
    (s, e) => s + Number(e.amount_home ?? (e.currency === homeCcy ? e.amount : 0)),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{t("total")}</p>
          <p className="font-serif text-2xl font-semibold tabular-nums">{formatMoney(total, homeCcy)}</p>
        </div>
        <AddExpenseDialog
          tripId={tripId}
          tripCurrency={trip.data.local_currency}
          homeCurrency={homeCcy}
        />
      </div>

      {expenses.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("no_expenses")}
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center gap-3 p-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-medium uppercase">
                {e.category.slice(0, 2)}
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
          ))}
        </ul>
      )}
    </div>
  );
}

function AddExpenseDialog({
  tripId, tripCurrency, homeCurrency,
}: {
  tripId: string; tripCurrency: string; homeCurrency: string;
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
    currency: tripCurrency,
    spent_on: new Date().toISOString().slice(0, 10),
    note: "",
    itinerary_item_id: "",
  });

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
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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