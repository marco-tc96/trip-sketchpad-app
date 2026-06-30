import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFxAverage } from "@/lib/fx.functions";

interface Props {
  from: string;
  to: string;
  start: string;
  end: string;
  fallback?: number | null;
}

// Resolves a currency code (e.g. "EUR", "KRW") to its narrow symbol
// (e.g. "€", "₩") using the browser's own currency data instead of a
// hand-maintained lookup table, so every supported ISO code "just works".
function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency")?.value;
    return sym && sym !== code ? sym : "";
  } catch {
    return "";
  }
}

function CurrencyBadge({ symbol, muted }: { symbol: string; muted?: boolean }) {
  if (!symbol) return null;
  return (
    <span
      className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-0.5 text-[10px] font-bold ${
        muted
          ? "bg-muted text-muted-foreground"
          : "bg-primary/15 text-primary"
      }`}
    >
      {symbol}
    </span>
  );
}

export function FxAverageWidget({ from, to, start, end, fallback }: Props) {
  const { t } = useTranslation();
  const fn = useServerFn(getFxAverage);
  const q = useQuery({
    queryKey: ["fx-avg", from, to, start, end],
    queryFn: () => fn({ data: { from, to, start, end } }),
    staleTime: 6 * 60 * 60 * 1000,
    enabled: !!from && !!to && from !== to,
  });
  if (from === to) return null;
  const rate = q.data?.rate ?? fallback ?? null;
  const source = q.data?.source;
  const label =
    source === "historical"
      ? t("fx_average")
      : source === "live"
        ? t("live")
        : source === "cache"
          ? "~"
          : rate
            ? t("fx_using_fallback")
            : t("fx_unavailable");
  const fromSymbol = currencySymbol(from);
  const toSymbol = currencySymbol(to);
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-soft">
      <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
      <span className="flex items-center gap-1 font-medium tabular-nums">
        <CurrencyBadge symbol={fromSymbol} />
        1 {from} ={" "}
        {rate !== null && rate !== undefined
          ? rate.toLocaleString(undefined, { maximumFractionDigits: 4 })
          : "—"}{" "}
        {to}
        <CurrencyBadge symbol={toSymbol} muted />
      </span>
      <span className="text-muted-foreground">· {label}</span>
    </div>
  );
}
