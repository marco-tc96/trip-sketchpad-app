import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Train, Bus, Car, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2, ChevronsUpDown, Check, Clock,
  CalendarDays, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { listItems, createItem, updateItem, deleteItem, ITEM_KINDS } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { listExpenses } from "@/lib/expenses.functions";
import { formatMoney } from "@/lib/currencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { citiesOfCountry, flagOf, cityNameLocalized } from "@/lib/country-data";
import { cn } from "@/lib/utils";
import { useCityPhoto } from "@/hooks/use-city-photo";
import { hubsForMode, formatHub, type Hub, HUBS } from "@/lib/transport-hubs";
import { useRemoteHubs, modeToKind } from "@/hooks/use-remote-hubs";
import {
  useAirports, airportsForCountries, airportsSearch, formatAirport, type AirportHub,
} from "@/hooks/use-airports";

type ItemRow = {
  id: string;
  trip_id: string;
  kind: string;
  title: string;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  day_index: number | null;
  notes: string | null;
  position: number;
  meta?: unknown;
};

type TransportMode = "car" | "moto" | "train" | "plane" | "ferry" | "bus";
type Leg = {
  from: string;
  to: string;
  depart_at: string;
  arrive_at: string;
  carrier: string;
  number: string;
};
const emptyLeg = (): Leg => ({
  from: "", to: "", depart_at: "", arrive_at: "", carrier: "", number: "",
});
const MODE_LABEL: Record<TransportMode, string> = {
  car: "Auto", moto: "Moto", train: "Treno", plane: "Aereo", ferry: "Traghetto", bus: "Bus",
};
const MODE_ICON: Record<TransportMode, React.ComponentType<{ className?: string }>> = {
  car: Car, moto: Bike, train: Train, plane: Plane, ferry: Ship, bus: Bus,
};

export const Route = createFileRoute("/_authenticated/trips/$tripId/timeline")({
  component: TimelineView,
});

const KIND_ICON: Record<(typeof ITEM_KINDS)[number], React.ComponentType<{ className?: string }>> = {
  outbound: PlaneTakeoff,
  return: PlaneLanding,
  flight: Plane,
  train: Train,
  bus: Bus,
  car: Car,
  moto: Bike,
  ferry: Ship,
  transfer: ArrowRightLeft,
  lodging: Hotel,
  activity: Sparkles,
  zone: MapPin,
  other: MapPin,
};

const TRANSPORT_KINDS = new Set([
  "outbound", "return", "flight", "train", "car", "moto", "ferry", "transfer",
]);
function kindClasses(kind: string) {
  if (TRANSPORT_KINDS.has(kind)) {
    return {
      card: "bg-warm-gradient text-primary-foreground border-transparent",
      sub: "text-primary-foreground/85",
      dot: "bg-primary text-primary-foreground",
    };
  }
  if (kind === "lodging") {
    return {
      card: "bg-gradient-to-br from-indigo-500 to-blue-600 text-white border-transparent",
      sub: "text-white/85",
      dot: "bg-indigo-500 text-white",
    };
  }
  if (kind === "activity") {
    return {
      card: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-transparent",
      sub: "text-white/85",
      dot: "bg-emerald-600 text-white",
    };
  }
  return {
    card: "bg-muted/40 text-foreground",
    sub: "text-muted-foreground",
    dot: "bg-muted-foreground/50 text-background",
  };
}

function TimelineView() {
  const { tripId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const qc = useQueryClient();
  const tripFn = useServerFn(getTrip);
  const itemFn = useServerFn(listItems);
  const delFn = useServerFn(deleteItem);
  const profFn = useServerFn(getProfile);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });
  const expFn = useServerFn(listExpenses);
  const expenses = useQuery({ queryKey: ["expenses", tripId], queryFn: () => expFn({ data: { trip_id: tripId } }) });

  if (!trip.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const tripRow = trip.data as typeof trip.data & {
    cities?: Array<{ name: string; country: string }>;
    countries?: string[];
  };
  const tripCities = Array.isArray(tripRow.cities) ? tripRow.cities : [];
  const tripCountries = Array.isArray(tripRow.countries) ? tripRow.countries : [];
  const homeCountry = (profile.data as { home_country?: string | null } | undefined)?.home_country ?? null;
  const hubCountries = Array.from(new Set([...(homeCountry ? [homeCountry] : []), ...tripCountries]));
  const list = items.data ?? [];
  const outbound = list.find((i) => i.kind === "outbound");
  const ret = list.find((i) => i.kind === "return");
  const middle = list.filter((i) => i.kind !== "outbound" && i.kind !== "return");
  const lodgings = middle.filter((i) => i.kind === "lodging");
  const nonLodging = middle.filter((i) => i.kind !== "lodging");

  const start = new Date(trip.data.start_date);
  const end = new Date(trip.data.end_date);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const groups = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return {
      label: `${t("day_of", { n: i + 1 })} · ${d.toLocaleDateString(lang, { weekday: "short", day: "2-digit", month: "short" })}`,
      items: nonLodging.filter((it) =>
        it.start_at ? it.start_at.slice(0, 10) === iso : it.day_index === i + 1,
      ),
    };
  });

  async function del(id: string) {
    if (!confirm(t("delete_confirm"))) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["items", tripId] });
  }

  return (
    <div>
      <TripStats trip={trip.data} expenses={expenses.data ?? []} homeCcy={profile.data?.home_currency ?? "EUR"} />
      <div className="mb-4 flex items-center justify-end">
          <AddItemDialog tripId={tripId} tripCities={tripCities} tripCountries={tripCountries} />
      </div>

      <div className="space-y-6">
        <JourneyBlock tripId={tripId} outbound={outbound} ret={ret} tripCountries={hubCountries} />
        <LodgingsBlock tripId={tripId} lodgings={lodgings} tripCities={tripCities} tripCountries={tripCountries} onDelete={del} />

        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h3>
              {g.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-3">
                  {g.items.map((it) => {
                    const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? MapPin;
                    const cls = kindClasses(it.kind);
                    const dark = TRANSPORT_KINDS.has(it.kind) || it.kind === "activity";
                    return (
                      <li key={it.id}>
                        <AddItemDialog
                          tripId={tripId}
                          tripCities={tripCities}
                          tripCountries={tripCountries}
                          existing={it as ItemRow}
                          trigger={
                            <button
                              type="button"
                              className={cn("flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:brightness-110", cls.card)}
                            >
                              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className={cn("text-[10px] uppercase tracking-widest", cls.sub)}>{t(it.kind)}</p>
                                <p className="truncate font-medium">{it.title}</p>
                                <p className={cn("text-xs", cls.sub)}>
                                  {it.location && <>{cityNameLocalized(it.location, lang)} · </>}
                                  {it.start_at && fmtDT(it.start_at, lang)}
                                  {it.end_at && ` → ${fmtDT(it.end_at, lang)}`}
                                </p>
                                {it.notes && <p className={cn("mt-1 text-xs", cls.sub)}>{it.notes}</p>}
                                <TransportLegs meta={it.meta as TransportMeta | null} />
                              </div>
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); del(it.id); }}
                                className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md", dark ? "text-white hover:bg-white/10" : "hover:bg-foreground/10")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </span>
                            </button>
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function TripStats({
  trip,
  expenses,
  homeCcy,
}: {
  trip: { start_date: string; end_date: string };
  expenses: Array<{ amount: number; amount_home: number | null; currency: string }>;
  homeCcy: string;
}) {
  const { t } = useTranslation();
  const days = Math.max(
    1,
    Math.round((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000) + 1,
  );
  const total = expenses.reduce(
    (s, e) => s + Number(e.amount_home ?? (e.currency === homeCcy ? e.amount : 0)),
    0,
  );
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <CalendarDays className="h-5 w-5 text-primary" />
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("duration")}</p>
        <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{days} {t("nights")}</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <Wallet className="h-5 w-5 text-primary" />
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{t("total")}</p>
        <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">{formatMoney(total, homeCcy)}</p>
      </div>
    </div>
  );
}

type JourneyItem = {
  id: string;
  title: string;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  meta?: unknown;
};

function JourneyBlock({
  tripId, outbound, ret, tripCountries,
}: { tripId: string; outbound: JourneyItem | undefined; ret: JourneyItem | undefined; tripCountries: string[] }) {
  return (
    <div className="space-y-3">
      <JourneyLeg tripId={tripId} kind="outbound" item={outbound} tripCountries={tripCountries} />
      <JourneyLeg tripId={tripId} kind="return" item={ret} tripCountries={tripCountries} />
    </div>
  );
}

function JourneyLeg({
  tripId, kind, item, tripCountries,
}: { tripId: string; kind: "outbound" | "return"; item: JourneyItem | undefined; tripCountries: string[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const meta = (item?.meta ?? null) as TransportMeta | null;
  const legs = meta?.legs ?? [];
  const first = legs[0];
  const last = legs[legs.length - 1] ?? first;
  const fromCity = first?.from?.trim() ?? "";
  const toCity = last?.to?.trim() ?? "";
  const fromPhoto = useCityPhoto(fromCity);
  const toPhoto = useCityPhoto(toCity);
  const ModeIcon = meta?.mode ? MODE_ICON[meta.mode] : kind === "outbound" ? PlaneTakeoff : PlaneLanding;

  const departISO = first?.depart_at || item?.start_at || null;
  const arriveISO = last?.arrive_at || item?.end_at || null;
  const countdown = kind === "outbound" && departISO ? daysUntil(departISO) : null;
  const showHubCodes = meta?.mode === "plane" || meta?.mode === "ferry";
  const stops = legs.length > 1
    ? legs.slice(0, -1).map((l) => l.to).filter(Boolean).map((s) => nameOf(s, lang)).join(", ")
    : "";
  const stopCodes = legs.length > 1 && showHubCodes
    ? legs.slice(0, -1).map((l) => l.to).filter(Boolean).map((s) => codeOf(s)).join(" · ")
    : "";

  return (
    <TransportDialog
      tripId={tripId}
      kind={kind}
      tripCountries={tripCountries}
      existing={item ? { id: item.id, meta } : undefined}
      trigger={
        <button
          type="button"
          className="relative block w-full overflow-hidden rounded-2xl border border-border/40 text-left shadow-soft transition hover:brightness-110"
        >
          <div className="absolute inset-0">
            {fromPhoto ? (
              <img src={fromPhoto} alt="" className="absolute inset-y-0 left-0 h-full w-1/2 object-cover" />
            ) : (
              <div className="absolute inset-y-0 left-0 h-full w-1/2 bg-gradient-to-br from-slate-700 to-slate-900" />
            )}
            {toPhoto ? (
              <img src={toPhoto} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover" />
            ) : (
              <div className="absolute inset-y-0 right-0 h-full w-1/2 bg-gradient-to-bl from-slate-700 to-slate-900" />
            )}
            <div className="absolute inset-0 bg-slate-950/70" />
            <div className="absolute inset-y-0 left-1/4 right-1/4 bg-gradient-to-r from-transparent via-slate-950/80 to-transparent" />
          </div>

          <div className="relative p-4 text-white">
            <div className="flex items-start justify-between gap-2 text-[11px] font-semibold uppercase tracking-widest">
              <span className="opacity-90">{t(kind)}</span>
              {departISO && <span className="opacity-80">{fmtDate(departISO, lang)}</span>}
            </div>

            {!item ? (
              <p className="mt-6 pb-4 text-center text-sm underline opacity-90">{t("add_item")}</p>
            ) : (
              <>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs opacity-90">
                  {first?.carrier && <span className="font-medium">{first.carrier}</span>}
                  <span className="opacity-80">
                    {legs.map((l) => l.number).filter(Boolean).join(" + ")}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                      {fmtTime(departISO, lang) || "—"}
                    </p>
                    {showHubCodes && (
                      <div className="mt-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.2em]">
                        {codeOf(fromCity)}
                      </div>
                    )}
                    <p className="mt-0.5 truncate text-[11px] opacity-80" title={fromCity || undefined}>
                      {nameOf(fromCity, lang) || "—"}
                    </p>
                  </div>

                  <div className="flex w-20 flex-col items-center gap-1 text-center text-[11px] opacity-90 sm:w-28">
                    <span className="whitespace-nowrap">{durationLabel(departISO, arriveISO) || "—"}</span>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                      <span className="h-px w-4 bg-white/40 sm:w-8" />
                      <ModeIcon className="h-4 w-4 shrink-0" />
                      <span className="h-px w-4 bg-white/40 sm:w-8" />
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                    </div>
                    {legs.length > 1 ? (
                      <span
                        className="relative z-10 inline-flex max-w-[7.5rem] items-center gap-1 whitespace-nowrap rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950 sm:max-w-none"
                        title={stops ? stops : undefined}
                      >
                        <span>
                          {legs.length === 2
                            ? t("layover")
                            : `${legs.length - 1} ${t("layovers")}`}
                        </span>
                        {stopCodes && <span className="opacity-80">· {stopCodes}</span>}
                      </span>
                    ) : (
                      <span className="opacity-70">{t("direct")}</span>
                    )}
                  </div>

                  <div className="min-w-0 text-right">
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                      {fmtTime(arriveISO, lang) || "—"}
                      <span className="ml-1 align-top text-xs text-amber-300">{plusDays(departISO, arriveISO)}</span>
                    </p>
                    {showHubCodes && (
                      <div className="mt-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.2em]">
                        {codeOf(toCity)}
                      </div>
                    )}
                    <p className="mt-0.5 truncate text-[11px] opacity-80" title={toCity || undefined}>
                      {nameOf(toCity, lang) || "—"}
                    </p>
                  </div>
                </div>

                {countdown !== null && countdown > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-amber-950">
                    <Clock className="h-3 w-3" />
                    {t(countdown === 1 ? "day_to_departure" : "days_to_departure", { n: countdown })}
                  </div>
                )}
              </>
            )}
          </div>
        </button>
      }
    />
  );
}

function LodgingsBlock({
  tripId, lodgings, tripCities, tripCountries, onDelete,
}: {
  tripId: string;
  lodgings: Array<ItemRow>;
  tripCities: Array<{ name: string; country: string }>;
  tripCountries: string[];
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (lodgings.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("lodging")}
      </h3>
      <div className="space-y-2">
        {lodgings.map((l) => (
          <LodgingCard
            key={l.id}
            item={l}
            tripId={tripId}
            tripCities={tripCities}
            tripCountries={tripCountries}
            onDelete={() => onDelete(l.id)}
          />
        ))}
      </div>
    </section>
  );
}

function LodgingCard({
  item, onDelete, tripId, tripCities, tripCountries,
}: {
  item: ItemRow;
  onDelete: () => void;
  tripId: string;
  tripCities: Array<{ name: string; country: string }>;
  tripCountries: string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const photo = useCityPhoto(item.location);
  return (
    <AddItemDialog
      tripId={tripId}
      tripCities={tripCities}
      tripCountries={tripCountries}
      existing={item}
      trigger={
    <button type="button" className="relative block w-full overflow-hidden rounded-2xl border border-border/40 text-left text-white shadow-soft transition hover:brightness-110">
      <div className="absolute inset-0">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-blue-600" />
        )}
        <div className="absolute inset-0 bg-slate-950/55" />
      </div>
      <div className="relative flex items-start gap-3 p-4">
        <Hotel className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest opacity-80">{t("lodging")}</p>
          <p className="truncate font-medium">{item.title}</p>
          <p className="text-xs opacity-85">
            {item.location && <>{cityNameLocalized(item.location, lang)} · </>}
            {item.start_at && fmtDT(item.start_at, lang)}
            {item.end_at && ` → ${fmtDT(item.end_at, lang)}`}
          </p>
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(); }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white hover:bg-white/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
      }
    />
  );
}

// Extracts the badge code shown on the journey card (e.g. "FCO"). Airport
// legs carry a real IATA code embedded in the saved label —
// "FCO - Roma" or "MXP - Milano Malpensa" — so we read it straight from
// there. Falls back to a heuristic for train/bus/ferry legs, which don't
// carry a code (e.g. "Roma - Termini").
function codeOf(label: string): string {
  const m = label.match(/^([A-Z]{3})\s*-\s*/);
  if (m) return m[1];
  const clean = label.replace(/[^a-zA-Z]/g, "");
  return (clean.slice(0, 3) || "···").toUpperCase();
}
// Strips the leading "IATA - " prefix already shown in the badge above,
// then keeps ONLY the first word of what remains. Saved labels for
// multi-airport cities are "City ShortName" (e.g. "Milano Malpensa",
// "Seoul Incheon") — the narrow column under the badge only has room for
// one short word, so showing the full "City ShortName" string overflows
// and visually collides with the arrival column. The full text is still
// available via the `title` attribute on hover/long-press.
function nameOf(label: string, lang?: string): string {
  const m = label.match(/^[A-Z]{3}\s*-\s*(.+)$/);
  const rest = m ? m[1].trim() : label;
  const firstWord = rest.split(/\s+/)[0] ?? rest;
  const base = firstWord || rest;
  return lang ? cityNameLocalized(base, lang) : base;
}
function fmtTime(iso: string | null, lang?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(iso: string, lang?: string): string {
  return new Date(iso).toLocaleDateString(lang, { weekday: "short", day: "2-digit", month: "short" });
}
function durationLabel(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
function plusDays(a: string | null, b: string | null): string {
  if (!a || !b) return "";
  const da = new Date(a); da.setHours(0, 0, 0, 0);
  const db = new Date(b); db.setHours(0, 0, 0, 0);
  const diff = Math.round((db.getTime() - da.getTime()) / 86_400_000);
  return diff > 0 ? `+${diff}` : "";
}
function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

type TransportMeta = { mode?: TransportMode; legs?: Leg[] };

function TransportLegs({ meta, compact }: { meta: TransportMeta | null; compact?: boolean }) {
  const { i18n } = useTranslation();
  const lang = i18n.language || "it";
  const legs = meta?.legs ?? [];
  if (legs.length === 0) return null;
  if (compact) {
    return (
      <p className="truncate text-xs opacity-90">
        {legs
          .map((l) =>
            [l.from, l.to].filter(Boolean).join(" → ") +
            (l.number ? ` · ${l.carrier ? l.carrier + " " : ""}${l.number}` : l.carrier ? ` · ${l.carrier}` : ""),
          )
          .join(" • ")}
      </p>
    );
  }
  return (
    <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
      {legs.map((l, i) => (
        <li key={i} className="flex gap-2">
          <span className="font-mono opacity-60">{i + 1}.</span>
          <span className="min-w-0">
            <span className="font-medium text-foreground/90">
              {[l.from, l.to].filter(Boolean).join(" → ") || "—"}
            </span>
            {(l.carrier || l.number) && (
              <span className="ml-1.5">· {[l.carrier, l.number].filter(Boolean).join(" ")}</span>
            )}
            {l.depart_at && <span className="ml-1.5">· {fmtDT(l.depart_at, lang)}</span>}
            {l.arrive_at && <span className="ml-1">→ {fmtDT(l.arrive_at, lang)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TransportDialog({
  tripId,
  kind,
  existing,
  trigger,
  tripCountries = [],
}: {
  tripId: string;
  kind: "outbound" | "return";
  existing?: { id: string; meta: TransportMeta | null };
  trigger: React.ReactNode;
  tripCountries?: string[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createFn = useServerFn(createItem);
  const delFn = useServerFn(deleteItem);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TransportMode>((existing?.meta?.mode as TransportMode) ?? "plane");
  const [legs, setLegs] = useState<Leg[]>(
    existing?.meta?.legs && existing.meta.legs.length > 0
      ? existing.meta.legs.map((l) => ({ ...emptyLeg(), ...l }))
      : [emptyLeg()],
  );

  const isStopBased = mode === "train" || mode === "plane";

  function updateLeg(i: number, patch: Partial<Leg>) {
    setLegs((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const first = legs[0];
      const last = legs[legs.length - 1];
      const title = `${MODE_LABEL[mode]} ${[first?.from, last?.to].filter(Boolean).join(" → ") || ""}`.trim();
      if (existing) {
        await delFn({ data: { id: existing.id } });
      }
      await createFn({
        data: {
          trip_id: tripId,
          kind,
          title,
          location: null,
          start_at: first?.depart_at || null,
          end_at: last?.arrive_at || null,
          notes: null,
          position: 0,
          meta: { mode, legs },
        },
      });
      qc.invalidateQueries({ queryKey: ["items", tripId] });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    }
  }

  const fromLabel = mode === "train" ? "Stazione di partenza"
    : mode === "plane" ? "Aeroporto di partenza"
    : mode === "ferry" ? "Porto di partenza"
    : "Punto di partenza";
  const toLabel = mode === "train" ? "Stazione di arrivo"
    : mode === "plane" ? "Aeroporto di arrivo"
    : mode === "ferry" ? "Porto di arrivo"
    : "Punto di arrivo";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(kind)}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Mezzo di trasporto</Label>
            <div className="grid grid-cols-5 gap-1.5">
              {(Object.keys(MODE_LABEL) as TransportMode[]).map((m) => {
                const Icon = MODE_ICON[m];
                const active = m === mode;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {MODE_LABEL[m]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            {legs.map((leg, i) => (
              <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isStopBased ? (legs.length === 1 ? "Tratta" : `Tratta ${i + 1}`) : "Percorso"}
                  </p>
                  {legs.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setLegs((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{fromLabel}</Label>
                    <HubCombobox
                      mode={mode}
                      countries={tripCountries}
                      value={leg.from}
                      onChange={(v) => updateLeg(i, { from: v })}
                      placeholder={fromLabel}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{toLabel}</Label>
                    <HubCombobox
                      mode={mode}
                      countries={tripCountries}
                      value={leg.to}
                      onChange={(v) => updateLeg(i, { to: v })}
                      placeholder={toLabel}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Partenza <span className="opacity-60">(opzionale)</span></Label>
                    <Input
                      type="datetime-local"
                      value={leg.depart_at}
                      onChange={(e) => updateLeg(i, { depart_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Arrivo <span className="opacity-60">(opzionale)</span></Label>
                    <Input
                      type="datetime-local"
                      value={leg.arrive_at}
                      onChange={(e) => updateLeg(i, { arrive_at: e.target.value })}
                    />
                  </div>
                  {(mode === "train" || mode === "plane" || mode === "ferry") && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {mode === "plane" ? "Compagnia aerea" : mode === "train" ? "Operatore" : "Compagnia"}
                        </Label>
                        <Input
                          value={leg.carrier}
                          onChange={(e) => updateLeg(i, { carrier: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {mode === "plane" ? "Numero volo" : mode === "train" ? "Numero treno" : "Numero corsa"}
                        </Label>
                        <Input
                          value={leg.number}
                          onChange={(e) => updateLeg(i, { number: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {isStopBased && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLegs((arr) => [...arr, emptyLeg()])}
                className="w-full"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi scalo
              </Button>
            )}
          </div>

          <div className="flex justify-between gap-2">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  await delFn({ data: { id: existing.id } });
                  qc.invalidateQueries({ queryKey: ["items", tripId] });
                  setOpen(false);
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete_confirm") ? "Elimina" : "Delete"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit">{t("save")}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddItemDialog({
  tripId,
  defaultKind = "activity",
  trigger,
  tripCities = [],
  tripCountries = [],
  existing,
}: {
  tripId: string;
  defaultKind?: (typeof ITEM_KINDS)[number];
  trigger?: React.ReactNode;
  tripCities?: Array<{ name: string; country: string }>;
  tripCountries?: string[];
  existing?: ItemRow;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createFn = useServerFn(createItem);
  const updateFn = useServerFn(updateItem);
  const delFn = useServerFn(deleteItem);
  const [open, setOpen] = useState(false);
  const seedForm = () => ({
    kind: (existing?.kind as (typeof ITEM_KINDS)[number]) ?? defaultKind,
    title: existing?.title ?? "",
    location: existing?.location ?? "",
    start_at: existing?.start_at ? existing.start_at.slice(0, 16) : "",
    end_at: existing?.end_at ? existing.end_at.slice(0, 16) : "",
    notes: existing?.notes ?? "",
  });
  const [form, setForm] = useState(seedForm);
  function handleOpenChange(v: boolean) {
    if (v) setForm(seedForm());
    setOpen(v);
  }
  const [locOpen, setLocOpen] = useState(false);
  const [locQuery, setLocQuery] = useState("");

  const CATEGORY_BUTTONS: { kind: (typeof ITEM_KINDS)[number]; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { kind: "activity", icon: Sparkles, label: t("activity") },
    { kind: "lodging", icon: Hotel, label: t("lodging") },
    { kind: "flight", icon: Plane, label: t("flight") },
    { kind: "train", icon: Train, label: t("train") },
    { kind: "car", icon: Car, label: t("car") },
    { kind: "ferry", icon: Ship, label: t("ferry") },
    { kind: "transfer", icon: ArrowRightLeft, label: t("transfer") },
    { kind: "zone", icon: MapPin, label: t("zone") },
    { kind: "other", icon: MapPin, label: t("other") },
  ];

  const tripKeys = new Set(tripCities.map((c) => `${c.country}|${c.name}`));
  const countryCities = tripCountries.flatMap((iso) => citiesOfCountry(iso));
  const extras = countryCities.filter((c) => !tripKeys.has(`${c.country}|${c.name}`));
  const q = locQuery.trim().toLowerCase();
  const matchTrip = (q ? tripCities.filter((c) => c.name.toLowerCase().includes(q)) : tripCities);
  const matchExtras = (q ? extras.filter((c) => c.name.toLowerCase().includes(q)) : extras).slice(0, 200);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="rounded-full"><Plus className="mr-1.5 h-4 w-4" />{t("add_item")}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? t("edit_trip") : t("add_item")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              if (existing) {
                await updateFn({
                  data: {
                    id: existing.id,
                    patch: {
                      kind: form.kind,
                      title: form.title,
                      location: form.location || null,
                      start_at: form.start_at || null,
                      end_at: form.end_at || null,
                      notes: form.notes || null,
                    },
                  },
                });
              } else {
                await createFn({
                  data: {
                    trip_id: tripId,
                    kind: form.kind,
                    title: form.title,
                    location: form.location || null,
                    start_at: form.start_at || null,
                    end_at: form.end_at || null,
                    notes: form.notes || null,
                    position: 0,
                  },
                });
              }
              qc.invalidateQueries({ queryKey: ["items", tripId] });
              setOpen(false);
              if (!existing) setForm({ ...form, title: "", location: "", start_at: "", end_at: "", notes: "" });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : t("error_generic"));
            }
          }}
        >
          <div className="space-y-1.5">
            <Label>{t("category")}</Label>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {CATEGORY_BUTTONS.map(({ kind, icon: Icon, label }) => {
                const active = form.kind === kind;
                return (
                  <button
                    type="button"
                    key={kind}
                    onClick={() => setForm({ ...form, kind })}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("title")}</Label>
            <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("location")}</Label>
            <Popover open={locOpen} onOpenChange={setLocOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className={cn("truncate", !form.location && "text-muted-foreground")}>
                    {form.location || t("location")}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Cerca o digita…" value={locQuery} onValueChange={setLocQuery} />
                  <CommandList className="max-h-72">
                    {matchTrip.length === 0 && matchExtras.length === 0 && !locQuery && (
                      <CommandEmpty>Nessuna città</CommandEmpty>
                    )}
                    {locQuery && (
                      <CommandGroup heading="Personalizzato">
                        <CommandItem
                          onSelect={() => {
                            setForm({ ...form, location: locQuery.trim() });
                            setLocOpen(false);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          <span>Usa "{locQuery.trim()}"</span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {matchTrip.length > 0 && (
                      <CommandGroup heading="Tappe del viaggio">
                        {matchTrip.map((c) => {
                          const sel = form.location === c.name;
                          return (
                            <CommandItem
                              key={`trip-${c.country}-${c.name}`}
                              value={`trip-${c.country}-${c.name}`}
                              onSelect={() => {
                                setForm({ ...form, location: c.name });
                                setLocOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", sel ? "opacity-100" : "opacity-0")} />
                              <span className="mr-2">{flagOf(c.country)}</span>
                              <span>{c.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                    {matchExtras.length > 0 && (
                      <CommandGroup heading="Altre città">
                        {matchExtras.map((c) => {
                          const sel = form.location === c.name;
                          return (
                            <CommandItem
                              key={`x-${c.country}-${c.name}`}
                              value={`x-${c.country}-${c.name}`}
                              onSelect={() => {
                                setForm({ ...form, location: c.name });
                                setLocOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", sel ? "opacity-100" : "opacity-0")} />
                              <span className="mr-2">{flagOf(c.country)}</span>
                              <span>{c.name}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">{t("starts_at")} <span className="text-xs opacity-70">(opzionale)</span></Label>
              <Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">{t("ends_at")} <span className="text-xs opacity-70">(opzionale)</span></Label>
              <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex items-center justify-between gap-2">
            {existing ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  if (!confirm(t("delete_confirm"))) return;
                  await delFn({ data: { id: existing.id } });
                  qc.invalidateQueries({ queryKey: ["items", tripId] });
                  setOpen(false);
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete_confirm") ? "Elimina" : "Delete"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button type="submit">{t("save")}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmtDT(s: string, lang?: string) {
  const d = new Date(s);
  return d.toLocaleString(lang, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function HubCombobox({
  mode, countries, value, onChange, placeholder,
}: {
  mode: TransportMode;
  countries: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const isPlane = mode === "plane";
  const isHub = mode === "train" || mode === "bus" || mode === "ferry";
  const isCityMode = mode === "car" || mode === "moto";
  const airportsData = useAirports(true);
  const remote = useRemoteHubs(isHub ? modeToKind(mode) : null, isHub ? value : "");

  if (isCityMode) {
    const cityList = countries.flatMap((iso) =>
      citiesOfCountry(iso).map((c) => ({ name: c.name, country: c.country })),
    );
    const q = value.trim().toLowerCase();
    const filteredCities = q
      ? cityList.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 300)
      : cityList.slice(0, 300);
    return (
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder || "Cerca città…"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          autoComplete="off"
        />
        {open && filteredCities.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {filteredCities.map((c, i) => {
              const sel = value === c.name;
              return (
                <button
                  type="button"
                  key={`${c.country}-${c.name}-${i}`}
                  onMouseDown={(e) => { e.preventDefault(); onChange(c.name); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                  <span className="mr-1">{flagOf(c.country)}</span>
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (isPlane) {
    const q = value.trim().toLowerCase();
    const inCountries = airportsForCountries(airportsData, countries);
    const major = inCountries.filter((h) => h.major).slice(0, 30);
    const list: AirportHub[] = showAll ? inCountries : major;
    const matchQuery = (h: AirportHub) => {
      const label = formatAirport(h).toLowerCase();
      if (label === q) return false;
      return (
        h.name.toLowerCase().includes(q) ||
        (h.city ?? "").toLowerCase().includes(q) ||
        h.code.toLowerCase().includes(q)
      );
    };
    let filtered: AirportHub[] = q ? inCountries.filter(matchQuery).slice(0, 80) : list;
    if (q && filtered.length === 0) {
      filtered = airportsSearch(airportsData, value, 80);
    }
    const hiddenCount = inCountries.length - major.length;

    return (
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder || "Cerca aeroporto o IATA…"}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          autoComplete="off"
        />
        {open && (filtered.length > 0 || hiddenCount > 0) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {filtered.length === 0 && !q && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessuna opzione</div>
            )}
            {filtered.length > 0 && (
              <div className="py-1">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {showAll || q ? "Tutte le opzioni" : "Principali"}
                </p>
                {filtered.map((h, i) => {
                  const label = formatAirport(h);
                  const sel = value === label;
                  return (
                    <button
                      type="button"
                      key={`${h.code}-${i}`}
                      onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {!q && !showAll && hiddenCount > 0 && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
              >
                <ChevronsUpDown className="h-4 w-4" />
                <span>Visualizza altri ({hiddenCount})</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!isHub) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  const major: Hub[] = hubsForMode(mode, countries, false);
  const all: Hub[] = hubsForMode(mode, countries, true);
  const allCountries = Object.keys(HUBS);
  const globalHubs: Hub[] = hubsForMode(mode, allCountries, true);
  const list: Hub[] = showAll ? all : major;
  const q = value.trim().toLowerCase();
  const matchQuery = (h: Hub) =>
    [h.name, h.city].filter(Boolean).join(" ").toLowerCase().includes(q) &&
    formatHub(h).toLowerCase() !== q;
  let filtered: Hub[] = q ? all.filter(matchQuery).slice(0, 80) : list;
  if (q && filtered.length === 0) {
    filtered = globalHubs.filter(matchQuery);
  }
  const remoteHubs: Hub[] = (remote.data ?? []).filter(
    (r) => !filtered.some((f) => f.name.toLowerCase() === r.name.toLowerCase() && f.city === r.city),
  );
  const hiddenCount = all.length - major.length;

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder || "Cerca o digita…"}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || hiddenCount > 0 || (q && (remoteHubs.length > 0 || remote.isFetching))) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.length === 0 && !q && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessuna opzione</div>
          )}
          {filtered.length > 0 && (
            <div className="py-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {showAll || q ? "Tutte le opzioni" : "Principali"}
              </p>
              {filtered.map((h, i) => {
                const label = formatHub(h);
                const sel = value === label;
                return (
                  <button
                    type="button"
                    key={`${h.city ?? ""}-${h.name}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{h.city ?? h.name}</span>
                      {h.city && <span className="ml-1.5 text-xs opacity-70">- {h.name}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {q && remoteHubs.length > 0 && (
            <div className="border-t border-border/60 py-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Risultati globali
              </p>
              {remoteHubs.map((h, i) => {
                const label = formatHub(h);
                return (
                  <button
                    type="button"
                    key={`remote-${h.name}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Check className="h-4 w-4 shrink-0 opacity-0" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{h.city ?? h.name}</span>
                      {h.city && <span className="ml-1.5 text-xs opacity-70">- {h.name}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {q && remote.isFetching && remoteHubs.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Ricerca globale…</div>
          )}
          {!q && !showAll && hiddenCount > 0 && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              <ChevronsUpDown className="h-4 w-4" />
              <span>Visualizza altri ({hiddenCount})</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
