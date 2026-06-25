import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getFxRate } from "@/lib/fx.functions";

interface Props {
  from: string;
  to: string;
  fallback?: number | null;
}

export function FxWidget({ from, to, fallback }: Props) {
  const { t } = useTranslation();
  const fn = useServerFn(getFxRate);
  const q = useQuery({
    queryKey: ["fx", from, to],
    queryFn: () => fn({ data: { from, to } }),
    staleTime: 6 * 60 * 60 * 1000,
    enabled: !!from && !!to,
  });
  const rate = q.data?.rate ?? fallback ?? null;
  const source = q.data?.source;
  if (from === to) return null;
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-soft">
      <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium tabular-nums">
        1 {from} ={" "}
        {rate !== null && rate !== undefined
          ? rate.toLocaleString(undefined, { maximumFractionDigits: 4 })
          : "—"}{" "}
        {to}
      </span>
      <span className="text-muted-foreground">
        {source === "live"
          ? `· ${t("live")}`
          : source === "cache"
            ? "· ~"
            : rate
              ? `· ${t("fx_using_fallback")}`
              : `· ${t("fx_unavailable")}`}
      </span>
    </div>
  );
}