import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Train, Bus, Car, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2, ChevronsUpDown, Check, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { listItems, createItem, updateItem, deleteItem, ITEM_KINDS } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { citiesOfCountry, flagOf } from "@/lib/country-data";
import { cn } from "@/lib/utils";
import { useCityPhoto } from "@/hooks/use-city-photo";
import { hubsForMode, formatHub, type Hub } from "@/lib/transport-hubs";

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

// Category groups → visual palettes. Transport and lodging share the warm
// gradient family; activities use a distinct emerald palette; meta items
// (zone/other) stay neutral.
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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tripFn = useServerFn(getTrip);
  const itemFn = useServerFn(listItems);
  const delFn = useServerFn(deleteItem);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });

  if (!trip.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const tripRow = trip.data as typeof trip.data & {
    cities?: Array<{ name: string; country: string }>;
    countries?: string[];
  };
  const tripCities = Array.isArray(tripRow.cities) ? tripRow.cities : [];
  const tripCountries = Array.isArray(tripRow.countries) ? tripRow.countries : [];
  const list = items.data ?? [];
  const outbound = list.find((i) => i.kind === "outbound");
  const ret = list.find((i) => i.kind === "return");
  const middle = list.filter((i) => i.kind !== "outbound" && i.kind !== "return");
  const lodgings = middle.filter((i) => i.kind === "lodging");
  const nonLodging = middle.filter((i) => i.kind !== "lodging");

  // Group only the day-bound items (everything except lodging) by trip day.
  const start = new Date(trip.data.start_date);
  const end = new Date(trip.data.end_date);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  const groups = Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    return {
      label: `${t("day_of", { n: i + 1 })} · ${d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}`,
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
      <div className="mb-4 flex items-center justify-end">
          <AddItemDialog tripId={tripId} tripCities={tripCities} tripCountries={tripCountries} />
      </div>

      <div className="space-y-6">
        <JourneyBlock tripId={tripId} outbound={outbound} ret={ret} />
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
                                  {it.location && <>{it.location} · </>}
                                  {it.start_at && fmtDT(it.start_at)}
                                  {it.end_at && ` → ${fmtDT(it.end_at)}`}
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

type JourneyItem = {
  id: string;
  title: string;
  location: string | null;
  start_at: string | null;
  end_at: string | null;
  meta?: unknown;
};

function JourneyBlock({
  tripId, outbound, ret,
}: { tripId: string; outbound: JourneyItem | undefined; ret: JourneyItem | undefined }) {
  return (
    <div className="space-y-3">
      <JourneyLeg tripId={tripId} kind="outbound" item={outbound} />
      <JourneyLeg tripId={tripId} kind="return" item={ret} />
    </div>
  );
}

function JourneyLeg({
  tripId, kind, item,
}: { tripId: string; kind: "outbound" | "return"; item: JourneyItem | undefined }) {
  const { t } = useTranslation();
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
  const stops = legs.length > 1
    ? legs.slice(0, -1).map((l) => l.to).filter(Boolean).join(", ")
    : "";

  return (
    <TransportDialog
      tripId={tripId}
      kind={kind}
      existing={item ? { id: item.id, meta } : undefined}
      trigger={
        <button
          type="button"
          className="relative block w-full overflow-hidden rounded-2xl border border-border/40 text-left shadow-soft transition hover:brightness-110"
        >
          {/* Split background: from-city photo on the left, to-city photo on the right */}
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
              {departISO && <span className="opacity-80">{fmtDate(departISO)}</span>}
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

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                  <div>
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                      {fmtTime(departISO) || "—"}
                    </p>
                    <div className="mt-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.2em]">
                      {codeOf(fromCity)}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] opacity-80">{fromCity || "—"}</p>
                  </div>

                  <div className="flex flex-col items-center gap-1 text-[11px] opacity-90">
                    <span>{durationLabel(departISO, arriveISO) || "—"}</span>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                      <span className="h-px w-8 bg-white/40 sm:w-12" />
                      <ModeIcon className="h-4 w-4" />
                      <span className="h-px w-8 bg-white/40 sm:w-12" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
                    </div>
                    {legs.length > 1 ? (
                      <span className="rounded-full bg-amber-400/90 px-2 text-[10px] font-semibold text-amber-950">
                        {legs.length - 1} scalo{legs.length > 2 ? "i" : ""}
                        {stops ? ` · ${stops}` : ""}
                      </span>
                    ) : (
                      <span className="opacity-70">diretto</span>
                    )}
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                      {fmtTime(arriveISO) || "—"}
                      <span className="ml-1 align-top text-xs text-amber-300">{plusDays(departISO, arriveISO)}</span>
                    </p>
                    <div className="mt-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.2em]">
                      {codeOf(toCity)}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] opacity-80">{toCity || "—"}</p>
                  </div>
                </div>

                {countdown !== null && countdown > 0 && (
                  <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-amber-950">
                    <Clock className="h-3 w-3" />
                    Fra {countdown} {countdown === 1 ? "giorno" : "giorni"} alla partenza
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
  tripId: _tripId, lodgings, onDelete,
}: {
  tripId: string;
  lodgings: Array<JourneyItem & { kind: string }>;
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
          <LodgingCard key={l.id} item={l} onDelete={() => onDelete(l.id)} />
        ))}
      </div>
    </section>
  );
}

function LodgingCard({
  item, onDelete,
}: { item: JourneyItem; onDelete: () => void }) {
  const { t } = useTranslation();
  const photo = useCityPhoto(item.location);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 text-white shadow-soft">
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
            {item.location && <>{item.location} · </>}
            {item.start_at && fmtDT(item.start_at)}
            {item.end_at && ` → ${fmtDT(item.end_at)}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-white hover:bg-white/10 hover:text-white">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function codeOf(city: string): string {
  const clean = city.replace(/[^a-zA-Z]/g, "");
  return (clean.slice(0, 3) || "···").toUpperCase();
}
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });
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
            {l.depart_at && <span className="ml-1.5">· {fmtDT(l.depart_at)}</span>}
            {l.arrive_at && <span className="ml-1">→ {fmtDT(l.arrive_at)}</span>}
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
}: {
  tripId: string;
  kind: "outbound" | "return";
  existing?: { id: string; meta: TransportMeta | null };
  trigger: React.ReactNode;
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
                    <Input value={leg.from} onChange={(e) => updateLeg(i, { from: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{toLabel}</Label>
                    <Input value={leg.to} onChange={(e) => updateLeg(i, { to: e.target.value })} />
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
}: {
  tripId: string;
  defaultKind?: (typeof ITEM_KINDS)[number];
  trigger?: React.ReactNode;
  tripCities?: Array<{ name: string; country: string }>;
  tripCountries?: string[];
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fn = useServerFn(createItem);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: defaultKind,
    title: "",
    location: "",
    start_at: "",
    end_at: "",
    notes: "",
  });
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

  // Suggested locations: trip cities first, then other cities from same countries.
  const tripKeys = new Set(tripCities.map((c) => `${c.country}|${c.name}`));
  const countryCities = tripCountries.flatMap((iso) => citiesOfCountry(iso));
  const extras = countryCities.filter((c) => !tripKeys.has(`${c.country}|${c.name}`));
  const q = locQuery.trim().toLowerCase();
  const matchTrip = (q ? tripCities.filter((c) => c.name.toLowerCase().includes(q)) : tripCities);
  const matchExtras = (q ? extras.filter((c) => c.name.toLowerCase().includes(q)) : extras).slice(0, 200);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button className="rounded-full"><Plus className="mr-1.5 h-4 w-4" />{t("add_item")}</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("add_item")}</DialogTitle></DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await fn({
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
              qc.invalidateQueries({ queryKey: ["items", tripId] });
              setOpen(false);
              setForm({ ...form, title: "", location: "", start_at: "", end_at: "", notes: "" });
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button type="submit">{t("save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function fmtDT(s: string) {
  const d = new Date(s);
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}