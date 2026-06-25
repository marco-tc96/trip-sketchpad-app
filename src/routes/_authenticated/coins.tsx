import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Coins } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFxRate } from "@/lib/fx.functions";
import { CURRENCIES } from "@/lib/currencies";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/coins")({
  component: CoinsPage,
});

function CoinsPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("USD");
  const [amount, setAmount] = useState("100");

  const fxFn = useServerFn(getFxRate);
  const q = useQuery({
    queryKey: ["fx", from, to],
    queryFn: () => fxFn({ data: { from, to } }),
    staleTime: 60 * 60 * 1000,
  });

  const rate = q.data?.rate ?? null;
  const converted = rate ? Number(amount || 0) * rate : null;

  function swap() {
    setFrom(to);
    setTo(from);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
          {t("coins")}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t("converter_sub")}</p>

      <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("from")}</label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="icon" variant="ghost" onClick={swap} aria-label="Swap">
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("to")}</label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60">
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("amount")}</label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", "."))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{to}</label>
            <div className="grid h-9 items-center rounded-md border border-border bg-muted/40 px-3 text-sm font-medium tabular-nums">
              {converted !== null
                ? converted.toLocaleString(undefined, { maximumFractionDigits: 2 })
                : "—"}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          1 {from} ={" "}
          {rate
            ? rate.toLocaleString(undefined, { maximumFractionDigits: 4 })
            : "—"}{" "}
          {to}
          {q.data?.source === "live" ? ` · ${t("live")}` : ""}
        </p>
      </section>
    </main>
  );
}