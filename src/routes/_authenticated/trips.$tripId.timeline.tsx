import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Train, Car, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2, ChevronsUpDown, Check,
} from "lucide-react";
import { toast } from "sonner";
import { listItems, createItem, deleteItem, ITEM_KINDS } from "@/lib/itinerary.functions";
import { getTrip, updateTrip } from "@/lib/trips.functions";
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

type TransportMode = "car" | "moto" | "train" | "plane" | "ferry";
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
  car: "Auto", moto: "Moto", train: "Treno", plane: "Aereo", ferry: "Traghetto",
};
const MODE_ICON: Record<TransportMode, React.ComponentType<{ className?: string }>> = {
  car: Car, moto: Bike, train: Train, plane: Plane, ferry: Ship,
};

export const Route = createFileRoute("/_authenticated/trips/$tripId/timeline")({
  component: TimelineView,
});

const KIND_ICON: Record<(typeof ITEM_KINDS)[number], React.ComponentType<{ className?: string }>> = {
  outbound: PlaneTakeoff,
  return: PlaneLanding,
  flight: Plane,
  train: Train,
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

function lodgingDateRange(it: { start_at: string | null; end_at: string | null }) {
  const s = it.start_at?.slice(0, 10) ?? null;
  const e = it.end_at?.slice(0, 10) ?? s;
  return { s, e };
}

function TimelineView() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const tripFn = useServerFn(getTrip);
  const itemFn = useServerFn(listItems);
  const updFn = useServerFn(updateTrip);
  const delFn = useServerFn(deleteItem);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });

  if (!trip.data) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const mode = trip.data.timeline_mode;
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

  // Group middle items only in "days" mode. In "activities" mode each item
  // is rendered as a stand-alone full-width card with no sub-sections.
  let groups: { label: string; items: typeof middle }[] = [];
  if (mode === "days") {
    const start = new Date(trip.data.start_date);
    const end = new Date(trip.data.end_date);
    const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    groups = Array.from({ length: dayCount }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      return {
        label: `${t("day_of", { n: i + 1 })} · ${d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" })}`,
        items: middle.filter((it) =>
          it.start_at ? it.start_at.slice(0, 10) === iso : it.day_index === i + 1,
        ),
      };
    });
  }

  async function setMode(m: "days" | "activities") {
    try {
      await updFn({ data: { id: tripId, patch: { timeline_mode: m } } });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  async function del(id: string) {
    if (!confirm(t("delete_confirm"))) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["items", tripId] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full border border-border bg-card p-1 text-xs shadow-soft">
          <button
            className={`rounded-full px-3 py-1.5 transition ${mode === "days" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("days")}
          >{t("by_days")}</button>
          <button
            className={`rounded-full px-3 py-1.5 transition ${mode === "activities" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMode("activities")}
          >{t("by_activities")}</button>
        </div>
        <div className="ml-auto">
          <AddItemDialog tripId={tripId} tripCities={tripCities} tripCountries={tripCountries} />
        </div>
      </div>

      <div className="space-y-3">
        <TripBoundaryRow item={outbound} tripId={tripId} kind="outbound" />

        {mode === "activities" && middle.map((it) => {
          const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? MapPin;
          const cls = kindClasses(it.kind);
          const dark = TRANSPORT_KINDS.has(it.kind) || it.kind === "activity" || it.kind === "lodging";
          return (
            <div
              key={it.id}
              className={cn(
                "flex w-full items-start gap-3 rounded-2xl p-4 shadow-soft border",
                cls.card,
              )}
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => del(it.id)}
                className={cn(dark ? "text-white hover:bg-white/10 hover:text-white" : "")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}

        {mode === "days" && groups.map((g) => {
          // Compute lodging context for this day in days mode.
          let dayIso: string | null = null;
          if (mode === "days") {
            const idx = groups.indexOf(g);
            const start = new Date(trip.data!.start_date);
            dayIso = new Date(start.getTime() + idx * 86400000).toISOString().slice(0, 10);
          }
          const activeLodgings = dayIso
            ? lodgings.filter((l) => {
                const { s, e } = lodgingDateRange(l);
                return s && e && s <= dayIso! && dayIso! <= e;
              })
            : [];
          return (
          <section key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h3>
            {mode === "days" && activeLodgings.map((l) => {
              const { s, e } = lodgingDateRange(l);
              const isFirst = s === dayIso;
              const isLast = e === dayIso;
              if (isFirst) {
                return (
                  <div key={`lodg-${l.id}`} className={cn(
                    "mb-3 flex items-start justify-between gap-3 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 p-3 text-white shadow-soft",
                    !isLast && "rounded-b-none",
                  )}>
                    <div className="flex min-w-0 items-start gap-2">
                      <Hotel className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-widest opacity-80">{t("lodging")}</p>
                        <p className="truncate font-medium">{l.title}</p>
                        <p className="text-xs text-white/80">
                          {l.location && <>{l.location} · </>}
                          {l.start_at && fmtDT(l.start_at)}
                          {l.end_at && ` → ${fmtDT(l.end_at)}`}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => del(l.id)} className="text-white hover:bg-white/10 hover:text-white">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              }
              // Continuation band — small slim strip
              return (
                <div
                  key={`lodg-${l.id}`}
                  aria-hidden
                  className={cn(
                    "mb-3 h-2 bg-gradient-to-br from-indigo-500 to-blue-600",
                    isLast ? "rounded-b-2xl" : "",
                    "rounded-t-none",
                  )}
                  title={l.title}
                />
              );
            })}
            {g.items.filter((it) => it.kind !== "lodging").length === 0 ? (
              activeLodgings.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : null
            ) : (
              <ul className="space-y-3">
                {g.items.filter((it) => it.kind !== "lodging").map((it) => {
                  const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? MapPin;
                  const cls = kindClasses(it.kind);
                  const dark = TRANSPORT_KINDS.has(it.kind) || it.kind === "activity";
                  return (
                    <li key={it.id}>
                      <div className={cn("flex items-start gap-3 rounded-xl p-3", cls.card)}>
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
                        <Button variant="ghost" size="icon" onClick={() => del(it.id)} className={cn(dark ? "text-white hover:bg-white/10 hover:text-white" : "")}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          );
        })}

        <TripBoundaryRow item={ret} tripId={tripId} kind="return" />
      </div>
    </div>
  );
}

function TripBoundaryRow({
  item, tripId, kind,
}: {
  item:
    | {
        id: string;
        title: string;
        location: string | null;
        start_at: string | null;
        meta?: unknown;
      }
    | undefined;
  tripId: string;
  kind: "outbound" | "return";
}) {
  const { t } = useTranslation();
  const meta = (item?.meta ?? null) as TransportMeta | null;
  const ModeIcon = meta?.mode ? MODE_ICON[meta.mode] : kind === "outbound" ? PlaneTakeoff : PlaneLanding;
  return (
    <TransportDialog
      tripId={tripId}
      kind={kind}
      existing={item ? { id: item.id, meta } : undefined}
      trigger={
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-2xl border border-primary/40 bg-warm-gradient p-4 text-left text-primary-foreground shadow-soft transition hover:brightness-105"
        >
          <ModeIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest opacity-90">{t(kind)}</p>
            {item ? (
              <>
                <p className="truncate font-medium">{item.title}</p>
                <TransportLegs meta={meta} compact />
              </>
            ) : (
              <p className="text-sm underline opacity-95">{t("add_item")}</p>
            )}
          </div>
        </button>
      }
    />
  );
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
                    <Label className="text-xs">Partenza</Label>
                    <Input
                      type="datetime-local"
                      value={leg.depart_at}
                      onChange={(e) => updateLeg(i, { depart_at: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Arrivo</Label>
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