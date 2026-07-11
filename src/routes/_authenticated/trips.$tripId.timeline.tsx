import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Bus, Car, CarTaxiFront, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2, ChevronsUpDown, Check, Clock,
  CalendarDays, Wallet, Pencil, X, Menu, TramFront, TrainFront, Train,
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

type TransportMode = "car" | "moto" | "train" | "plane" | "ferry" | "bus" | "metro" | "tram";
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
type MixedLeg = {
  mode: "train" | "bus" | "metro" | "tram";
  vehicle: string;
  from_stop: string;
  to_stop: string;
  depart_at: string;
  arrive_at: string;
};
const emptyMixedLeg = (): MixedLeg => ({
  mode: "bus", vehicle: "", from_stop: "", to_stop: "", depart_at: "", arrive_at: "",
});
const MODE_ICON: Record<TransportMode, React.ComponentType<{ className?: string }>> = {
  car: Car, moto: Bike, train: TrainFront, plane: Plane, ferry: Ship, bus: Bus, metro: TramFront, tram: Train,
};

export const Route = createFileRoute("/_authenticated/trips/$tripId/timeline")({
  component: TimelineView,
});

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  outbound: PlaneTakeoff,
  return: PlaneLanding,
  flight: Plane,
  train: TrainFront,
  bus: Bus,
  car: Car,
  taxi: CarTaxiFront,
  moto: Bike,
  ferry: Ship,
  transfer: ArrowRightLeft,
  lodging: Hotel,
  activity: Sparkles,
  zone: MapPin,
  other: MapPin,
  metro: TramFront,
  tram: Train,
};

const TRANSPORT_KINDS = new Set([
  "outbound", "return", "flight", "train", "bus", "car", "taxi", "moto", "ferry", "transfer", "metro", "tram",
]);
const STOP_KINDS = new Set(["train", "bus", "metro", "tram"]);
const PT_TRANSIT_KINDS = new Set(["bus", "metro", "tram"]);
const OSM_ROUTE_MODE: Record<string, string> = { bus: "bus", metro: "subway", tram: "tram" };

// ── Caches (module-level, persist across dialog opens) ───────────────────────
const _areaCache = new Map<string, string>();   // city → overpass area snippet
const _lineCache = new Map<string, Array<{ ref: string; name: string }>>();
const _stopCache = new Map<string, string[]>();

// ── Overpass fetch: race several mirrors, first success wins ─────────────────
// The public overpass-api.de instance is frequently slow or rate-limited, which
// is what makes the line search hang. Racing faster mirrors with a hard client
// timeout makes results arrive much sooner and never hang forever.
const OVERPASS_MIRRORS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

async function overpassFetch(
  query: string,
  timeoutMs = 25000,
): Promise<{ elements: Array<{ tags?: Record<string, string> }> }> {
  const body = `data=${encodeURIComponent(query)}`;
  const attempts = OVERPASS_MIRRORS.map((url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { elements: Array<{ tags?: Record<string, string> }> };
      })
      .finally(() => clearTimeout(timer));
  });
  // Promise.any resolves with the first mirror that succeeds; rejects only if all fail.
  return Promise.any(attempts);
}

// Resolve city name → precise Overpass area query via Nominatim
async function getAreaQuery(city: string): Promise<string> {
  if (_areaCache.has(city)) return _areaCache.get(city)!;
  try {
    // NB: browsers forbid setting a custom User-Agent on fetch (it is silently
    // stripped), so we don't try — Accept is enough for Nominatim.
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=5&addressdetails=0`,
      { headers: { Accept: "application/json" } },
    );
    const hits = await r.json() as Array<{ osm_type: string; osm_id: string; class: string; type: string }>;
    // Prefer administrative boundary relations (cities, municipalities)
    const rel =
      hits.find(h => h.osm_type === "relation" && h.class === "boundary" && h.type === "administrative") ??
      hits.find(h => h.osm_type === "relation" && ["place", "boundary"].includes(h.class));
    if (rel) {
      const q = `area(${3600000000 + parseInt(rel.osm_id)})->.c`;
      _areaCache.set(city, q); return q;
    }
  } catch { /* fall through */ }
  const fallback = `area["name"="${city}"]["boundary"="administrative"]->.c`;
  _areaCache.set(city, fallback); return fallback;
}

async function fetchTransitLines(city: string, osmMode: string): Promise<Array<{ ref: string; name: string }>> {
  const key = `${city}|${osmMode}`;
  if (_lineCache.has(key)) return _lineCache.get(key)!;
  const areaQ = await getAreaQuery(city);
  // Metro: OSM uses both "subway" (international) and "metro" (some countries like Hungary, France).
  // Query both to maximise coverage.
  const modes = osmMode === "subway" ? ["subway", "metro"] : [osmMode];
  const clauses = modes.flatMap(m => [
    `relation["type"="route_master"]["route_master"="${m}"](area.c)`,
    `relation["type"="route"]["route"="${m}"](area.c)`,
  ]).join(";");
  const q = `[out:json][timeout:40];${areaQ};(${clauses};);out tags;`;
  const data = await overpassFetch(q) as { elements: Array<{ tags: Record<string, string> }> };
  const seen = new Set<string>();
  const lines: Array<{ ref: string; name: string }> = [];
  for (const el of data.elements) {
    const ref = el.tags?.ref ?? "";
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    lines.push({ ref, name: el.tags?.name ?? ref });
  }
  lines.sort((a, b) => {
    const na = parseFloat(a.ref), nb = parseFloat(b.ref);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.ref.localeCompare(b.ref);
  });
  _lineCache.set(key, lines);
  return lines;
}

async function fetchLineStops(city: string, osmMode: string, lineRef: string): Promise<string[]> {
  const key = `${city}|${osmMode}|${lineRef}`;
  if (_stopCache.has(key)) return _stopCache.get(key)!;
  const areaQ = await getAreaQuery(city);
  // Same dual-mode handling as fetchTransitLines for consistency
  const modes = osmMode === "subway" ? ["subway", "metro"] : [osmMode];
  const routeClauses = modes.map(m =>
    `relation["type"="route"]["route"="${m}"]["ref"="${lineRef}"](area.c)`
  ).join(";");
  // Fetch the matching route relation(s) with their ORDERED members, plus the
  // tags of every member node/way so we can resolve stop names. The member
  // lookups (node(r.r)/way(r.r)) are NOT limited to the search area, so a route
  // that leaves the city (e.g. a bus crossing into other towns) keeps every
  // stop from the first to the last. Bus routes expose stops as "platform"
  // members — often ways — not just "stop" nodes, so we read both.
  const q = `[out:json][timeout:60];${areaQ};(${routeClauses};)->.r;.r out body;node(r.r);out tags;way(r.r);out tags;`;
  const data = await overpassFetch(q) as {
    elements: Array<{
      type: string;
      id: number;
      tags?: Record<string, string>;
      members?: Array<{ type: string; ref: number; role: string }>;
    }>;
  };
  // Resolve member id → official stop name (keyed by type-initial + id)
  const nameById = new Map<string, string>();
  const relations: Array<Array<{ type: string; ref: number; role: string }>> = [];
  for (const el of data.elements) {
    if (el.type === "relation" && el.members) relations.push(el.members);
    else if ((el.type === "node" || el.type === "way") && el.tags?.name) {
      nameById.set(`${el.type[0]}${el.id}`, el.tags.name);
    }
  }
  // Pick the route variant that yields the most named stops (usually the full
  // one-way itinerary), preserving the order the members appear in.
  const isStopRole = (role: string) => role.startsWith("stop") || role.startsWith("platform");
  let best: string[] = [];
  for (const members of relations) {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const m of members) {
      if (!isStopRole(m.role)) continue;
      const nm = nameById.get(`${m.type[0]}${m.ref}`);
      if (!nm) continue;
      const k = nm.toLowerCase();
      if (seen.has(k)) continue; // collapse stop_position + platform of the same stop
      seen.add(k); names.push(nm);
    }
    if (names.length > best.length) best = names;
  }
  _stopCache.set(key, best);
  return best;
}

const TRANSIT_COLOR_ACTIVE: Record<string, string> = {
  train: "border-amber-500 bg-amber-500 text-white",
  bus:   "border-sky-500 bg-sky-500 text-white",
  metro: "border-violet-500 bg-violet-500 text-white",
  tram:  "border-emerald-500 bg-emerald-500 text-white",
};
const TRANSIT_COLOR_INACTIVE: Record<string, string> = {
  train: "border-amber-400/40 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20",
  bus:   "border-sky-400/40 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20",
  metro: "border-violet-400/40 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20",
  tram:  "border-emerald-400/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20",
};
const TRANSIT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  train: TrainFront,
  bus:   Bus,
  metro: TramFront,
  tram:  Train,
};
// Colour per transit mode — mirrors the edit screen's mode picker
// (amber/sky/violet/emerald) so the timeline legs match those colours.
const TRANSIT_TEXT: Record<string, string> = {
  train: "text-amber-500",
  bus:   "text-sky-500",
  metro: "text-violet-500",
  tram:  "text-emerald-500",
};

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
    dot: "bg-rose-500 text-white",
  };
}

// Auto-scrolling text: if the content is wider than its container it slides
// back and forth (ping-pong) so long stop names stay fully readable; if it
// fits, it stays put.
function ScrollText({ children, className }: { children: React.ReactNode; className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useEffect(() => {
    if (typeof document !== "undefined" && !document.getElementById("marquee-pingpong-style")) {
      const s = document.createElement("style");
      s.id = "marquee-pingpong-style";
      s.textContent = "@keyframes marquee-pingpong{from{transform:translateX(0)}to{transform:translateX(var(--marquee-shift))}}";
      document.head.appendChild(s);
    }
    const measure = () => {
      const box = boxRef.current, txt = textRef.current;
      if (!box || !txt) return;
      const diff = txt.scrollWidth - box.clientWidth;
      setShift(diff > 4 ? diff : 0);
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      if (boxRef.current) ro.observe(boxRef.current);
      if (textRef.current) ro.observe(textRef.current);
    }
    return () => ro?.disconnect();
  }, [children]);
  return (
    <span ref={boxRef} className={cn("block overflow-hidden whitespace-nowrap", className)}>
      <span
        ref={textRef}
        className="inline-block will-change-transform"
        style={shift ? ({
          animationName: "marquee-pingpong",
          animationDuration: `${Math.max(4, shift / 25)}s`,
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
          animationDirection: "alternate",
          ["--marquee-shift" as string]: `-${shift}px`,
        } as React.CSSProperties) : undefined}
      >
        {children}
      </span>
    </span>
  );
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

  const isWishlist = trip.data.start_date >= "2099-01-01";
  const maxDayIndex = nonLodging.reduce((m, it) => Math.max(m, it.day_index ?? 0), 0);

  type DayGroup = { label: string; dayIndex: number | null; isoDate?: string; items: ItemRow[] };
  const groups: DayGroup[] = isWishlist
    ? Array.from({ length: Math.max(1, maxDayIndex) }, (_, i) => ({
        label: t("day_of", { n: i + 1 }).toUpperCase(),
        dayIndex: i + 1,
        items: nonLodging.filter((it) => it.day_index === i + 1),
      }))
    : (() => {
        const start = new Date(trip.data.start_date + "T12:00:00");
        const end = new Date(trip.data.end_date + "T12:00:00");
        const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
        return Array.from({ length: dayCount }, (_, i) => {
          const d = new Date(start.getTime() + i * 86400000);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          return {
            label: `${t("day_of", { n: i + 1 })} · ${d.toLocaleDateString(lang, { weekday: "short", day: "2-digit", month: "short" })}`,
            dayIndex: i + 1,
            isoDate: iso,
            items: nonLodging.filter((it) =>
              it.start_at ? it.start_at.slice(0, 10) === iso : it.day_index === i + 1,
            ),
          };
        });
      })();

  async function del(id: string) {
    if (!confirm(t("delete_confirm"))) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["items", tripId] });
  }

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ItemRow | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`completed_${tripId}`);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch { return new Set(); }
  });

  function toggleCompleted(id: string) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      try { localStorage.setItem(`completed_${tripId}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  return (
    <div>
      <TripStats trip={trip.data} expenses={expenses.data ?? []} homeCcy={profile.data?.home_currency ?? "EUR"} isWishlist={isWishlist} wishlistDays={maxDayIndex} />

      <div className="space-y-6">
        <JourneyBlock tripId={tripId} outbound={outbound} ret={ret} tripCountries={hubCountries} />
        <LodgingsBlock tripId={tripId} lodgings={lodgings} tripCities={tripCities} tripCountries={tripCountries} onDelete={del} />

        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h3>
                <AddItemDialog
                  tripId={tripId}
                  tripCities={tripCities}
                  tripCountries={tripCountries}
                  isWishlist={isWishlist}
                  maxDayIndex={maxDayIndex}
                  defaultDayIndex={g.dayIndex}
                  defaultStartDate={g.isoDate ?? null}
                  trigger={
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20"
                      aria-label={t("add_activity")}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  }
                />
              </div>
              {g.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {g.items.map((it) => {
                    const Icon = KIND_ICON[it.kind as keyof typeof KIND_ICON] ?? MapPin;
                    const cls = kindClasses(it.kind);
                    const done = completedIds.has(it.id);
                    const stopMeta = it.meta as { from_stop?: string; to_stop?: string } | null;
                    const mixedLegs = (it.meta as { mixed_legs?: MixedLeg[] } | null)?.mixed_legs ?? [];
                    const menuOpen = openMenuId === it.id;
                    return (
                      <li key={it.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          {/* Kind icon in a coloured circle — sized to match the time */}
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", cls.dot)}>
                            <Icon className="h-4 w-4" />
                          </div>

                          {(fmtTime(it.start_at) || fmtTime(it.end_at)) && (
                            <div className="shrink-0 leading-none">
                              <p className="font-mono text-base font-bold tabular-nums tracking-tight">
                                {fmtTime(it.start_at) || fmtTime(it.end_at)}
                              </p>
                              {fmtTime(it.start_at) && fmtTime(it.end_at) && (
                                <p className="text-xs font-medium tabular-nums text-foreground">
                                  → {fmtTime(it.end_at)}
                                </p>
                              )}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            {(it.kind === "outbound" || it.kind === "return") && (
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t(it.kind)}</p>
                            )}
                            <p className="font-medium leading-snug">{it.title}</p>
                            {it.location && (
                              <p className="text-xs text-muted-foreground">{cityNameLocalized(it.location, lang)}</p>
                            )}
                            {mixedLegs.length === 0 && STOP_KINDS.has(it.kind) && stopMeta?.from_stop && (
                              <ScrollText className="text-xs text-muted-foreground">
                                {stopMeta.from_stop}{stopMeta.to_stop ? ` → ${stopMeta.to_stop}` : ""}
                              </ScrollText>
                            )}
                            {it.notes && <p className="mt-1 text-xs text-muted-foreground">{it.notes}</p>}
                            <TransportLegs meta={it.meta as TransportMeta | null} />
                          </div>

                          {/* Actions — hamburger menu; once completed it becomes the green check */}
                          <div className="relative shrink-0">
                            {done ? (
                              <button
                                type="button"
                                onClick={() => toggleCompleted(it.id)}
                                aria-label={t("completed")}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 transition dark:text-emerald-400"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setOpenMenuId(menuOpen ? null : it.id)}
                                aria-label={t("edit")}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/8 text-foreground/60 transition hover:bg-foreground/15"
                              >
                                <Menu className="h-4 w-4" />
                              </button>
                            )}
                            {menuOpen && !done && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                                <div className="absolute right-0 top-9 z-30 w-40 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                                  <button
                                    type="button"
                                    onClick={() => { toggleCompleted(it.id); setOpenMenuId(null); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                                  >
                                    <Check className="h-4 w-4 text-emerald-500" /> {t("completed")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setOpenMenuId(null); setEditItem(it as ItemRow); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent"
                                  >
                                    <Pencil className="h-4 w-4" /> {t("edit")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setOpenMenuId(null); del(it.id); }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                                  >
                                    <X className="h-4 w-4" /> {t("delete")}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Vehicle legs — each on its own row: coloured mode icon
                            beside its line/stops, highlighted in the mode colour */}
                        {mixedLegs.length > 0 && (
                          // One shared grid for all legs → line refs, times and
                          // stops line up in fixed columns (no jagged in/out).
                          <div className="mt-2 grid grid-cols-[auto_auto_1fr] items-start gap-x-2 gap-y-1 text-xs">
                            {mixedLegs.map((leg, i) => {
                              const LIcon = TRANSIT_ICON[leg.mode] ?? Bus;
                              const color = TRANSIT_TEXT[leg.mode] ?? "text-muted-foreground";
                              return (
                                <Fragment key={i}>
                                  {/* Column 1 — icon + line ref */}
                                  <div className="flex items-center gap-1.5">
                                    <LIcon className={cn("h-4 w-4 shrink-0", color)} />
                                    {leg.vehicle && <span className={cn("font-semibold", color)}>{leg.vehicle}</span>}
                                  </div>
                                  {/* Column 2 — departure time */}
                                  <div className="tabular-nums text-muted-foreground">{leg.depart_at || ""}</div>
                                  {/* Column 3 — boarding + alighting stops, stacked */}
                                  <div className="min-w-0 space-y-0.5 text-muted-foreground">
                                    {leg.from_stop && <ScrollText>{leg.from_stop}</ScrollText>}
                                    {leg.to_stop && <ScrollText>→ {leg.to_stop}</ScrollText>}
                                  </div>
                                </Fragment>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>

        {editItem && (
          <AddItemDialog
            tripId={tripId}
            tripCities={tripCities}
            tripCountries={tripCountries}
            existing={editItem}
            isWishlist={isWishlist}
            maxDayIndex={maxDayIndex}
            open
            onOpenChange={(v) => { if (!v) setEditItem(null); }}
          />
        )}
      </div>
    </div>
  );
}

function TripStats({
  trip,
  expenses,
  homeCcy,
  isWishlist,
  wishlistDays,
}: {
  trip: { start_date: string; end_date: string };
  expenses: Array<{ amount: number; amount_home: number | null; currency: string }>;
  homeCcy: string;
  isWishlist?: boolean;
  wishlistDays?: number;
}) {
  const { t } = useTranslation();
  const days = isWishlist
    ? (wishlistDays ?? 0)
    : Math.max(
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
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{isWishlist ? t("planned_label") : t("duration")}</p>
        <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">
          {isWishlist ? (days > 0 ? `${days} ${t("nights")}` : "—") : `${days} ${t("nights")}`}
        </p>
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
  // Load airports for IATA lookup (handles legs stored before the IATA-prefix format was introduced)
  const airportsData = useAirports(showHubCodes);
  const airports = useMemo(
    () => (airportsData && tripCountries.length > 0 ? airportsForCountries(airportsData, tripCountries) : []),
    [airportsData, tripCountries],
  );
  const stops = legs.length > 1
    ? legs.slice(0, -1).map((l) => l.to).filter(Boolean).map((s) => nameOf(s, lang)).join(", ")
    : "";
  const stopCodes = legs.length > 1 && showHubCodes
    ? legs.slice(0, -1).map((l) => l.to).filter(Boolean).map((s) => codeOf(s, airports)).join(" · ")
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

                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
                      {fmtTime(departISO, lang) || "—"}
                    </p>
                    {showHubCodes && (
                      <div className="mt-1 inline-block rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.2em]">
                        {codeOf(fromCity, airports)}
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] opacity-80 leading-tight" title={fromCity || undefined}>
                      {nameOf(fromCity, lang) || "—"}
                    </p>
                  </div>

                  <div className="flex w-20 flex-col items-center gap-1 self-center text-center text-[11px] opacity-90 sm:w-28">
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
                          {`${legs.length - 1} ${legs.length === 2 ? t("layover") : t("layovers")}`}
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
                        {codeOf(toCity, airports)}
                      </div>
                    )}
                    <p className="mt-0.5 text-[11px] opacity-80 leading-tight" title={toCity || undefined}>
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
function codeOf(label: string, airports?: AirportHub[]): string {
  // Current format: "BLQ - Bologna" or "BLQ - Milano Malpensa"
  const m = label.match(/^([A-Z]{3})\s*-\s*/);
  if (m) return m[1];
  // Format with trailing IATA in parens: "Bologna Guglielmo Marconi Airport (BLQ)"
  const m2 = label.match(/\(([A-Z]{3})\)\s*$/);
  if (m2) return m2[1];
  // Fallback: look up IATA code by city/airport name (for legs saved before the IATA-prefix format)
  if (airports && airports.length > 0) {
    const q = label.trim().toLowerCase();
    // Try exact city match or airport name includes
    const hit =
      airports.find((a) => (a.city ?? "").toLowerCase() === q) ??
      airports.find((a) => a.name.toLowerCase().includes(q));
    if (hit) return hit.code;
    // Old "City - Name" format (e.g. "Bologna - Guglielmo Marconi"):
    // extract the city part before the first " - " and try again.
    const dashIdx = q.indexOf(" - ");
    if (dashIdx > 0) {
      const cityPart = q.slice(0, dashIdx).trim();
      const hit2 = airports.find((a) => (a.city ?? "").toLowerCase() === cityPart);
      if (hit2) return hit2.code;
    }
  }
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
  // Strip leading IATA prefix: "BLQ - Bologna..."
  const m = label.match(/^[A-Z]{3}\s*-\s*(.+)$/);
  const rest1 = m ? m[1].trim() : label;
  // Strip trailing IATA in parens: "Bologna Airport (BLQ)" → "Bologna Airport"
  const rest = rest1.replace(/\s*\([A-Z]{3}\)\s*$/, "").trim();
  // Localize the city component (first word) while preserving the airport
  // qualifier (e.g. "Malpensa", "Incheon") so multi-airport cities are clear.
  const parts = rest.split(/\s+/);
  const city = lang ? cityNameLocalized(parts[0] ?? rest, lang) : (parts[0] ?? rest);
  return parts.length > 1 ? `${city} ${parts.slice(1).join(" ")}` : city;
}
// Extract HH:MM directly from ISO string — avoids browser timezone conversion
// so the time shown is exactly what the user entered (destination-local time).
// Returns "" if no time was set (stored as 00:00).
function fmtTime(iso: string | null, _lang?: string): string {
  if (!iso) return "";
  const t = iso.slice(11, 16);
  if (!t || t === "00:00") return "";
  return t;
}
function fmtDate(iso: string, lang?: string): string {
  const datePart = iso.slice(0, 10);
  if (!datePart) return "";
  // Use noon to avoid DST-related date shifts when converting to local calendar
  return new Date(`${datePart}T12:00:00`).toLocaleDateString(lang, { weekday: "short", day: "2-digit", month: "short" });
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
  const da = new Date(`${a.slice(0, 10)}T12:00:00`); da.setHours(0, 0, 0, 0);
  const db = new Date(`${b.slice(0, 10)}T12:00:00`); db.setHours(0, 0, 0, 0);
  const diff = Math.round((db.getTime() - da.getTime()) / 86_400_000);
  return diff > 0 ? `+${diff}` : "";
}
function daysUntil(iso: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`); d.setHours(0, 0, 0, 0);
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

  const isStopBased = mode === "train" || mode === "plane" || mode === "metro" || mode === "tram";

  function updateLeg(i: number, patch: Partial<Leg>) {
    setLegs((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const first = legs[0];
      const last = legs[legs.length - 1];
      const title = `${t(`mode_${mode}`)} ${[first?.from, last?.to].filter(Boolean).join(" → ") || ""}`.trim();
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

  const fromLabel = (mode === "train" || mode === "metro" || mode === "tram") ? t("from_station")
    : mode === "plane" ? t("from_airport")
    : mode === "ferry" ? t("from_port")
    : t("from_point");
  const toLabel = (mode === "train" || mode === "metro" || mode === "tram") ? t("to_station")
    : mode === "plane" ? t("to_airport")
    : mode === "ferry" ? t("to_port")
    : t("to_point");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(kind)}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>{t("transport_mode")}</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {(Object.keys(MODE_ICON) as TransportMode[]).map((m) => {
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
                    {t(`mode_${m}`)}
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
                    {isStopBased ? (legs.length === 1 ? t("leg") : `${t("leg")} ${i + 1}`) : t("route")}
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
                    <Label className="text-xs">{t("depart_date")} <span className="opacity-60">{t("optional")}</span></Label>
                    <Input
                      type="date"
                      value={leg.depart_at ? leg.depart_at.slice(0, 10) : ""}
                      onChange={(e) => {
                        const date = e.target.value;
                        const time = leg.depart_at ? leg.depart_at.slice(11, 16) : "";
                        updateLeg(i, { depart_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("depart_time")} <span className="opacity-60">{t("optional")}</span></Label>
                    <Input
                      type="time"
                      value={leg.depart_at && leg.depart_at.slice(11, 16) !== "00:00" ? leg.depart_at.slice(11, 16) : ""}
                      onChange={(e) => {
                        const time = e.target.value;
                        const date = leg.depart_at ? leg.depart_at.slice(0, 10) : "";
                        updateLeg(i, { depart_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("arrive_date")} <span className="opacity-60">{t("optional")}</span></Label>
                    <Input
                      type="date"
                      value={leg.arrive_at ? leg.arrive_at.slice(0, 10) : ""}
                      onChange={(e) => {
                        const date = e.target.value;
                        const time = leg.arrive_at ? leg.arrive_at.slice(11, 16) : "";
                        updateLeg(i, { arrive_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("arrive_time")} <span className="opacity-60">{t("optional")}</span></Label>
                    <Input
                      type="time"
                      value={leg.arrive_at && leg.arrive_at.slice(11, 16) !== "00:00" ? leg.arrive_at.slice(11, 16) : ""}
                      onChange={(e) => {
                        const time = e.target.value;
                        const date = leg.arrive_at ? leg.arrive_at.slice(0, 10) : "";
                        updateLeg(i, { arrive_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  {(mode === "train" || mode === "plane" || mode === "ferry") && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {mode === "plane" ? t("airline") : mode === "train" ? t("operator_label") : t("company")}
                        </Label>
                        <Input
                          value={leg.carrier}
                          onChange={(e) => updateLeg(i, { carrier: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {mode === "plane" ? t("flight_number") : mode === "train" ? t("train_number") : t("service_number")}
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
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("add_layover")}
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
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete")}
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
  isWishlist = false,
  maxDayIndex = 0,
  defaultDayIndex = null,
  defaultStartDate = null,
  open: controlledOpen,
  onOpenChange,
}: {
  tripId: string;
  defaultKind?: (typeof ITEM_KINDS)[number];
  trigger?: React.ReactNode;
  tripCities?: Array<{ name: string; country: string }>;
  tripCountries?: string[];
  existing?: ItemRow;
  isWishlist?: boolean;
  maxDayIndex?: number;
  defaultDayIndex?: number | null;
  defaultStartDate?: string | null;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const createFn = useServerFn(createItem);
  const updateFn = useServerFn(updateItem);
  const delFn = useServerFn(deleteItem);
  const [openState, setOpenState] = useState(false);
  const open = controlledOpen ?? openState;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setOpenState(v); };
  const seedForm = () => {
    const exMeta = existing?.meta as { from_stop?: string; to_stop?: string; mixed_legs?: MixedLeg[] } | null;
    const exLegs = exMeta?.mixed_legs;
    const isMulti = !!exLegs && exLegs.length > 0;
    const exKind = (existing?.kind as (typeof ITEM_KINDS)[number]) ?? defaultKind;
    return {
      kind: exKind,
      title: existing?.title ?? "",
      location: existing?.location ?? "",
      start_at: existing?.start_at ? existing.start_at.slice(0, 16) : (defaultStartDate ? `${defaultStartDate}T00:00` : ""),
      end_at: existing?.end_at ? existing.end_at.slice(0, 16) : "",
      notes: existing?.notes ?? "",
      day_index: existing?.day_index ?? defaultDayIndex ?? null as number | null,
      from_stop: !isMulti ? (exMeta?.from_stop ?? "") : "",
      to_stop: !isMulti ? (exMeta?.to_stop ?? "") : "",
      selectedTransit: (isMulti
        ? [...new Set(exLegs.map((l) => l.mode))]
        : STOP_KINDS.has(exKind) ? [exKind] : []) as string[],
      mixedLegs: isMulti ? [...exLegs] : [] as MixedLeg[],
    };
  };
  const [form, setForm] = useState(seedForm);

  // ── Transit stop data for single-mode PT (populated after line selection) ─
  const [selectedLineRef, setSelectedLineRef] = useState("");
  const [transitStops, setTransitStops] = useState<string[]>([]);
  const [transitStopsLoading, setTransitStopsLoading] = useState(false);

  const singlePTMode = form.selectedTransit.length === 1 && PT_TRANSIT_KINDS.has(form.selectedTransit[0])
    ? form.selectedTransit[0]
    : null;

  // Fetch stops when a line ref is selected (single-mode only)
  useEffect(() => {
    if (!selectedLineRef || !singlePTMode || !form.location) { setTransitStops([]); return; }
    let cancelled = false;
    setTransitStopsLoading(true);
    setTransitStops([]);
    fetchLineStops(form.location, OSM_ROUTE_MODE[singlePTMode], selectedLineRef)
      .then(stops => { if (!cancelled) setTransitStops(stops); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTransitStopsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedLineRef]); // eslint-disable-line

  function handleOpenChange(v: boolean) {
    if (v) {
      setForm(seedForm());
      setSelectedLineRef(""); setTransitStops([]);
    }
    setOpen(v);
  }
  const [locOpen, setLocOpen] = useState(false);
  const [locQuery, setLocQuery] = useState("");

  type CatBtn = { kind: (typeof ITEM_KINDS)[number]; icon: React.ComponentType<{ className?: string }>; label: string };
  const ACTIVITY_CATS: CatBtn[] = [
    { kind: "activity", icon: Sparkles, label: t("activity") },
    { kind: "zone", icon: MapPin, label: t("zone") },
    { kind: "lodging", icon: Hotel, label: t("lodging") },
    { kind: "other", icon: MapPin, label: t("other") },
  ];
  const TRANSPORT_CATS: CatBtn[] = [
    { kind: "flight", icon: Plane, label: t("flight") },
    { kind: "train", icon: TrainFront, label: t("train") },
    { kind: "bus", icon: Bus, label: t("bus") },
    { kind: "metro" as (typeof ITEM_KINDS)[number], icon: TramFront, label: t("metro") },
    { kind: "tram" as (typeof ITEM_KINDS)[number], icon: Train, label: t("tram") },
    { kind: "car", icon: Car, label: t("car") },
    { kind: "taxi" as (typeof ITEM_KINDS)[number], icon: CarTaxiFront, label: t("taxi") },
    { kind: "moto" as (typeof ITEM_KINDS)[number], icon: Bike, label: t("moto") },
    { kind: "ferry", icon: Ship, label: t("ferry") },
  ];

  const isMultiModal = form.selectedTransit.length >= 2;
  const addMixedLeg = () => setForm((f) => ({
    ...f,
    mixedLegs: [...f.mixedLegs, { ...emptyMixedLeg(), mode: (f.selectedTransit[0] ?? "bus") as MixedLeg["mode"] }],
  }));
  const removeMixedLeg = (i: number) => setForm((f) => ({ ...f, mixedLegs: f.mixedLegs.filter((_, idx) => idx !== i) }));
  const updateMixedLeg = (i: number, patch: Partial<MixedLeg>) =>
    setForm((f) => ({ ...f, mixedLegs: f.mixedLegs.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const tripKeys = new Set(tripCities.map((c) => `${c.country}|${c.name}`));
  const countryCities = tripCountries.flatMap((iso) => citiesOfCountry(iso));
  const extras = countryCities.filter((c) => !tripKeys.has(`${c.country}|${c.name}`));
  const q = locQuery.trim().toLowerCase();
  const matchTrip = (q ? tripCities.filter((c) => c.name.toLowerCase().includes(q)) : tripCities);
  const matchExtras = (q ? extras.filter((c) => c.name.toLowerCase().includes(q)) : extras).slice(0, 200);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {(trigger !== undefined || controlledOpen === undefined) && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button className="rounded-full"><Plus className="mr-1.5 h-4 w-4" />{t("add_item")}</Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-3 pt-5">
          <DialogTitle>{existing ? t("edit_trip") : t("add_item")}</DialogTitle>
        </DialogHeader>
        <form
          id="add-item-form"
          className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto px-5 pb-5 pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const submitKind = (isMultiModal
                ? "transfer"
                : form.selectedTransit.length === 1
                  ? form.selectedTransit[0]
                  : form.kind) as (typeof ITEM_KINDS)[number];
              const meta = isMultiModal
                ? { mixed_legs: form.mixedLegs }
                : STOP_KINDS.has(submitKind)
                  ? { from_stop: form.from_stop || null, to_stop: form.to_stop || null }
                  : undefined;
              // Se manca start_at ma c'è il depart_at della prima tratta, usalo
              const firstLegDepart = isMultiModal ? (form.mixedLegs[0]?.depart_at ?? "") : "";
              const lastLegArrive = isMultiModal ? (form.mixedLegs[form.mixedLegs.length - 1]?.arrive_at ?? "") : "";
              const resolvedStartAt = form.start_at || firstLegDepart || null;
              const resolvedEndAt = form.end_at || lastLegArrive || null;
              if (existing) {
                await updateFn({
                  data: {
                    id: existing.id,
                    patch: {
                      kind: submitKind,
                      title: form.title,
                      location: form.location || null,
                      start_at: isWishlist ? null : resolvedStartAt,
                      end_at: isWishlist ? null : resolvedEndAt,
                      notes: form.notes || null,
                      ...(isWishlist ? { day_index: form.day_index } : {}),
                      ...(meta !== undefined ? { meta } : {}),
                    },
                  },
                });
              } else {
                await createFn({
                  data: {
                    trip_id: tripId,
                    kind: submitKind,
                    title: form.title,
                    location: form.location || null,
                    start_at: isWishlist ? null : resolvedStartAt,
                    end_at: isWishlist ? null : resolvedEndAt,
                    notes: form.notes || null,
                    position: 0,
                    day_index: form.day_index ?? null,
                    ...(meta !== undefined ? { meta } : {}),
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
          <div className="space-y-3">
            {isMultiModal && (
              <p className="text-[10px] font-medium text-primary opacity-80">✕ {t("multi_modal")}</p>
            )}
            {([
              { label: t("activity"), cats: ACTIVITY_CATS },
              { label: t("transport"), cats: TRANSPORT_CATS },
            ] as { label: string; cats: CatBtn[] }[]).map(({ label: groupLabel, cats }) => (
              <div key={groupLabel}>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {groupLabel}
                </p>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
                  {cats.map(({ kind, icon: Icon, label }) => {
                    const isTransit = STOP_KINDS.has(kind);
                    const active = isTransit
                      ? form.selectedTransit.includes(kind)
                      : (form.kind === kind && form.selectedTransit.length === 0);
                    return (
                      <button
                        type="button"
                        key={kind}
                        onClick={() => {
                          if (isTransit) {
                            const already = form.selectedTransit.includes(kind);
                            const nextTransit = already
                              ? form.selectedTransit.filter((m) => m !== kind)
                              : [...form.selectedTransit, kind];
                            const nextMulti = nextTransit.length >= 2;
                            setForm((f) => ({
                              ...f,
                              kind: nextTransit.length === 1
                                ? nextTransit[0] as (typeof ITEM_KINDS)[number]
                                : nextTransit.length === 0 ? "activity" : f.kind,
                              selectedTransit: nextTransit,
                              mixedLegs: nextMulti && f.mixedLegs.length < 2
                                ? nextTransit.slice(0, 2).map((m) => ({ ...emptyMixedLeg(), mode: m as MixedLeg["mode"] }))
                                : !nextMulti ? [] : f.mixedLegs,
                            }));
                          } else {
                            setForm((f) => ({ ...f, kind, selectedTransit: [], mixedLegs: [] }));
                          }
                        }}
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
            ))}
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
                  <CommandInput placeholder={t("search_type")} value={locQuery} onValueChange={setLocQuery} />
                  <CommandList className="max-h-72">
                    {matchTrip.length === 0 && matchExtras.length === 0 && !locQuery && (
                      <CommandEmpty>{t("no_cities")}</CommandEmpty>
                    )}
                    {locQuery && (
                      <CommandGroup heading={t("custom")}>
                        <CommandItem
                          onSelect={() => {
                            setForm({ ...form, location: locQuery.trim() });
                            setLocOpen(false);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          <span>{t("use_value", { name: locQuery.trim() })}</span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {matchTrip.length > 0 && (
                      <CommandGroup heading={t("trip_stops")}>
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
                      <CommandGroup heading={t("other_cities_label")}>
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
          {form.selectedTransit.length === 1 && (
            <div className="space-y-2">
              {/* Line selector — bus / metro / tram with city set */}
              {singlePTMode && form.location && (
                <div className="space-y-1.5">
                  <Label>{t("line")}</Label>
                  <LineCombobox
                    mode={singlePTMode}
                    city={form.location}
                    value={selectedLineRef}
                    onChange={(ref) => {
                      setSelectedLineRef(ref);
                      setForm(f => ({ ...f, from_stop: "", to_stop: "" }));
                    }}
                  />
                </div>
              )}

              {/* Boarding stop — free text with line-stop + city suggestions */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t("boarding_stop")}</Label>
                  {transitStopsLoading && (
                    <span className="animate-pulse text-[11px] text-muted-foreground">{t("loading")}</span>
                  )}
                </div>
                <StopCombobox
                  mode={singlePTMode as MixedLeg["mode"]}
                  city={form.location}
                  countries={tripCountries}
                  value={form.from_stop}
                  onChange={(v) => setForm(f => ({ ...f, from_stop: v }))}
                  placeholder={t("boarding_stop")}
                  extraOptions={transitStops}
                />
              </div>

              {/* Alighting stop — free text with line-stop + city suggestions */}
              <div className="space-y-1.5">
                <Label>{t("alighting_stop")}</Label>
                <StopCombobox
                  mode={singlePTMode as MixedLeg["mode"]}
                  city={form.location}
                  countries={tripCountries}
                  value={form.to_stop}
                  onChange={(v) => setForm(f => ({ ...f, to_stop: v }))}
                  placeholder={t("alighting_stop")}
                  extraOptions={transitStops}
                />
              </div>
            </div>
          )}
          {isMultiModal && (
            <div className="space-y-2">
              <Label>{t("legs_label")}</Label>
              {form.mixedLegs.map((leg, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  {/* Mode picker — only shows the modes selected in categories */}
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                      {(form.selectedTransit as ("train" | "bus" | "metro" | "tram")[]).map((m) => {
                        const LIcon = TRANSIT_ICON[m];
                        const isActive = leg.mode === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => updateMixedLeg(i, { mode: m })}
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-xl border transition",
                              isActive ? TRANSIT_COLOR_ACTIVE[m] : TRANSIT_COLOR_INACTIVE[m],
                            )}
                          >
                            <LIcon className="h-4 w-4" />
                          </button>
                        );
                      })}
                    </div>
                    {form.mixedLegs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMixedLeg(i)}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Line / vehicle picker */}
                  {PT_TRANSIT_KINDS.has(leg.mode) && form.location ? (
                    <LineCombobox
                      mode={leg.mode}
                      city={form.location}
                      value={leg.vehicle}
                      onChange={(ref) => updateMixedLeg(i, { vehicle: ref })}
                    />
                  ) : (
                    <Input
                      value={leg.vehicle}
                      onChange={(e) => updateMixedLeg(i, { vehicle: e.target.value })}
                      placeholder={t("vehicle_name").split("(")[0].trim()}
                    />
                  )}
                  {/* Stops — suggestions limited to the selected line's stops */}
                  <MixedLegStops
                    mode={leg.mode}
                    city={form.location}
                    vehicle={leg.vehicle}
                    countries={tripCountries}
                    fromStop={leg.from_stop}
                    toStop={leg.to_stop}
                    onFrom={(v) => updateMixedLeg(i, { from_stop: v })}
                    onTo={(v) => updateMixedLeg(i, { to_stop: v })}
                  />
                  {/* Times — 2 columns are fine since time inputs are compact */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">{t("depart_time")}</p>
                      <Input
                        type="time"
                        value={leg.depart_at}
                        onChange={(e) => updateMixedLeg(i, { depart_at: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">{t("arrive_time")}</p>
                      <Input
                        type="time"
                        value={leg.arrive_at}
                        onChange={(e) => updateMixedLeg(i, { arrive_at: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addMixedLeg}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> {t("add_leg")}
              </button>
            </div>
          )}
          {isWishlist ? (
            <div className="space-y-1.5">
              <Label>{t("day")}</Label>
              <select
                required
                value={form.day_index ?? ""}
                onChange={(e) => setForm({ ...form, day_index: e.target.value ? Number(e.target.value) : null })}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="" disabled>{t("select_day")}</option>
                {Array.from({ length: Math.max(1, maxDayIndex + 1) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{t("day_of", { n: i + 1 })}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label>{t("starts_at")}</Label>
                  <Input
                    type="date"
                    required
                    className="w-full"
                    value={form.start_at ? form.start_at.slice(0, 10) : ""}
                    onChange={(e) => {
                      const date = e.target.value;
                      const time = form.start_at ? form.start_at.slice(11, 16) : "";
                      setForm({ ...form, start_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("start_time")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <Input
                    type="time"
                    className="w-full"
                    value={form.start_at && form.start_at.slice(11, 16) !== "00:00" ? form.start_at.slice(11, 16) : ""}
                    onChange={(e) => {
                      const time = e.target.value;
                      const date = form.start_at ? form.start_at.slice(0, 10) : "";
                      setForm({ ...form, start_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("ends_at")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <Input
                    type="date"
                    className="w-full"
                    value={form.end_at ? form.end_at.slice(0, 10) : ""}
                    onChange={(e) => {
                      const date = e.target.value;
                      const time = form.end_at ? form.end_at.slice(11, 16) : "";
                      setForm({ ...form, end_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("end_time")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <Input
                    type="time"
                    className="w-full"
                    value={form.end_at && form.end_at.slice(11, 16) !== "00:00" ? form.end_at.slice(11, 16) : ""}
                    onChange={(e) => {
                      const time = e.target.value;
                      const date = form.end_at ? form.end_at.slice(0, 10) : "";
                      setForm({ ...form, end_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{t("notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </form>
        {/* Sticky footer — always visible regardless of scroll position */}
        <div className="shrink-0 border-t border-border px-5 py-3">
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
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("delete")}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button
                type="submit"
                form="add-item-form"
              >{t("save")}</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Extract date + time directly from ISO string to show destination-local time.
// Time is omitted if 00:00 (= not explicitly set by user).
function fmtDT(s: string, lang?: string) {
  const datePart = s.slice(0, 10);
  const timePart = s.slice(11, 16);
  if (!datePart) return "";
  const dateStr = new Date(`${datePart}T12:00:00`).toLocaleDateString(lang, { day: "2-digit", month: "short" });
  const showTime = timePart && timePart !== "00:00";
  return showTime ? `${dateStr} ${timePart}` : dateStr;
}

// Autocomplete for transit stops filtered by city + mode
// Boarding/alighting stops for one multi-modal leg. Fetches the selected
// line's stops so the suggestions are limited to that line (not other lines).
function MixedLegStops({
  mode, city, vehicle, countries, fromStop, toStop, onFrom, onTo,
}: {
  mode: MixedLeg["mode"];
  city: string;
  vehicle: string;
  countries: string[];
  fromStop: string;
  toStop: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [lineStops, setLineStops] = useState<string[]>([]);

  useEffect(() => {
    const osmMode = OSM_ROUTE_MODE[mode];
    const ref = vehicle.trim();
    if (!osmMode || !city || !ref) { setLineStops([]); return; }
    let cancelled = false;
    fetchLineStops(city, osmMode, ref)
      .then((stops) => { if (!cancelled) setLineStops(stops); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mode, city, vehicle]);

  return (
    <div className="space-y-2">
      <StopCombobox
        mode={mode}
        city={city}
        countries={countries}
        value={fromStop}
        onChange={onFrom}
        placeholder={t("boarding_stop")}
        extraOptions={lineStops}
      />
      <StopCombobox
        mode={mode}
        city={city}
        countries={countries}
        value={toStop}
        onChange={onTo}
        placeholder={t("alighting_stop")}
        extraOptions={lineStops}
      />
    </div>
  );
}

// Accent/diacritic-insensitive normalisation: "Koz" matches "Központ"
const norm = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Drop a leading line ref from an OSM route name so it isn't repeated
// (the ref is already shown in bold). "220 => Újpest…" → "Újpest…"
function stripLineRef(name: string, ref: string): string {
  let n = (name ?? "").trim();
  const r = (ref ?? "").trim();
  if (r && n.toLowerCase().startsWith(r.toLowerCase())) {
    n = n.slice(r.length).replace(/^[\s:=>~·|/\\–—-]+/, "").trim();
  }
  return n;
}

function StopCombobox({
  mode, city, countries, value, onChange, placeholder, extraOptions,
}: {
  mode: MixedLeg["mode"];
  city: string;
  countries: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Line-specific stops (from Overpass) shown first among suggestions. */
  extraOptions?: string[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // When value is empty, seed the remote search with the city name so that
  // results appear immediately on focus (e.g. all Budapest metro stations)
  const searchQuery = value.trim() || city.trim();
  const remote = useRemoteHubs(modeToKind(mode as TransportMode), searchQuery);

  const allHubs = useMemo(
    () => hubsForMode(mode as TransportMode, countries, true),
    [mode, countries],
  );
  const cityLower = city.trim().toLowerCase();
  const cityHubs = useMemo(
    () =>
      cityLower
        ? allHubs.filter(
            (h) =>
              (h.city ?? "").toLowerCase().includes(cityLower) ||
              h.name.toLowerCase().includes(cityLower),
          )
        : [],
    [allHubs, cityLower],
  );

  const nq = norm(value);
  const nCity = norm(city);
  const hasLineStops = (extraOptions?.length ?? 0) > 0;

  const localFiltered = useMemo(
    () =>
      nq && nq !== nCity
        ? cityHubs.filter(
            (h) => norm(h.name).includes(nq) || norm(h.city ?? "").includes(nq),
          )
        : cityHubs.slice(0, 40),
    [cityHubs, nq, nCity],
  );

  const remoteFiltered = useMemo(
    () =>
      nCity
        ? (remote.data ?? []).filter(
            (r) =>
              !localFiltered.some((f) => norm(f.name) === norm(r.name)) &&
              (norm(r.city ?? "").includes(nCity) || norm(r.name).includes(nCity)),
          )
        : [],
    [remote.data, localFiltered, nCity],
  );

  // Line-specific stops (from Overpass) — accent-insensitive filter by typed text
  const extraFiltered = useMemo(() => {
    const opts = extraOptions ?? [];
    return nq ? opts.filter((o) => norm(o).includes(nq)) : opts;
  }, [extraOptions, nq]);

  // When a line is selected, show ONLY that line's stops (not other lines' /
  // city-wide stations). Otherwise fall back to city hub suggestions.
  const suggestions = useMemo(() => {
    if (hasLineStops) {
      return extraFiltered.slice(0, 60).map((name) => ({ name }) as { name: string; city?: string });
    }
    const seen = new Set<string>();
    const out: Array<{ name: string; city?: string }> = [];
    for (const h of [...localFiltered, ...remoteFiltered]) {
      const k = norm(h.name);
      if (seen.has(k)) continue;
      seen.add(k); out.push({ name: h.name, city: h.city });
    }
    return out.slice(0, 60);
  }, [hasLineStops, extraFiltered, localFiltered, remoteFiltered]);

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && (suggestions.length > 0 || (!hasLineStops && remote.isFetching)) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map((h, idx) => (
            <button
              type="button"
              key={`${h.name}-${idx}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(h.name); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{h.name}</span>
              </span>
            </button>
          ))}
          {!hasLineStops && remote.isFetching && suggestions.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("global_search")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Campo linea di trasporto pubblico (bus/metro/tram): input di testo libero —
// quello che scrivi È il valore salvato — con suggerimenti da Overpass (OSM) sotto.
function LineCombobox({
  mode, city, value, onChange,
}: {
  mode: string;
  city: string;
  value: string;
  onChange: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Array<{ ref: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const osmMode = OSM_ROUTE_MODE[mode];
    if (!osmMode || !city) { setLines([]); return; }
    let cancelled = false;
    setLoading(true);
    setLines([]);
    fetchTransitLines(city, osmMode)
      .then(result => { if (!cancelled) setLines(result); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, city]);

  const nq = norm(value);
  const suggestions = useMemo(
    () => (nq
      ? lines.filter(l => norm(l.ref).includes(nq) || norm(l.name).includes(nq))
      : lines
    ).slice(0, 60),
    [lines, nq],
  );

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={loading ? t("loading") : t("select_line")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        autoComplete="off"
        disabled={!city}
      />
      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map(line => {
            const desc = stripLineRef(line.name, line.ref);
            return (
              <button
                type="button"
                key={line.ref}
                onMouseDown={(e) => { e.preventDefault(); onChange(line.ref); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="shrink-0 font-semibold">{line.ref}</span>
                {desc && (
                  <span className="min-w-0 flex-1 truncate text-xs opacity-55">{desc}</span>
                )}
              </button>
            );
          })}
          {loading && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground animate-pulse">{t("loading")}</div>
          )}
        </div>
      )}
    </div>
  );
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const isPlane = mode === "plane";
  const isHub = mode === "train" || mode === "bus" || mode === "ferry" || mode === "metro" || mode === "tram";
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
          placeholder={placeholder || t("search_city")}
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
          placeholder={placeholder || t("search_airport")}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          autoComplete="off"
        />
        {open && (filtered.length > 0 || hiddenCount > 0) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {filtered.length === 0 && !q && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("no_option")}</div>
            )}
            {filtered.length > 0 && (
              <div className="py-1">
                <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {showAll || q ? t("all_options") : t("main_options")}
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
                <span>{t("show_more", { count: hiddenCount })}</span>
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
        placeholder={placeholder || t("search_type")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && (filtered.length > 0 || hiddenCount > 0 || (q && (remoteHubs.length > 0 || remote.isFetching))) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {filtered.length === 0 && !q && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("no_option")}</div>
          )}
          {filtered.length > 0 && (
            <div className="py-1">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {showAll || q ? t("all_options") : t("main_options")}
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
                {t("global_results")}
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
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("global_search")}</div>
          )}
          {!q && !showAll && hiddenCount > 0 && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setShowAll(true); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              <ChevronsUpDown className="h-4 w-4" />
              <span>{t("show_more", { count: hiddenCount })}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

