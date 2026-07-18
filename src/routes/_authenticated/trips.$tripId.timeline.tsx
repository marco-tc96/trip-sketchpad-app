import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  Plane, Bus, Car, CarTaxiFront, Bike, Ship, Hotel, MapPin, Sparkles, ArrowRightLeft,
  PlaneTakeoff, PlaneLanding, Plus, Trash2, ChevronsUpDown, Check, Clock,
  CalendarDays, Luggage, Pencil, X, Menu, TramFront, TrainFront,
} from "lucide-react";
import { toast } from "sonner";
import { listItems, createItem, updateItem, deleteItem, ITEM_KINDS } from "@/lib/itinerary.functions";
import { getTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { citiesOfCountry, flagOf, cityNameLocalized, countryNameLocalized } from "@/lib/country-data";
import { cn } from "@/lib/utils";
import { withRomanization, registerEnName, useTranslationTick } from "@/lib/romanize";
import { useCityPhoto } from "@/hooks/use-city-photo";
import { hubsForMode, formatHub, type Hub, HUBS } from "@/lib/transport-hubs";
import { useRemoteHubs, modeToKind } from "@/hooks/use-remote-hubs";
import {
  useAirports, airportsForCountries, airportsSearch, formatAirport, type AirportHub,
} from "@/hooks/use-airports";

// Side-view metro wagon icon — used instead of a generic train/tram glyph so
// a metro leg/kind never reads as identical to a tram one at a glance (same
// design as the matching icon on the Profile page's transport stats).
function MetroWagonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="6" width="18" height="11" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <rect x="6.3" y="8.3" width="3.6" height="2.4" rx="0.4" />
      <rect x="14.1" y="8.3" width="3.6" height="2.4" rx="0.4" />
      <circle cx="7.5" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </svg>
  );
}

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

type TransportMode = "car" | "moto" | "taxi" | "train" | "plane" | "ferry" | "bus" | "metro" | "tram";
type Waypoint = { name: string; enter?: boolean; lat?: number | null; lng?: number | null; country?: string | null };
type Leg = {
  mode: TransportMode;
  from: string;
  to: string;
  depart_at: string;
  arrive_at: string;
  carrier: string;
  number: string;
  waypoints?: Waypoint[];
};
const emptyLeg = (mode: TransportMode = "car"): Leg => ({
  mode, from: "", to: "", depart_at: "", arrive_at: "", carrier: "", number: "",
});
const isStopMode = (m: TransportMode) => m === "train" || m === "plane" || m === "metro" || m === "tram";
const isRoadMode = (m: TransportMode) => m === "car" || m === "moto" || m === "taxi";

// Small localized labels for the road-leg editor (kept local so we don't have to
// touch the global i18n bundle for these few strings).
const WP_LABELS: Record<
  string,
  {
    cities: string; place: string; addCity: string; via: string; recommended: string; intercity: string;
    // Bus line category badge (LineCombobox) — express/rapid/shuttle coach
    // services, distinct from the existing "intercity" badge.
    express: string;
    // Urban ("local") line badge (LineCombobox) — shown for every line NOT
    // flagged intercity, so every suggestion carries an explicit urban/
    // extraurban badge rather than only marking the intercity ones.
    urban: string;
    poi: string; city: string; useCity: string;
    // Sub-headers for the grouped POI dropdown (touristic / transport hubs / other).
    poiTouristic: string; poiTransport: string; poiOther: string;
    // Train leg's "pick a country first" step (see HubCombobox's isTrainMode).
    country: string; selectCountry: string;
    // Badge shown next to a POI/station already used elsewhere in the trip.
    usedBadge: string;
    // Section title for the "already used in this trip" list.
    usedSectionTitle: string;
  }
> = {
  it: { cities: "Tappe di stop (città)", place: "Città o luogo", addCity: "Aggiungi città", via: "via", recommended: "Consigliato", intercity: "Extraurbano", express: "Express", urban: "Urbano", poi: "Punti di interesse", city: "Città", useCity: "Usa {{city}} (centro città)", poiTouristic: "Turistici", poiTransport: "Stazioni e aeroporti", poiOther: "Altri luoghi", country: "Paese", selectCountry: "Seleziona un paese", usedBadge: "Già usato", usedSectionTitle: "Già usati in questo viaggio" },
  en: { cities: "Stops (cities)", place: "City or place", addCity: "Add city", via: "via", recommended: "Recommended", intercity: "Intercity", express: "Express", urban: "Urban", poi: "Points of interest", city: "City", useCity: "Use {{city}} (city centre)", poiTouristic: "Sightseeing", poiTransport: "Stations & airports", poiOther: "Other places", country: "Country", selectCountry: "Select a country", usedBadge: "Already used", usedSectionTitle: "Already used in this trip" },
  es: { cities: "Paradas (ciudades)", place: "Ciudad o lugar", addCity: "Añadir ciudad", via: "vía", recommended: "Recomendado", intercity: "Interurbano", express: "Exprés", urban: "Urbano", poi: "Puntos de interés", city: "Ciudad", useCity: "Usar {{city}} (centro)", poiTouristic: "Turísticos", poiTransport: "Estaciones y aeropuertos", poiOther: "Otros lugares", country: "País", selectCountry: "Selecciona un país", usedBadge: "Ya usado", usedSectionTitle: "Ya usados en este viaje" },
  fr: { cities: "Étapes (villes)", place: "Ville ou lieu", addCity: "Ajouter une ville", via: "via", recommended: "Recommandé", intercity: "Interurbain", express: "Express", urban: "Urbain", poi: "Points d'intérêt", city: "Ville", useCity: "Utiliser {{city}} (centre-ville)", poiTouristic: "Touristique", poiTransport: "Gares et aéroports", poiOther: "Autres lieux", country: "Pays", selectCountry: "Sélectionner un pays", usedBadge: "Déjà utilisé", usedSectionTitle: "Déjà utilisés dans ce voyage" },
  de: { cities: "Stopps (Städte)", place: "Stadt oder Ort", addCity: "Stadt hinzufügen", via: "über", recommended: "Empfohlen", intercity: "Überland", express: "Express", urban: "Städtisch", poi: "Sehenswürdigkeiten", city: "Stadt", useCity: "{{city}} verwenden (Stadtzentrum)", poiTouristic: "Touristisch", poiTransport: "Bahnhöfe & Flughäfen", poiOther: "Sonstige Orte", country: "Land", selectCountry: "Land auswählen", usedBadge: "Bereits verwendet", usedSectionTitle: "In dieser Reise bereits verwendet" },
  pt: { cities: "Paradas (cidades)", place: "Cidade ou lugar", addCity: "Adicionar cidade", via: "via", recommended: "Recomendado", intercity: "Interurbano", express: "Expresso", urban: "Urbano", poi: "Pontos de interesse", city: "Cidade", useCity: "Usar {{city}} (centro)", poiTouristic: "Turísticos", poiTransport: "Estações e aeroportos", poiOther: "Outros locais", country: "País", selectCountry: "Selecione um país", usedBadge: "Já usado", usedSectionTitle: "Já usados nesta viagem" },
  ja: { cities: "立ち寄り（都市）", place: "都市または場所", addCity: "都市を追加", via: "経由", recommended: "おすすめ", intercity: "郊外路線", express: "急行", urban: "市内", poi: "観光スポット", city: "都市", useCity: "{{city}}を使用（市の中心部）", poiTouristic: "観光", poiTransport: "駅・空港", poiOther: "その他の場所", country: "国", selectCountry: "国を選択", usedBadge: "使用済み", usedSectionTitle: "この旅行で使用済み" },
  ko: { cities: "경유(도시)", place: "도시 또는 장소", addCity: "도시 추가", via: "경유", recommended: "추천", intercity: "시외", express: "급행", urban: "시내", poi: "관심 지점", city: "도시", useCity: "{{city}} 사용(시내 중심)", poiTouristic: "관광", poiTransport: "역·공항", poiOther: "기타 장소", country: "국가", selectCountry: "국가 선택", usedBadge: "사용됨", usedSectionTitle: "이 여행에서 이미 사용됨" },
  zh: { cities: "停靠（城市）", place: "城市或地点", addCity: "添加城市", via: "途经", recommended: "推荐", intercity: "城际", express: "快线", urban: "市区", poi: "兴趣点", city: "城市", useCity: "使用{{city}}（市中心）", poiTouristic: "旅游景点", poiTransport: "车站和机场", poiOther: "其他地点", country: "国家", selectCountry: "选择国家", usedBadge: "已使用", usedSectionTitle: "本次旅行中已使用" },
};
const wpL = (lang: string | undefined) => WP_LABELS[(lang || "it").slice(0, 2)] ?? WP_LABELS.it;
// Small colored pill flagging a POI/station already used elsewhere in the
// trip — distinct (sky blue) from every other badge colour in this editor
// so it reads immediately as "you've picked this before", not a category.
function UsedPlaceBadge({ lang }: { lang: string }) {
  return (
    <span className="ml-1.5 shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">
      {wpL(lang).usedBadge}
    </span>
  );
}
type MixedLeg = {
  mode: "train" | "bus" | "metro" | "tram" | "car" | "moto" | "taxi" | "ferry";
  vehicle: string;
  // Road modes (car/moto/taxi) reuse these two fields as the leg's departure/
  // arrival point (picked via HubCombobox, with city POI/address suggestions)
  // rather than a public-transport stop.
  from_stop: string;
  to_stop: string;
  depart_at: string;
  arrive_at: string;
  // Bus only: true when this line was found via the wide intercity/airport
  // search, or tagged as a long-distance "coach" route, rather than a strict
  // local city-boundary line (see fetchTransitLines) — carried through to the
  // map so it can draw in a different colour.
  intercity?: boolean;
  // Bus only: true when the line's own OSM tags/name mark it as an express/
  // rapid/shuttle service — independent of (and can combine with) intercity.
  express?: boolean;
  // Train only: "national" (default, incl. legacy legs saved before this
  // field existed) keeps the classic country → station picker for the big
  // intercity/national network. "local" switches to the SAME city+line
  // picker already used for bus/metro/tram — for a metropolitan-area
  // commuter/suburban rail network (e.g. Barcelona's Rodalies) that has its
  // own numbered/lettered lines (e.g. "R2 Nord") and stops, exactly like a
  // metro or tram line, rather than a big national station.
  trainScope?: "national" | "local";
  // Train-local only: which of the trip's own configured cities this leg's
  // metropolitan/suburban rail search is scoped to — picked explicitly
  // rather than reusing the activity's generic `location` field, since that
  // field is hidden entirely for train legs (see the AddItemDialog form) and
  // a trip can have several cities, so each local-train leg needs its own.
  city?: string;
};
const emptyMixedLeg = (): MixedLeg => ({
  mode: "bus", vehicle: "", from_stop: "", to_stop: "", depart_at: "", arrive_at: "",
});

// Every place name (POI/station/address) the trip has already used anywhere
// — the outbound/return journey's legs, a daily activity's own location, and
// every leg endpoint of a multi-leg daily activity. Original casing is kept
// (deduped case-insensitively) so the names can be listed back to the user
// verbatim, not just used to flag a match. Surfaced back in the road/train
// pickers so a repeat visit — e.g. picking up again from the same station or
// landmark — is easy to spot and re-pick instead of hunting through a long
// POI list or re-typing it from scratch.
function collectUsedPlaces(items: ItemRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v?: string | null) => {
    const s = (v ?? "").trim();
    const key = s.toLowerCase();
    if (s && !seen.has(key)) { seen.add(key); out.push(s); }
  };
  for (const it of items) {
    add(it.location);
    const meta = it.meta as
      | { from_stop?: string; to_stop?: string; mixed_legs?: MixedLeg[]; legs?: Leg[] }
      | null
      | undefined;
    add(meta?.from_stop);
    add(meta?.to_stop);
    (meta?.mixed_legs ?? []).forEach((l) => { add(l.from_stop); add(l.to_stop); });
    (meta?.legs ?? []).forEach((l) => { add(l.from); add(l.to); });
  }
  return out;
}
const isUsedPlace = (name: string, usedPlaces?: string[]) =>
  !!usedPlaces && usedPlaces.some((p) => p.toLowerCase() === name.trim().toLowerCase());
const MODE_ICON: Record<TransportMode, React.ComponentType<{ className?: string }>> = {
  car: Car, moto: Bike, taxi: CarTaxiFront, train: TrainFront, plane: Plane, ferry: Ship, bus: Bus, metro: MetroWagonIcon, tram: TramFront,
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
  metro: MetroWagonIcon,
  tram: TramFront,
};

const TRANSPORT_KINDS = new Set([
  "outbound", "return", "flight", "train", "bus", "car", "taxi", "moto", "ferry", "transfer", "metro", "tram",
]);
const STOP_KINDS = new Set(["train", "bus", "metro", "tram", "ferry"]);
// Road modes, added as a daily-activity item: edited through the same
// multi-leg UI as public transport, but with from/to point-of-interest fields
// (HubCombobox) instead of a vehicle/line + stop pair.
const ROAD_KINDS = new Set(["car", "moto", "taxi"]);
// Modes whose vehicle field is always a searchable real OSM line (never a
// plain "national" station network). "train" is intentionally NOT listed
// here — whether a train leg gets the line-search treatment depends on its
// own per-leg trainScope toggle (see MixedLeg), checked separately at each
// call site below.
const PT_TRANSIT_KINDS = new Set(["bus", "metro", "tram"]);
const OSM_ROUTE_MODE: Record<string, string> = { bus: "bus", metro: "subway", tram: "tram", train: "train" };
// Every real OSM route=* tag that can carry a given app mode — mirrors
// trip-map.tsx's own OSM_ROUTE_MODES, which already needs this breadth to
// DRAW a line's real geometry on the map. This picker used to only ever
// query the single "primary" tag above (e.g. metro → "subway" alone), so a
// line the map could render just fine (once a ref was saved) never showed up
// as a pickable suggestion here in the first place — e.g. Bologna's Marconi
// Express airport people-mover, mapped as route=monorail, was findable
// nowhere in this app even though "Metro" is exactly the mode meant to cover
// it. Metro also picks up "light_rail" (some networks, e.g. parts of
// Valencia's metro, are tagged that way) and tram/train likewise gain
// light_rail as an alternate tag.
const OSM_ROUTE_TAGS: Record<string, string[]> = {
  bus: ["bus", "coach"],
  subway: ["subway", "metro", "monorail", "light_rail"],
  tram: ["tram", "light_rail"],
  train: ["train", "light_rail"],
};
// True when this leg should use the city+line picker (bus/metro/tram always;
// train only when its own trainScope is explicitly "local").
const usesLocalLinePicker = (leg: MixedLeg) =>
  PT_TRANSIT_KINDS.has(leg.mode) || (leg.mode === "train" && leg.trainScope === "local");
// The city that scopes this leg's line/stop search: the leg's OWN city pick
// for a local train (each local-train leg can be anchored to a different
// trip city), the activity's generic `location` field for every other
// transit mode (unchanged from before).
const legCity = (leg: MixedLeg, activityLocation: string) =>
  leg.mode === "train" && leg.trainScope === "local" ? (leg.city ?? "") : activityLocation;

// ── Caches (module-level, persist across dialog opens) ───────────────────────
const _areaCache = new Map<string, string>();   // city → overpass area snippet
const _lineCache = new Map<string, Array<{ ref: string; name: string; intercity?: boolean; express?: boolean; color?: string }>>();

// Validates/normalizes an OSM `colour` tag value to a CSS-safe hex color
// (`#rgb`/`#rrggbb`/`#rrggbbaa`, with or without the leading `#`, is all
// real-world OSM data uses for this tag) — OSM sometimes also has stray
// non-hex garbage (color *names*, empty strings) which we reject rather
// than risk feeding an invalid value straight into an inline style.
function normalizeOsmColor(raw: string | undefined): string | undefined {
  const v = (raw ?? "").trim();
  if (!v) return undefined;
  const hex = v.startsWith("#") ? v : `#${v}`;
  return /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/.test(hex) ? hex : undefined;
}

// True black/near-black or white/near-white text — whichever contrasts more
// against `bgHex` — for a badge whose background is a real, unpredictable
// OSM line colour (uses the standard relative-luminance heuristic).
function contrastTextColor(bgHex: string): string {
  const h = bgHex.length === 4
    ? bgHex.slice(1).split("").map(c => c + c).join("")
    : bgHex.slice(1, 7);
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111111" : "#ffffff";
}
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

// ── Flight-duration timezone correction ──────────────────────────────────────
// depart_at/arrive_at are stored as LOCAL wall-clock time at each airport, so a
// naive end-minus-start diff is wrong whenever the two airports don't share a
// UTC offset (the normal case for international flights) — e.g. a flight that
// lands at the "same" clock time it left can look like it took a full day.
// Resolve each airport's real IANA timezone once (Overpass for its
// coordinates, then a free timezone-by-coordinate lookup), cache it, and use
// the browser's own DST-aware Intl support to convert each wall-clock time to
// a real UTC instant before diffing — correct for any date, DST included.
const _airportGeoCache = new Map<string, { lat: number; lng: number } | null>();
const _airportTzCache = new Map<string, string | null>();

function extractIATA(label: string): string | null {
  const s = label ?? "";
  const paren = s.match(/\(([A-Z]{3})\)/);
  if (paren) return paren[1];
  const prefix = s.match(/^([A-Z]{3})\s*[-–]\s/);
  if (prefix) return prefix[1];
  return null;
}

async function fetchAirportCoordsByIata(code: string): Promise<{ lat: number; lng: number } | null> {
  if (_airportGeoCache.has(code)) return _airportGeoCache.get(code)!;
  try {
    const q = `[out:json][timeout:20];(node["aeroway"="aerodrome"]["iata"="${code}"];way["aeroway"="aerodrome"]["iata"="${code}"];relation["aeroway"="aerodrome"]["iata"="${code}"];);out center 1;`;
    const data = (await overpassFetch(q, 15000)) as unknown as {
      elements: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number } }>;
    };
    const e = data.elements?.[0];
    const lat = e?.lat ?? e?.center?.lat;
    const lng = e?.lon ?? e?.center?.lon;
    const v = typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
    _airportGeoCache.set(code, v);
    return v;
  } catch {
    _airportGeoCache.set(code, null);
    return null;
  }
}

async function fetchTimeZoneAt(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (_airportTzCache.has(key)) return _airportTzCache.get(key)!;
  try {
    const r = await fetch(`https://timeapi.io/api/TimeZone/coordinate?latitude=${lat}&longitude=${lng}`, { headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("bad response");
    const data = (await r.json()) as { timeZone?: string };
    const tz = data.timeZone ?? null;
    _airportTzCache.set(key, tz);
    return tz;
  } catch {
    _airportTzCache.set(key, null);
    return null;
  }
}

// Resolve a stored leg-endpoint label (e.g. "ICN - Seoul / Incheon Int'l
// Airport") to its real IANA timezone, via IATA code → coordinates → tz.
async function resolveAirportTZ(label: string): Promise<string | null> {
  const iata = extractIATA(label);
  if (!iata) return null;
  const coords = await fetchAirportCoordsByIata(iata);
  if (!coords) return null;
  return fetchTimeZoneAt(coords.lat, coords.lng);
}

// Offset (minutes, east positive) of `timeZone` at the given instant — uses the
// browser's own tz database, so DST is handled correctly for any date.
function tzOffsetMinutes(atUTC: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(atUTC))) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return (asUTC - atUTC) / 60000;
}

// Converts a stored "local wall-clock" ISO string (no zone info — it's the
// local time AT that airport) into a real UTC timestamp, given its zone.
function wallTimeToUTC(iso: string, timeZone: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  const naiveUTC = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), 0);
  return naiveUTC - tzOffsetMinutes(naiveUTC, timeZone) * 60000;
}

// Real elapsed travel time between two stored local times at two different
// airports (accounts for the timezone/DST difference) — null if either
// airport's timezone can't be resolved, so the caller falls back to the naive
// same-zone diff instead of showing nothing.
async function realDurationMs(
  departISO: string | null, arriveISO: string | null, fromLabel: string, toLabel: string,
): Promise<number | null> {
  if (!departISO || !arriveISO) return null;
  const [tzFrom, tzTo] = await Promise.all([resolveAirportTZ(fromLabel), resolveAirportTZ(toLabel)]);
  if (!tzFrom || !tzTo) return null;
  const dep = wallTimeToUTC(departISO, tzFrom);
  const arr = wallTimeToUTC(arriveISO, tzTo);
  if (dep == null || arr == null) return null;
  const ms = arr - dep;
  return ms > 0 ? ms : null;
}
function formatDurationMs(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
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

// Radius (m) for the intercity/airport bus search around a city's centre —
// wide enough to catch an airport limousine bus (e.g. Seoul ↔ Incheon) while
// still being "buses that pass through this city", not a whole country.
// Widened from 45km: several real "budget airport" shuttle routes sit well
// outside that (Girona ↔ Barcelona ~95km, Beauvais ↔ Paris ~85km, Hahn ↔
// Frankfurt ~120km), so the old radius silently missed the shuttle bus line
// entirely for exactly the airports most likely to need one.
const INTERCITY_BUS_RADIUS_M = 130000;

// Radius (m) for the ferry-destinations search around a departure port — much
// wider than the bus one, since ferry routes commonly link a port to another
// port tens/a hundred+ km away (e.g. mainland ↔ island), not just neighbouring
// stops within one city.
const FERRY_RADIUS_M = 150000;

// A relation's ref/name/tags → which badge (if any) its line gets in the
// picker. `express` and `intercity` are independent/can combine (an airport
// express coach is both); express is shown in preference when both apply,
// since it's the more specific, more immediately useful distinction.
// - express: OSM `service`/`bus` tag says so, or the ref/name itself reads
//   as one ("Express", "Rapid", a shuttle service) — the wording transit
//   agencies themselves use for this category worldwide.
// - intercity: OSM tags it `route=coach` (the standard tag for long-distance
//   coach services, distinct from `route=bus` for local/urban lines), OR it
//   was only found via the wide radius search below (outside the city's own
//   administrative boundary — i.e. it plainly isn't a local line).
const EXPRESS_RE = /\bexpress\b|\brapid\b|\bshuttle\b/i;
function classifyBusLine(
  tags: Record<string, string> | undefined,
  ref: string,
  name: string,
  foundWide: boolean,
): { intercity?: boolean; express?: boolean; color?: string } {
  const hay = `${ref} ${name}`;
  const isExpress = tags?.service === "express" || tags?.bus === "express" || EXPRESS_RE.test(hay);
  const isIntercity = foundWide || tags?.route === "coach" || tags?.service === "long_distance";
  const color = normalizeOsmColor(tags?.colour ?? tags?.color);
  return { intercity: isIntercity || undefined, express: isExpress || undefined, color };
}

// Radius (m) around the city's geocoded centre within which a route must
// have an actual STOP (not merely pass-through geometry) to count as
// "serving this city" — used by the wide intercity/airport-shuttle search
// below. Deliberately much smaller than the old geometry-only radius: a
// coach line that simply transits within 130km of the centre used to match
// even when it never stops anywhere near the city (the exact "linee che non
// c'entrano nulla con la città" the user flagged), whereas requiring a real
// stop within this tighter radius still catches genuine airport shuttles —
// their city-side terminal/stop is normally well within it even when the
// route's OTHER end (the airport) sits far outside the city.
const CITY_STOP_RADIUS_M = 15000;
function classifyBusLineWide(tags: Record<string, string> | undefined, ref: string, name: string) {
  return classifyBusLine(tags, ref, name, true);
}

// City admin-boundary bbox (Nominatim), reused to decide whether a bus
// line's real geometry actually stays inside the city ("urbano") or reaches
// beyond it ("extraurbano") even when OSM never tagged it route=coach —
// e.g. a Correggio→Carpi bus that does have a stop inside Correggio's own
// boundary but plainly isn't a local line since it runs to another town.
const _cityBBoxCache = new Map<string, { s: number; n: number; w: number; e: number } | null>();
async function getCityBBox(city: string): Promise<{ s: number; n: number; w: number; e: number } | null> {
  const key = city.trim().toLowerCase();
  if (_cityBBoxCache.has(key)) return _cityBBoxCache.get(key)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=0`,
      { headers: { Accept: "application/json" } },
    );
    const hits = (await r.json()) as Array<{ boundingbox: [string, string, string, string] }>;
    const bb = hits?.[0]?.boundingbox;
    const v = bb
      ? { s: parseFloat(bb[0]), n: parseFloat(bb[1]), w: parseFloat(bb[2]), e: parseFloat(bb[3]) }
      : null;
    _cityBBoxCache.set(key, v);
    return v;
  } catch {
    _cityBBoxCache.set(key, null);
    return null;
  }
}

// A route relation's geometry "escapes" the city bbox when it strays past
// it by more than this fraction of the bbox's own span — a small tolerance
// absorbs Nominatim boundary rounding/a stop right at the city edge without
// letting a line that genuinely runs to another town (Correggio→Carpi) read
// as local just because its geometry clips the boundary by a few metres.
const BBOX_ESCAPE_TOLERANCE = 0.15;
function escapesCityBBox(
  city: { s: number; n: number; w: number; e: number },
  line: { s: number; n: number; w: number; e: number },
): boolean {
  const padLat = (city.n - city.s) * BBOX_ESCAPE_TOLERANCE;
  const padLng = (city.e - city.w) * BBOX_ESCAPE_TOLERANCE;
  return (
    line.s < city.s - padLat ||
    line.n > city.n + padLat ||
    line.w < city.w - padLng ||
    line.e > city.e + padLng
  );
}

// Fetches full geometry for a batch of route relations in one request and
// returns each relation's bounding box, so a whole city's worth of
// candidate bus lines can be geometry-checked without one Overpass round
// trip per line.
async function fetchRelationBBoxes(ids: number[]): Promise<Map<number, { s: number; n: number; w: number; e: number }>> {
  const out = new Map<number, { s: number; n: number; w: number; e: number }>();
  if (ids.length === 0) return out;
  const q = `[out:json][timeout:40];relation(id:${ids.join(",")});out geom;`;
  try {
    const data = (await overpassFetch(q)) as unknown as {
      elements: Array<{ id: number; bounds?: { minlat: number; maxlat: number; minlon: number; maxlon: number } }>;
    };
    for (const el of data.elements) {
      if (!el.bounds) continue;
      out.set(el.id, { s: el.bounds.minlat, n: el.bounds.maxlat, w: el.bounds.minlon, e: el.bounds.maxlon });
    }
  } catch { /* geometry check is best-effort — lines just keep their tag-based classification */ }
  return out;
}

async function fetchTransitLines(city: string, osmMode: string): Promise<Array<{ ref: string; name: string; intercity?: boolean; express?: boolean; color?: string }>> {
  const key = `${city}|${osmMode}`;
  if (_lineCache.has(key)) return _lineCache.get(key)!;
  const areaQ = await getAreaQuery(city);
  // See OSM_ROUTE_TAGS: expands to every real OSM route=* tag that can carry
  // this app mode (e.g. metro also matches monorail/light_rail), not just
  // the one "primary" tag — otherwise a line the map can already draw once
  // saved (see trip-map.tsx) never even shows up as a pickable suggestion.
  const modes = OSM_ROUTE_TAGS[osmMode] ?? [osmMode];
  const seen = new Set<string>();
  const lines: Array<{ ref: string; name: string; intercity?: boolean; express?: boolean; color?: string }> = [];

  if (osmMode === "bus") {
    // Buses need a real STOP inside the city's own administrative boundary
    // to be shown at all — a route relation that merely clips the boundary
    // with a bit of through-geometry (no actual stop here) used to pass the
    // old `relation(area.c)` membership test and show up as an unrelated
    // suggestion; requiring a stop-role member inside area.c fixes that.
    const q = `[out:json][timeout:40];${areaQ};
      node(area.c)["public_transport"~"^(stop_position|platform)$"]->.stops1;
      node(area.c)["highway"="bus_stop"]->.stops2;
      way(area.c)["highway"="bus_stop"]->.stops3;
      (.stops1;.stops2;.stops3;)->.stops;
      (
        rel(bn.stops)["type"="route_master"]["route_master"~"^(bus|coach)$"];
        rel(bn.stops)["type"="route"]["route"~"^(bus|coach)$"];
      );
      out ids tags;`;
    const data = (await overpassFetch(q)) as unknown as { elements: Array<{ id: number; tags: Record<string, string> }> };
    const candidates: Array<{ id: number; ref: string; name: string; tags: Record<string, string> }> = [];
    for (const el of data.elements) {
      const ref = el.tags?.ref || el.tags?.name || "";
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      candidates.push({ id: el.id, ref, name: el.tags?.name ?? ref, tags: el.tags });
    }

    // Geometry-check every candidate NOT already tag-marked coach/long_distance
    // against the city's own bbox — a line that has a stop in town but whose
    // route clearly reaches another town (Correggio→Carpi) still reads as
    // extraurbano, matching how a rider actually experiences the line.
    const cityBox = await getCityBBox(city);
    const bboxes = cityBox
      ? await fetchRelationBBoxes(candidates.filter(c => c.tags?.route !== "coach" && c.tags?.service !== "long_distance").map(c => c.id))
      : new Map<number, { s: number; n: number; w: number; e: number }>();

    for (const c of candidates) {
      const base = classifyBusLine(c.tags, c.ref, c.name, false);
      const box = bboxes.get(c.id);
      const escapes = !!(cityBox && box && escapesCityBBox(cityBox, box));
      lines.push({ ref: c.ref, name: c.name, ...base, intercity: base.intercity || escapes || undefined });
    }
  } else {
    const clauses = modes.flatMap(m => [
      `relation["type"="route_master"]["route_master"="${m}"](area.c)`,
      `relation["type"="route"]["route"="${m}"](area.c)`,
    ]).join(";");
    const q = `[out:json][timeout:40];${areaQ};(${clauses};);out tags;`;
    const data = await overpassFetch(q) as { elements: Array<{ tags: Record<string, string> }> };
    for (const el of data.elements) {
      // Not every mapped route carries a structured `ref` tag — airport/
      // limousine lines in particular are often entered with only a `name`
      // (e.g. "Incheon Airport Limousine 6705A"). Requiring `ref` silently
      // dropped those entirely; fall back to `name` so the line still shows up
      // (just not de-duplicated/sorted as neatly as a real ref code would be).
      const ref = el.tags?.ref || el.tags?.name || "";
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      const name = el.tags?.name ?? ref;
      lines.push({ ref, name, ...classifyBusLine(el.tags, ref, name, false) });
    }
  }

  // Buses: the strict stop-in-boundary query above only finds LOCAL/urban
  // lines. Intercity and airport express buses (e.g. Seoul's Incheon Airport
  // limousine bus 6103) mostly run OUTSIDE that boundary and are missed
  // entirely — find them via their actual STOPS near the city centre
  // (CITY_STOP_RADIUS_M) rather than any point of their route geometry, so a
  // long-distance coach that merely transits near the city without stopping
  // here doesn't show up as an unrelated suggestion, and flag anything found
  // only this way as (at least) `intercity`.
  if (osmMode === "bus") {
    try {
      const center = await geocodePlaceName(city);
      if (center) {
        const around = `(around:${CITY_STOP_RADIUS_M},${center.lat},${center.lng})`;
        const q2 = `[out:json][timeout:40];
          node${around}["public_transport"~"^(stop_position|platform)$"]->.stops1;
          node${around}["highway"="bus_stop"]->.stops2;
          way${around}["highway"="bus_stop"]->.stops3;
          (.stops1;.stops2;.stops3;)->.stops;
          (
            rel(bn.stops)["type"="route_master"]["route_master"~"^(bus|coach)$"];
            rel(bn.stops)["type"="route"]["route"~"^(bus|coach)$"];
          );
          out tags;`;
        const data2 = await overpassFetch(q2) as { elements: Array<{ tags: Record<string, string> }> };
        for (const el of data2.elements) {
          const ref = el.tags?.ref || el.tags?.name || "";
          if (!ref || seen.has(ref)) continue;
          seen.add(ref);
          const name = el.tags?.name ?? ref;
          lines.push({ ref, name, ...classifyBusLineWide(el.tags, ref, name) });
        }
      }
    } catch { /* the local-boundary results above still stand */ }
  }

  // Urban (local) lines first, then intercity/extraurban — within each group,
  // numeric refs sort numerically, everything else falls back to locale
  // string order. Foto 7: "prima tutte le tratte urbane... poi quelle
  // extraurbane".
  lines.sort((a, b) => {
    if (!!a.intercity !== !!b.intercity) return a.intercity ? 1 : -1;
    const na = parseFloat(a.ref), nb = parseFloat(b.ref);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.ref.localeCompare(b.ref);
  });
  _lineCache.set(key, lines);
  return lines;
}

// Parses the "route relation(s) + member node/way tags" Overpass response
// shared by fetchLineStops' queries into the richest ordered stop-name list.
function parseLineStopsResponse(data: {
  elements: Array<{
    type: string;
    id: number;
    tags?: Record<string, string>;
    members?: Array<{ type: string; ref: number; role: string }>;
  }>;
}): string[] {
  // Resolve member id → official stop name (keyed by type-initial + id)
  const nameById = new Map<string, string>();
  const relations: Array<Array<{ type: string; ref: number; role: string }>> = [];
  for (const el of data.elements) {
    if (el.type === "relation" && el.members) relations.push(el.members);
    else if ((el.type === "node" || el.type === "way") && el.tags?.name) {
      nameById.set(`${el.type[0]}${el.id}`, el.tags.name);
      // Capture an official English name so the UI can prefer it over a raw
      // transliteration of the local-script stop name.
      registerEnName(el.tags.name, el.tags["name:en"] || el.tags["int_name"]);
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
  return best;
}

async function fetchLineStops(city: string, osmMode: string, lineRef: string): Promise<string[]> {
  const key = `${city}|${osmMode}|${lineRef}`;
  if (_stopCache.has(key)) return _stopCache.get(key)!;
  const areaQ = await getAreaQuery(city);
  // Same OSM_ROUTE_TAGS expansion as fetchTransitLines for consistency — a
  // line picked from the list may be tagged "coach" instead of "bus", or
  // "monorail"/"light_rail" instead of "subway".
  const modes = OSM_ROUTE_TAGS[osmMode] ?? [osmMode];
  const runQuery = (locator: string, prelude: string) => {
    // `lineRef` may be a real `ref` tag OR a `name`-fallback key (see
    // fetchTransitLines, for lines that were only tagged with a name) — match
    // either tag so a picked line's stops still resolve in both cases.
    const routeClauses = modes.flatMap(m => [
      `relation["type"="route"]["route"="${m}"]["ref"="${lineRef}"]${locator}`,
      `relation["type"="route"]["route"="${m}"]["name"="${lineRef}"]${locator}`,
    ]).join(";");
    // Fetch the matching route relation(s) with their ORDERED members, plus the
    // tags of every member node/way so we can resolve stop names. The member
    // lookups (node(r.r)/way(r.r)) are NOT limited to the search area, so a route
    // that leaves the city (e.g. a bus crossing into other towns) keeps every
    // stop from the first to the last. Bus routes expose stops as "platform"
    // members — often ways — not just "stop" nodes, so we read both.
    const q = `[out:json][timeout:60];${prelude}(${routeClauses};)->.r;.r out body;node(r.r);out tags;way(r.r);out tags;`;
    return overpassFetch(q) as Promise<{
      elements: Array<{
        type: string;
        id: number;
        tags?: Record<string, string>;
        members?: Array<{ type: string; ref: number; role: string }>;
      }>;
    }>;
  };

  let best = parseLineStopsResponse(await runQuery("(area.c)", `${areaQ};`));
  // Buses: a line not found within the strict city boundary is likely an
  // intercity/airport line (see fetchTransitLines) — retry with the same wide
  // radius around the city's centre so its stops resolve too.
  if (best.length === 0 && osmMode === "bus") {
    try {
      const center = await geocodePlaceName(city);
      if (center) {
        const around = `(around:${INTERCITY_BUS_RADIUS_M},${center.lat},${center.lng})`;
        best = parseLineStopsResponse(await runQuery(around, ""));
      }
    } catch { /* keep the empty result — nothing more to try */ }
  }
  _stopCache.set(key, best);
  return best;
}

// Ferries don't have numbered "lines" the way bus/metro/tram do — what's
// actually useful, given a departure PORT, is the list of other ports/
// destinations reachable directly by a real ferry route that calls at it.
// Unlike `parseLineStopsResponse` (which picks the single richest route
// variant), this collects the union of stop names across EVERY ferry
// relation found near the port, since a busy port is normally served by
// several distinct routes/companies to different destinations.
function parseFerryDestinationsResponse(
  data: {
    elements: Array<{
      type: string;
      id: number;
      tags?: Record<string, string>;
      members?: Array<{ type: string; ref: number; role: string }>;
    }>;
  },
  port: string,
): string[] {
  const nameById = new Map<string, string>();
  const relations: Array<Array<{ type: string; ref: number; role: string }>> = [];
  for (const el of data.elements) {
    if (el.type === "relation" && el.members) relations.push(el.members);
    else if ((el.type === "node" || el.type === "way") && el.tags?.name) {
      nameById.set(`${el.type[0]}${el.id}`, el.tags.name);
      registerEnName(el.tags.name, el.tags["name:en"] || el.tags["int_name"]);
    }
  }
  const isStopRole = (role: string) => role.startsWith("stop") || role.startsWith("platform");
  const portQ = norm(port);
  const seen = new Set<string>();
  const dests: string[] = [];
  for (const members of relations) {
    for (const m of members) {
      if (!isStopRole(m.role)) continue;
      const nm = nameById.get(`${m.type[0]}${m.ref}`);
      if (!nm) continue;
      const k = norm(nm);
      // Skip the departure port itself — a route relation's own name for its
      // terminus rarely matches the picked port string exactly, so this is a
      // fuzzy either-direction "contains" check (e.g. picked "Barcelona" vs.
      // OSM's "Port de Barcelona").
      if (!k || k.includes(portQ) || portQ.includes(k)) continue;
      if (seen.has(k)) continue;
      seen.add(k); dests.push(nm);
    }
  }
  return dests;
}

const _ferryDestCache = new Map<string, string[]>();

// Given a departure port (already picked via HubCombobox), finds every real
// ferry route (OSM route=ferry relation) calling there and returns the
// union of its OTHER stops as the list of realistic destinations — so the
// user picks from actual routes/islands served from that specific port
// instead of typing a destination blind.
async function fetchFerryDestinations(port: string): Promise<string[]> {
  const key = port.trim().toLowerCase();
  if (!key) return [];
  if (_ferryDestCache.has(key)) return _ferryDestCache.get(key)!;
  let result: string[] = [];
  try {
    const center = await geocodePlaceName(port);
    if (center) {
      const around = `(around:${FERRY_RADIUS_M},${center.lat},${center.lng})`;
      const q = `[out:json][timeout:40];(relation["type"="route"]["route"="ferry"]${around};)->.r;.r out body;node(r.r);out tags;way(r.r);out tags;`;
      const data = await overpassFetch(q) as Parameters<typeof parseFerryDestinationsResponse>[0];
      result = parseFerryDestinationsResponse(data, port).sort((a, b) => a.localeCompare(b));
    }
  } catch { /* leave empty — the combobox still allows free-text entry */ }
  _ferryDestCache.set(key, result);
  return result;
}

const _portCache = new Map<string, Array<{ name: string; city?: string }>>();

// Regional ferry-port search, scoped to a TRIP CITY (not the whole country):
// the curated per-country hub list only carries a handful of "main" ports,
// and the live Nominatim search only kicks in once the user has typed 3+
// characters (see useRemoteHubs) — so opening the departure-port field blank
// showed almost nothing beyond the biggest ports. A first version of this
// scoped the search to the trip's WHOLE country via its admin-boundary area
// (same technique as the transit-line search) — but for anything bigger than
// a small country that area is enormous, and the query silently failed/timed
// out under Overpass's [timeout], returning nothing at all — which is why an
// island trip (e.g. Ibiza ↔ Formentera, both trip cities in the same
// country) still showed no port for either city. Scoping to a radius AROUND
// EACH TRIP CITY instead (same technique as fetchFerryDestinations, just
// centred on a city rather than an already-picked port) keeps the query
// small and reliable while still covering exactly the places the trip is
// actually about.
const PORT_RADIUS_M = 60000;
async function fetchPortsNearCity(city: string): Promise<Array<{ name: string; city?: string }>> {
  const key = city.trim().toLowerCase();
  if (!key) return [];
  if (_portCache.has(key)) return _portCache.get(key)!;
  let result: Array<{ name: string; city?: string }> = [];
  try {
    const center = await geocodePlaceName(city);
    if (center) {
      const around = `(around:${PORT_RADIUS_M},${center.lat},${center.lng})`;
      const q = `[out:json][timeout:40];(node["amenity"="ferry_terminal"]${around};way["amenity"="ferry_terminal"]${around};relation["amenity"="ferry_terminal"]${around};);out tags center;`;
      const data = await overpassFetch(q) as { elements: Array<{ tags?: Record<string, string> }> };
      const seen = new Set<string>();
      for (const el of data.elements) {
        const name = el.tags?.name;
        if (!name) continue;
        const k = name.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        result.push({ name, city: el.tags?.["addr:city"] });
      }
      result.sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch { /* leave empty — the curated list + live search still work */ }
  _portCache.set(key, result);
  return result;
}

const TRANSIT_COLOR_ACTIVE: Record<string, string> = {
  // Silver, fixed regardless of light/dark theme (matches the Profile page's
  // treno colour — Tailwind arbitrary-value classes since this is a literal
  // hex, not one of the built-in palette shades).
  train: "border-[#c0c0c0] bg-[#c0c0c0] text-white",
  bus:   "border-sky-500 bg-sky-500 text-white",
  metro: "border-violet-500 bg-violet-500 text-white",
  tram:  "border-emerald-500 bg-emerald-500 text-white",
  car:   "border-red-500 bg-red-500 text-white",
  moto:  "border-orange-500 bg-orange-500 text-white",
  taxi:  "border-yellow-500 bg-yellow-500 text-white",
  ferry: "border-sky-300 bg-sky-300 text-white",
};
const TRANSIT_COLOR_INACTIVE: Record<string, string> = {
  train: "border-[#c0c0c0]/40 text-[#c0c0c0] hover:bg-[#c0c0c0]/10",
  bus:   "border-sky-400/40 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20",
  metro: "border-violet-400/40 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20",
  tram:  "border-emerald-400/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20",
  car:   "border-red-400/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20",
  moto:  "border-orange-400/40 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20",
  taxi:  "border-yellow-400/40 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950/20",
  ferry: "border-sky-300/40 text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-950/20",
};
const TRANSIT_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  train: TrainFront,
  bus:   Bus,
  metro: MetroWagonIcon,
  tram:  TramFront,
  car:   Car,
  moto:  Bike,
  taxi:  CarTaxiFront,
  ferry: Ship,
};
// Colour per transit mode — mirrors the edit screen's mode picker
// (amber/sky/violet/emerald/red/green/yellow) so the timeline legs match
// those colours. car/moto/taxi used to be missing here entirely, which made
// their leg-row icon silently fall back to a flat gray instead of picking up
// a colour like every other mode.
const TRANSIT_TEXT: Record<string, string> = {
  // Silver, fixed regardless of light/dark theme — matches the treno colour
  // used on the Profile page's transport stats.
  train: "text-[#c0c0c0]",
  bus:   "text-sky-500",
  metro: "text-violet-500",
  tram:  "text-emerald-500",
  car:   "text-red-500",
  moto:  "text-orange-500",
  taxi:  "text-yellow-500",
  ferry: "text-sky-300",
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
  // Re-renders this view once a background translation of a non-Latin stop
  // name resolves (see withRomanization/useTranslationTick in romanize.ts).
  useTranslationTick();
  const qc = useQueryClient();
  const tripFn = useServerFn(getTrip);
  const itemFn = useServerFn(listItems);
  const delFn = useServerFn(deleteItem);
  const profFn = useServerFn(getProfile);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const items = useQuery({ queryKey: ["items", tripId], queryFn: () => itemFn({ data: { trip_id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profFn() });

  // Prefetch each transit line's OSM stops so official English names get
  // registered — then the transliteration helper can prefer them in the UI.
  const [, forceEnRerender] = useState(0);
  useEffect(() => {
    const rows = (items.data ?? []) as ItemRow[];
    const targets = new Map<string, { city: string; osm: string; ref: string }>();
    for (const it of rows) {
      const legs = (it.meta as { mixed_legs?: Array<{ mode: string; vehicle?: string }> } | null)?.mixed_legs ?? [];
      for (const l of legs) {
        const osm = OSM_ROUTE_MODE[l.mode];
        if (osm && it.location && l.vehicle) {
          targets.set(`${it.location}|${osm}|${l.vehicle}`, { city: it.location, osm, ref: l.vehicle });
        }
      }
    }
    if (targets.size === 0) return;
    let cancelled = false;
    (async () => {
      for (const { city, osm, ref } of targets.values()) {
        try { await fetchLineStops(city, osm, ref); } catch { /* ignore */ }
      }
      if (!cancelled) forceEnRerender((n) => n + 1);
    })();
    return () => { cancelled = true; };
  }, [items.data]);

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
  // Places already used anywhere in the trip — highlighted back in the
  // road/train pickers so re-picking one (same station, same landmark) is
  // quick instead of hunting through the full POI/station list.
  const usedPlaces = collectUsedPlaces(list);
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
      <TripStats trip={trip.data} tripId={tripId} isWishlist={isWishlist} wishlistDays={maxDayIndex} />

      <div className="space-y-6">
        <JourneyBlock tripId={tripId} outbound={outbound} ret={ret} tripCountries={hubCountries} usedPlaces={usedPlaces} />
        <LodgingsBlock tripId={tripId} lodgings={lodgings} tripCities={tripCities} tripCountries={tripCountries} onDelete={del} />

        <div className="space-y-3">
          {groups.map((g) => (
            <section key={g.label} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{g.label}</h3>
                <AddItemDialog
                  tripId={tripId}
                  tripCities={tripCities}
                  tripCountries={hubCountries}
                  usedPlaces={usedPlaces}
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
                                {withRomanization(stopMeta.from_stop, lang)}{stopMeta.to_stop ? ` → ${withRomanization(stopMeta.to_stop, lang)}` : ""}
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
                            beside its line/stops, highlighted in the mode colour.
                            Column widths deliberately mirror the header row above
                            (2rem icon column = the h-8 circle, gap-x-3 = the
                            header's own gap-3) so the small icon sits centred
                            under the big coloured circle and the grey time lines
                            up with the big white time's left edge, instead of
                            both drifting left under the title text. */}
                        {mixedLegs.length > 0 && (
                          // One shared grid for all legs → line refs, times and
                          // stops line up in fixed columns (no jagged in/out).
                          <div className="mt-2 grid grid-cols-[2rem_auto_1fr] items-start gap-x-3 gap-y-1 text-xs">
                            {mixedLegs.map((leg, i) => {
                              const LIcon = TRANSIT_ICON[leg.mode] ?? Bus;
                              const color = TRANSIT_TEXT[leg.mode] ?? "text-muted-foreground";
                              return (
                                <Fragment key={i}>
                                  {/* Column 1 — mode icon only, centred in a 2rem
                                      column (same width as the h-8 circle above). */}
                                  <div className="flex items-center justify-center">
                                    <LIcon className={cn("h-4 w-4 shrink-0", color)} />
                                    {leg.vehicle && (
                                      <p className={cn("font-semibold", color)}>
                                        {withRomanization(leg.vehicle, lang)}
                                      </p>
                                    )}
                                  </div>
                                  {/* Column 2 — departure time, starts exactly where
                                      the big time column starts above. */}
                                  <div className="tabular-nums text-muted-foreground">{leg.depart_at || ""}</div>
                                  {/* Column 3 — line ref + boarding/alighting stops, stacked */}
                                  <div className="min-w-0 space-y-0.5 text-muted-foreground">
                                    {leg.from_stop && <ScrollText>{withRomanization(leg.from_stop, lang)}</ScrollText>}
                                    {leg.to_stop && <ScrollText>→ {withRomanization(leg.to_stop, lang)}</ScrollText>}
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
            tripCountries={hubCountries}
            usedPlaces={usedPlaces}
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
  tripId,
  isWishlist,
  wishlistDays,
}: {
  trip: { start_date: string; end_date: string; created_at: string };
  tripId: string;
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
  // A trip added retroactively (already underway/past by the time it was
  // logged) has no use for a packing checklist — that only helps you prepare
  // for a trip still ahead of you. Compare the trip's own start date against
  // its insertion date (created_at), not "today", so a genuinely future trip
  // keeps its packing card even once its start date arrives.
  const isRetroactiveTrip = !isWishlist && trip.start_date < trip.created_at.slice(0, 10);
  return (
    <div className={cn("mb-4 grid gap-3", !isRetroactiveTrip && "sm:grid-cols-2")}>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <CalendarDays className="h-5 w-5 text-primary" />
        <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">{isWishlist ? t("planned_label") : t("duration")}</p>
        <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">
          {isWishlist ? (days > 0 ? `${days} ${t("nights")}` : "—") : `${days} ${t("nights")}`}
        </p>
      </div>
      {!isRetroactiveTrip && <PackingListCard tripId={tripId} />}
    </div>
  );
}

type PackItem = { id: string; name: string; checked: boolean };

function loadPackingList(tripId: string): PackItem[] {
  try {
    const raw = localStorage.getItem(`packing_${tripId}`);
    return raw ? (JSON.parse(raw) as PackItem[]) : [];
  } catch {
    return [];
  }
}

function savePackingList(tripId: string, items: PackItem[]) {
  try {
    localStorage.setItem(`packing_${tripId}`, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

// Replaces the old in-timeline "Spese" summary (already shown in its own
// tab) with a clickable packing-list card — opens a dialog where the user
// keeps a per-trip checklist of things to bring, persisted in localStorage.
function PackingListCard({ tripId }: { tripId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PackItem[]>(() => loadPackingList(tripId));
  const [draft, setDraft] = useState("");

  useEffect(() => { setItems(loadPackingList(tripId)); }, [tripId]);

  function persist(next: PackItem[]) {
    setItems(next);
    savePackingList(tripId, next);
  }

  function addItem() {
    const name = draft.trim();
    if (!name) return;
    persist([...items, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, checked: false }]);
    setDraft("");
  }

  function toggleItem(id: string) {
    persist(items.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)));
  }

  function removeItem(id: string) {
    persist(items.filter((it) => it.id !== id));
  }

  const doneCount = items.filter((it) => it.checked).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:brightness-105"
        >
          <Luggage className="h-5 w-5 text-primary" />
          <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t("packing_list", { defaultValue: "Cose da portare" })}
          </p>
          <p className="mt-0.5 font-serif text-2xl font-semibold tabular-nums">
            {items.length > 0 ? `${doneCount}/${items.length}` : "—"}
          </p>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("packing_list", { defaultValue: "Cose da portare" })}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
            placeholder={t("add_packing_item", { defaultValue: "Aggiungi oggetto…" })}
          />
          <Button type="button" size="icon" onClick={addItem} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("packing_list_empty", { defaultValue: "Nessun oggetto in lista." })}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleItem(it.id)}
                  aria-label={it.checked ? t("completed") : t("mark_done", { defaultValue: "Segna come fatto" })}
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                    it.checked
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-border text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <span className={cn("flex-1 text-sm", it.checked && "text-muted-foreground line-through")}>
                  {it.name}
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  aria-label={t("delete")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition hover:bg-foreground/8 hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
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
  tripId, outbound, ret, tripCountries, usedPlaces,
}: { tripId: string; outbound: JourneyItem | undefined; ret: JourneyItem | undefined; tripCountries: string[]; usedPlaces?: string[] }) {
  return (
    <div className="space-y-3">
      <JourneyLeg tripId={tripId} kind="outbound" item={outbound} tripCountries={tripCountries} usedPlaces={usedPlaces} />
      <JourneyLeg tripId={tripId} kind="return" item={ret} tripCountries={tripCountries} usedPlaces={usedPlaces} />
    </div>
  );
}

function JourneyLeg({
  tripId, kind, item, tripCountries, usedPlaces,
}: { tripId: string; kind: "outbound" | "return"; item: JourneyItem | undefined; tripCountries: string[]; usedPlaces?: string[] }) {
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
  // Per-leg modes — when the journey changes vehicle (e.g. train → car) we show
  // the sequence of mode icons instead of a single one.
  const legModes = (legs.length > 0 ? legs.map((l) => l.mode ?? meta?.mode) : [meta?.mode])
    .filter(Boolean) as TransportMode[];
  const multiMode = new Set(legModes).size > 1;

  const departISO = first?.depart_at || item?.start_at || null;
  const arriveISO = last?.arrive_at || item?.end_at || null;
  const [realDuration, setRealDuration] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setRealDuration(null);
    if (departISO && arriveISO && fromCity && toCity) {
      realDurationMs(departISO, arriveISO, fromCity, toCity).then((ms) => {
        if (!cancelled) setRealDuration(ms);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [departISO, arriveISO, fromCity, toCity]);
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
      usedPlaces={usedPlaces}
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
                    <span className="whitespace-nowrap">
                      {(realDuration != null ? formatDurationMs(realDuration) : null) || durationLabel(departISO, arriveISO) || "—"}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/70" />
                      <span className="h-px w-3 bg-white/40 sm:w-6" />
                      {multiMode ? (
                        legModes.map((m, idx) => {
                          const Ic = MODE_ICON[m] ?? ModeIcon;
                          return (
                            <Fragment key={idx}>
                              {idx > 0 && <span className="h-px w-2 bg-white/40 sm:w-3" />}
                              <Ic className="h-4 w-4 shrink-0" />
                            </Fragment>
                          );
                        })
                      ) : (
                        <ModeIcon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="h-px w-3 bg-white/40 sm:w-6" />
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
            {l.waypoints && l.waypoints.length > 0 && (
              <span className="ml-1.5 opacity-80">· {wpL(lang).via} {l.waypoints.map((w) => w.name).join(", ")}</span>
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
  usedPlaces,
}: {
  tripId: string;
  kind: "outbound" | "return";
  existing?: { id: string; meta: TransportMeta | null };
  trigger: React.ReactNode;
  tripCountries?: string[];
  usedPlaces?: string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const qc = useQueryClient();
  const createFn = useServerFn(createItem);
  const delFn = useServerFn(deleteItem);
  const [open, setOpen] = useState(false);
  // A journey can now mix several modes — each leg carries its own `mode`
  // (e.g. train + car, car + plane). Legacy items stored a single meta.mode which
  // becomes every leg's fallback mode.
  const seedLegs = (): Leg[] => {
    const fallback = (existing?.meta?.mode as TransportMode) ?? "plane";
    const ex = existing?.meta?.legs;
    if (ex && ex.length > 0) {
      return ex.map((l) => {
        const m = ((l as { mode?: TransportMode }).mode ?? fallback) as TransportMode;
        return { ...emptyLeg(m), ...l, mode: m };
      });
    }
    return [emptyLeg(fallback)];
  };
  const [legs, setLegs] = useState<Leg[]>(seedLegs);

  // The dialog stays mounted around its trigger, so the useState initializer runs
  // once — before the trip's items have loaded (existing = undefined). Re-seed the
  // form from `existing` every time the dialog opens, so editing an already-saved
  // journey shows its data instead of an empty form.
  useEffect(() => {
    if (!open) return;
    setLegs(seedLegs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function updateLeg(i: number, patch: Partial<Leg>) {
    setLegs((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Geographic corridor from the FIRST road leg (car/moto/taxi) — used to limit
  // the waypoint city suggestions to the countries that leg actually crosses.
  const roadLeg = legs.find((l) => isRoadMode(l.mode));
  const roadFrom = roadLeg?.from ?? "";
  const roadTo = roadLeg?.to ?? "";

  // Soft default for the road-leg city step: the adjacent leg's handoff point,
  // else the trip's first known city — just a starting suggestion the user can
  // freely change, NOT an assumption that departure and arrival share a city
  // (a car/moto/taxi leg may well start and end in two different cities).
  const countryCities = tripCountries.flatMap((iso) => citiesOfCountry(iso));
  const matchCity = (raw?: string): { name: string; country: string } | null => {
    const q = (raw ?? "").trim().toLowerCase();
    if (!q) return null;
    const hit = countryCities.find((c) => c.name.toLowerCase() === q);
    return hit ? { name: hit.name, country: hit.country } : null;
  };
  const firstTripCity = countryCities[0] ? { name: countryCities[0].name, country: countryCities[0].country } : null;
  const cityHintFor = (suggested?: string): { name: string; country: string } | null =>
    matchCity(suggested) ?? firstTripCity;
  const [corridorBox, setCorridorBox] = useState<CorridorBox | null>(null);
  useEffect(() => {
    const from = roadFrom.trim(), to = roadTo.trim();
    if (!from || !to) { setCorridorBox(null); return; }
    let alive = true;
    (async () => {
      const [a, b] = await Promise.all([geocodePlaceName(from), geocodePlaceName(to)]);
      if (!alive || !a || !b) return;
      const m = 1.5; // degrees of margin around the direct corridor
      setCorridorBox({
        minLat: Math.min(a.lat, b.lat) - m, maxLat: Math.max(a.lat, b.lat) + m,
        minLng: Math.min(a.lng, b.lng) - m, maxLng: Math.max(a.lng, b.lng) + m,
      });
    })();
    return () => { alive = false; };
  }, [roadFrom, roadTo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const first = legs[0];
      const last = legs[legs.length - 1];
      const journeyMode = first?.mode ?? "car";
      const title = `${t(`mode_${journeyMode}`)} ${[first?.from, last?.to].filter(Boolean).join(" → ") || ""}`.trim();
      // Drop empty waypoint rows before saving.
      const cleanLegs = legs.map((l) => {
        const wp = (l.waypoints ?? []).filter((w) => w.name.trim());
        return wp.length ? { ...l, waypoints: wp } : { ...l, waypoints: undefined };
      });
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
          meta: { mode: journeyMode, legs: cleanLegs },
        },
      });
      qc.invalidateQueries({ queryKey: ["items", tripId] });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error_generic"));
    }
  }

  const fromLabelOf = (m: TransportMode) => (m === "train" || m === "metro" || m === "tram") ? t("from_station")
    : m === "plane" ? t("from_airport") : m === "ferry" ? t("from_port") : t("from_point");
  const toLabelOf = (m: TransportMode) => (m === "train" || m === "metro" || m === "tram") ? t("to_station")
    : m === "plane" ? t("to_airport") : m === "ferry" ? t("to_port") : t("to_point");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(kind)}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-3">
            {legs.map((leg, i) => (
              <div key={i} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {legs.length === 1 ? t("route") : `${t("route")} ${i + 1}`}
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
                {/* Per-leg transport mode — lets a journey mix modes (train+car…). */}
                <div className="mb-2 grid grid-cols-4 gap-1.5">
                  {(Object.keys(MODE_ICON) as TransportMode[]).map((m) => {
                    const Icon = MODE_ICON[m];
                    const active = m === leg.mode;
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => updateLeg(i, { mode: m })}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] transition ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {t(`mode_${m}`)}
                      </button>
                    );
                  })}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{fromLabelOf(leg.mode)}</Label>
                    <HubCombobox
                      mode={leg.mode}
                      countries={tripCountries}
                      value={leg.from}
                      onChange={(v) => updateLeg(i, { from: v })}
                      placeholder={fromLabelOf(leg.mode)}
                      suggested={legs[i - 1]?.to?.trim() || undefined}
                      cityHint={cityHintFor(legs[i - 1]?.to?.trim() || undefined)}
                      usedPlaces={usedPlaces}
                      journeyMode
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{toLabelOf(leg.mode)}</Label>
                    <HubCombobox
                      mode={leg.mode}
                      countries={tripCountries}
                      value={leg.to}
                      onChange={(v) => updateLeg(i, { to: v })}
                      placeholder={toLabelOf(leg.mode)}
                      suggested={legs[i + 1]?.from?.trim() || undefined}
                      cityHint={cityHintFor(legs[i + 1]?.from?.trim() || undefined)}
                      usedPlaces={usedPlaces}
                      journeyMode
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("depart_date")} <span className="opacity-60">{t("optional")}</span></Label>
                    <DateField
                      value={leg.depart_at ? leg.depart_at.slice(0, 10) : ""}
                      onChange={(date) => {
                        const time = leg.depart_at ? leg.depart_at.slice(11, 16) : "";
                        updateLeg(i, { depart_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("depart_time")} <span className="opacity-60">{t("optional")}</span></Label>
                    <TimeField
                      value={leg.depart_at && leg.depart_at.slice(11, 16) !== "00:00" ? leg.depart_at.slice(11, 16) : ""}
                      onChange={(time) => {
                        const date = leg.depart_at ? leg.depart_at.slice(0, 10) : "";
                        updateLeg(i, { depart_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("arrive_date")} <span className="opacity-60">{t("optional")}</span></Label>
                    <DateField
                      value={leg.arrive_at ? leg.arrive_at.slice(0, 10) : ""}
                      onChange={(date) => {
                        const time = leg.arrive_at ? leg.arrive_at.slice(11, 16) : "";
                        updateLeg(i, { arrive_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("arrive_time")} <span className="opacity-60">{t("optional")}</span></Label>
                    <TimeField
                      value={leg.arrive_at && leg.arrive_at.slice(11, 16) !== "00:00" ? leg.arrive_at.slice(11, 16) : ""}
                      onChange={(time) => {
                        const date = leg.arrive_at ? leg.arrive_at.slice(0, 10) : "";
                        updateLeg(i, { arrive_at: date ? `${date}T${time || "00:00"}` : "" });
                      }}
                    />
                  </div>
                  {(leg.mode === "train" || leg.mode === "plane" || leg.mode === "ferry") && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {leg.mode === "plane" ? t("airline") : leg.mode === "train" ? t("operator_label") : t("company")}
                        </Label>
                        <Input
                          value={leg.carrier}
                          onChange={(e) => updateLeg(i, { carrier: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          {leg.mode === "plane" ? t("flight_number") : leg.mode === "train" ? t("train_number") : t("service_number")}
                        </Label>
                        <Input
                          value={leg.number}
                          onChange={(e) => updateLeg(i, { number: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>
                {isRoadMode(leg.mode) && (
                  <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                    {/* City stops — a pin where you actually stop in the town. */}
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {wpL(lang).cities} <span className="opacity-60">{t("optional")}</span>
                      </Label>
                      {(leg.waypoints ?? []).map((w, wi) => (
                        <div key={wi} className="flex items-center gap-2">
                          <WaypointCombobox
                            value={w.name}
                            box={corridorBox}
                            lang={lang}
                            placeholder={wpL(lang).place}
                            onType={(name) =>
                              updateLeg(i, { waypoints: (leg.waypoints ?? []).map((x, xi) => (xi === wi ? { ...x, name, enter: true, lat: undefined, lng: undefined, country: undefined } : x)) })
                            }
                            onPick={(s) =>
                              updateLeg(i, { waypoints: (leg.waypoints ?? []).map((x, xi) => (xi === wi ? { ...x, name: s.name, enter: true, lat: s.lat, lng: s.lng, country: s.country } : x)) })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => updateLeg(i, { waypoints: (leg.waypoints ?? []).filter((_, xi) => xi !== wi) })}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => updateLeg(i, { waypoints: [...(leg.waypoints ?? []), { name: "", enter: true }] })}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> {wpL(lang).addCity}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLegs((arr) => [...arr, emptyLeg(arr[arr.length - 1]?.mode ?? "car")])}
              className="w-full"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("add_layover")}
            </Button>
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

// ── Custom time picker ──────────────────────────────────────────────────
// Replaces the plain `<Input type="time">` for every time field in this
// dialog. On mobile Safari/WebKit, a native `<input type="time">` opens an
// OS picker sheet that anchors itself to the input's on-screen position —
// but this dialog (DialogContent, see components/ui/dialog.tsx) is centered
// with a CSS `transform: translate(-50%,-50%)` on a `position: fixed`
// ancestor, and WebKit is known to miscompute the anchor rect through that
// transform. The visible symptoms are exactly what got reported: the picker
// sheet isn't centered, the departure/arrival time boxes underneath render
// overlapping/oversized while it's open, and the sheet touches the left/
// right edges but not the top/bottom with square corners. None of that is
// fixable with CSS since it's the OS's own native control — so instead this
// swaps in a fully custom picker (two scrollable hour/minute columns inside
// an actually-centered, rounded, margin-on-all-sides dialog) that never
// touches a native date/time form control, sidestepping the bug entirely.
const TIME_HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const TIME_MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const TIME_WHEEL_ITEM_H = 36; // px — must match the button's h-9 below
const TIME_WHEEL_PAD = 72; // px — top/bottom spacer so the first/last item can center

function TimeWheelColumn({
  values, selected, onPick,
}: {
  values: string[];
  selected: string;
  onPick: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const idx = values.indexOf(selected);
    if (idx >= 0 && ref.current) {
      ref.current.scrollTop = idx * TIME_WHEEL_ITEM_H;
    }
    // Only on mount (dialog open) — not on every keystroke of `selected`,
    // so clicking an item doesn't fight the user's own scroll position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="h-48 w-16 snap-y snap-mandatory overflow-y-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div style={{ height: TIME_WHEEL_PAD }} aria-hidden />
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => {
            onPick(v);
            const idx = values.indexOf(v);
            if (ref.current) ref.current.scrollTo({ top: idx * TIME_WHEEL_ITEM_H, behavior: "smooth" });
          }}
          className={cn(
            "flex h-9 w-full shrink-0 snap-center items-center justify-center text-base tabular-nums transition",
            v === selected ? "font-semibold text-primary" : "text-muted-foreground",
          )}
        >
          {v}
        </button>
      ))}
      <div style={{ height: TIME_WHEEL_PAD }} aria-hidden />
    </div>
  );
}

function TimeField({
  value, onChange, className, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hh, setHh] = useState(value ? value.slice(0, 2) : "12");
  const [mm, setMm] = useState(value ? value.slice(3, 5) : "00");

  function handleOpenChange(v: boolean) {
    if (v) {
      setHh(value ? value.slice(0, 2) : "12");
      setMm(value ? value.slice(3, 5) : "00");
    }
    setOpen(v);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-left text-sm tabular-nums ring-offset-background transition-colors hover:bg-accent/40",
          !value && "text-muted-foreground",
          className,
        )}
      >
        {value || placeholder || "--:--"}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {/* Overrides DialogContent's default `sm:rounded-lg`/full-bleed-on-
            mobile sizing: a fixed, narrow, always-rounded card with margin
            on every side, exactly what was asked for instead of a sheet
            that touches the screen's left/right edges. */}
        <DialogContent className="w-[min(88vw,300px)] max-w-none rounded-2xl p-4">
          <div className="flex items-center justify-center gap-2">
            <TimeWheelColumn values={TIME_HOURS} selected={hh} onPick={setHh} />
            <span className="text-lg font-semibold text-muted-foreground">:</span>
            <TimeWheelColumn values={TIME_MINUTES} selected={mm} onPick={setMm} />
          </div>
          <DialogFooter className="mt-1 flex-row items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("reset_time")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onChange(`${hh}:${mm}`);
                setOpen(false);
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Custom date picker ──────────────────────────────────────────────────
// Same rationale and shape as `TimeField` above: a native `<input
// type="date">`'s OS picker sheet suffers the exact same WebKit anchoring
// bug inside this app's `transform`-centered dialogs, and it was the actual
// cause of the "Inizio"/"Fine" field's own box rendering oversized/
// overflowing the dialog — not a plain CSS sizing mistake. Replacing it with
// this fully custom picker (day/month/year wheels in the same rounded,
// properly-centered card as TimeField) sidesteps the bug and gives every
// date AND time field in the app one consistent look, as requested.
const DATE_DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));
const DATE_MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
// A generous but bounded travel-planning window — wide enough for a trip
// booked years ahead or logged years after the fact, without an unbounded
// (and mostly irrelevant) scroll range.
function dateYearsAround(centerYear: number): string[] {
  const years: string[] = [];
  for (let y = centerYear - 4; y <= centerYear + 8; y++) years.push(String(y));
  return years;
}

function DateField({
  value, onChange, className, placeholder,
}: {
  value: string; // "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [yyyy, setYyyy] = useState(value ? value.slice(0, 4) : String(now.getFullYear()));
  const [mm, setMm] = useState(value ? value.slice(5, 7) : String(now.getMonth() + 1).padStart(2, "0"));
  const [dd, setDd] = useState(value ? value.slice(8, 10) : String(now.getDate()).padStart(2, "0"));
  const years = useMemo(() => dateYearsAround(Number(yyyy) || now.getFullYear()), [yyyy]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleOpenChange(v: boolean) {
    if (v) {
      const d = new Date();
      setYyyy(value ? value.slice(0, 4) : String(d.getFullYear()));
      setMm(value ? value.slice(5, 7) : String(d.getMonth() + 1).padStart(2, "0"));
      setDd(value ? value.slice(8, 10) : String(d.getDate()).padStart(2, "0"));
    }
    setOpen(v);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background transition-colors hover:bg-accent/40",
          !value && "text-muted-foreground",
          className,
        )}
      >
        {value ? fmtDate(value, lang) : placeholder || t("select_day")}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="w-[min(92vw,340px)] max-w-none rounded-2xl p-4">
          <div className="flex items-center justify-center gap-1.5">
            <TimeWheelColumn values={DATE_DAYS} selected={dd} onPick={setDd} />
            <TimeWheelColumn values={DATE_MONTHS} selected={mm} onPick={setMm} />
            <TimeWheelColumn values={years} selected={yyyy} onPick={setYyyy} />
          </div>
          <DialogFooter className="mt-1 flex-row items-center justify-between sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              {t("reset_time")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onChange(`${yyyy}-${mm}-${dd}`);
                setOpen(false);
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddItemDialog({
  tripId,
  defaultKind = "activity",
  trigger,
  tripCities = [],
  tripCountries = [],
  usedPlaces,
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
  usedPlaces?: string[];
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
      from_stop: "",
      to_stop: "",
      selectedTransit: (isMulti
        ? [...new Set(exLegs.map((l) => l.mode))]
        : (STOP_KINDS.has(exKind) || ROAD_KINDS.has(exKind)) ? [exKind] : []) as string[],
      // Any transit/road item is edited through the multi-leg UI. A legacy
      // single stop-based item is converted into one leg so it can be
      // extended. A legacy road-mode item (pre-dating the from/to fields
      // below) stored its single point in `location` — reuse that as the
      // starting "from" point so it isn't lost when the item is edited.
      mixedLegs: isMulti
        ? [...exLegs]
        : (STOP_KINDS.has(exKind) || ROAD_KINDS.has(exKind))
          ? [{
              ...emptyMixedLeg(),
              mode: exKind as MixedLeg["mode"],
              from_stop: exMeta?.from_stop ?? (ROAD_KINDS.has(exKind) ? (existing?.location ?? "") : ""),
              to_stop: exMeta?.to_stop ?? "",
            }]
          : ([] as MixedLeg[]),
    };
  };
  const [form, setForm] = useState(seedForm);

  function handleOpenChange(v: boolean) {
    if (v) setForm(seedForm());
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
    { kind: "metro" as (typeof ITEM_KINDS)[number], icon: MetroWagonIcon, label: t("metro") },
    { kind: "tram" as (typeof ITEM_KINDS)[number], icon: TramFront, label: t("tram") },
    { kind: "car", icon: Car, label: t("car") },
    { kind: "taxi" as (typeof ITEM_KINDS)[number], icon: CarTaxiFront, label: t("taxi") },
    { kind: "moto" as (typeof ITEM_KINDS)[number], icon: Bike, label: t("moto") },
    { kind: "ferry", icon: Ship, label: t("ferry") },
  ];

  const isMultiModal = form.selectedTransit.length >= 2;
  const hasTransit = form.selectedTransit.length >= 1;
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

  // City to anchor a road-mode leg's point-of-interest/address search at —
  // this activity's own "location" field (the city it's set in), when it
  // matches a known city; falls back to no hint (still usable, just without
  // the POI list) if the activity's location hasn't been set yet.
  const roadLocQ = form.location.trim().toLowerCase();
  const roadCityHint = roadLocQ
    ? (() => {
        const hit = countryCities.find((c) => c.name.toLowerCase() === roadLocQ);
        return hit ? { name: hit.name, country: hit.country } : null;
      })()
    : null;

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
              // Any public-transport selection (even a single mode) is saved as
              // one or more legs, so several lines of the same mode are allowed.
              const usingLegs = form.selectedTransit.length >= 1;
              const legs = form.mixedLegs.filter((l) => l.from_stop || l.to_stop || l.vehicle);
              const distinctModes = [...new Set(legs.map((l) => l.mode))];
              const submitKind = (usingLegs
                ? (distinctModes.length > 1 ? "transfer" : (distinctModes[0] ?? form.selectedTransit[0]))
                : form.kind) as (typeof ITEM_KINDS)[number];
              const meta = usingLegs ? { mixed_legs: legs } : undefined;
              // Se manca l'orario di "Orario inizio"/"Orario fine" ma è stato
              // inserito l'orario di partenza/arrivo di una tratta, usa
              // quello. `form.start_at`/`form.end_at` are never actually an
              // empty string once a day is picked — seedForm() above fills
              // them with that day's date + "T00:00" as a placeholder, so a
              // simple `form.start_at || ...` fallback never fires: the
              // seeded midnight value is always truthy. Instead, treat the
              // TIME portion specifically as "not chosen yet" whenever it's
              // still exactly "00:00" (the untouched seed), and in that case
              // swap in the leg's own time while keeping the activity's own
              // chosen DATE — a leg's depart_at/arrive_at is only a bare
              // "HH:mm" (a <input type="time">, no date of its own), so it
              // can't be used as a full start_at/end_at on its own.
              const firstLegDepart = usingLegs ? (legs[0]?.depart_at ?? "") : "";
              const lastLegArrive = usingLegs ? (legs[legs.length - 1]?.arrive_at ?? "") : "";
              // `fallbackDate` anchors end_at to the activity's own start_at day
              // when end_at itself has no date at all yet (a same-day activity
              // is the sane default absent any other signal).
              const withLegTimeFallback = (activityDateTime: string, legTime: string, fallbackDate: string): string | null => {
                if (!legTime) return activityDateTime || null;
                const datePart = (activityDateTime || fallbackDate || "").slice(0, 10);
                if (!datePart) return activityDateTime || null;
                const timePart = activityDateTime.slice(11, 16);
                if (!timePart || timePart === "00:00") return `${datePart}T${legTime}`;
                return activityDateTime;
              };
              const resolvedStartAt = withLegTimeFallback(form.start_at, firstLegDepart, form.start_at) || null;
              const resolvedEndAt = withLegTimeFallback(form.end_at, lastLegArrive, form.start_at) || null;
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
                    const isTransit = STOP_KINDS.has(kind) || ROAD_KINDS.has(kind);
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
                            setForm((f) => ({
                              ...f,
                              kind: nextTransit.length === 1
                                ? nextTransit[0] as (typeof ITEM_KINDS)[number]
                                : nextTransit.length === 0 ? "activity" : f.kind,
                              selectedTransit: nextTransit,
                              // Seed one leg per selected mode the first time; keep
                              // existing legs afterwards (add more via "add leg").
                              mixedLegs:
                                nextTransit.length === 0
                                  ? []
                                  : f.mixedLegs.length === 0
                                    ? nextTransit.map((m) => ({ ...emptyMixedLeg(), mode: m as MixedLeg["mode"] }))
                                    : f.mixedLegs,
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
          {/* Hidden for train legs: the country+station picker below already
              captures precise departure/arrival stations per leg, making this
              generic single-city field redundant (and potentially confusing,
              since it plays no part in how train legs are resolved). Still
              shown for every other kind, including road modes (car/moto/taxi),
              which use it to anchor their point-of-interest search. */}
          {!form.selectedTransit.includes("train") && (
          <div className="space-y-1.5">
            <Label>{t("location")}</Label>
            {/* Was a Radix Popover+Command sized via the
                `--radix-popover-trigger-width` CSS var — that var is only set
                once Radix's own ResizeObserver has actually measured the
                trigger, so on first open (and, worse, intermittently
                depending on render timing) the popover could paint at its
                unstyled shrink-to-fit width instead, one frame narrower than
                the trigger button — exactly the "città non ha la stessa
                dimensione delle tratte" mismatch, since every OTHER picker
                in this file (HubCombobox, LineCombobox, …) uses this same
                plain `relative` + `absolute left-0 right-0` pattern instead,
                which is never at the mercy of any async measurement and
                always matches the input's width exactly, every time. Rebuilt
                on that same pattern for both a guaranteed-consistent width
                AND the single shared dropdown style already used everywhere
                else. */}
            <div className="relative">
              <Input
                value={locOpen ? locQuery : form.location}
                placeholder={t("location")}
                onFocus={() => { setLocQuery(form.location); setLocOpen(true); }}
                onBlur={() => setTimeout(() => setLocOpen(false), 150)}
                onChange={(e) => setLocQuery(e.target.value)}
                autoComplete="off"
              />
              {locOpen && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
                  {matchTrip.length === 0 && matchExtras.length === 0 && !locQuery && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("no_cities")}</div>
                  )}
                  {locQuery.trim() && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm({ ...form, location: locQuery.trim() });
                        setLocOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t("use_value", { name: locQuery.trim() })}</span>
                    </button>
                  )}
                  {matchTrip.length > 0 && (
                    <div className="py-0.5">
                      <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("trip_stops")}
                      </p>
                      {matchTrip.map((c) => {
                        const sel = form.location === c.name;
                        return (
                          <button
                            type="button"
                            key={`trip-${c.country}-${c.name}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm({ ...form, location: c.name });
                              setLocOpen(false);
                            }}
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
                  {matchExtras.length > 0 && (
                    <div className="py-0.5">
                      <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("other_cities_label")}
                      </p>
                      {matchExtras.map((c) => {
                        const sel = form.location === c.name;
                        return (
                          <button
                            type="button"
                            key={`x-${c.country}-${c.name}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setForm({ ...form, location: c.name });
                              setLocOpen(false);
                            }}
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
              )}
            </div>
          </div>
          )}
          {hasTransit && (
            <div className="space-y-2">
              <Label>{t("legs_label")}</Label>
              {form.mixedLegs.map((leg, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  {/* Mode picker (only with >1 modes) + remove-leg button */}
                  {(form.selectedTransit.length > 1 || form.mixedLegs.length > 1) && (
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {form.selectedTransit.length > 1 &&
                          (form.selectedTransit as MixedLeg["mode"][]).map((m) => {
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
                  )}
                  {ROAD_KINDS.has(leg.mode) ? (
                    /* Car/moto/taxi — from/to points, with up to 50 city POIs,
                       live address search and free-text entry (same picker as
                       the outbound/return journey road legs). */
                    <div className="space-y-2">
                      <HubCombobox
                        mode={leg.mode as TransportMode}
                        countries={tripCountries}
                        value={leg.from_stop}
                        onChange={(v) => updateMixedLeg(i, { from_stop: v })}
                        placeholder={t("from_point")}
                        cityHint={roadCityHint}
                        usedPlaces={usedPlaces}
                      />
                      <HubCombobox
                        mode={leg.mode as TransportMode}
                        countries={tripCountries}
                        value={leg.to_stop}
                        onChange={(v) => updateMixedLeg(i, { to_stop: v })}
                        placeholder={t("to_point")}
                        cityHint={roadCityHint}
                        usedPlaces={usedPlaces}
                      />
                    </div>
                  ) : leg.mode === "ferry" ? (
                    /* Ferry — pick the departure PORT first (same hub search as
                       every other public-transport mode), then a destination
                       list built from REAL ferry routes calling at that exact
                       port (see fetchFerryDestinations), not a generic stop
                       search — a port itself isn't a "line" the way a bus/
                       metro/tram stop is, so it doesn't fit the vehicle+stop
                       pattern used below for those modes. Changing the
                       departure port clears the destination, since the list of
                       realistic destinations depends entirely on it. */
                    <div className="space-y-2">
                      <HubCombobox
                        mode="ferry"
                        countries={tripCountries}
                        cities={tripCities}
                        value={leg.from_stop}
                        onChange={(v) => updateMixedLeg(i, { from_stop: v, to_stop: "" })}
                        placeholder={t("from_port")}
                        usedPlaces={usedPlaces}
                      />
                      <FerryDestinationCombobox
                        fromPort={leg.from_stop}
                        value={leg.to_stop}
                        onChange={(v) => updateMixedLeg(i, { to_stop: v })}
                        placeholder={t("to_port")}
                        countries={tripCountries}
                        cities={tripCities}
                        usedPlaces={usedPlaces}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Train only: national (big intercity/national network,
                          country + station) vs local (this city's own
                          metropolitan/suburban rail network, e.g. Barcelona's
                          Rodalies — same city+line picker as bus/metro/tram).
                          Switching clears vehicle/stop fields since the two
                          scopes store fundamentally different things there
                          (a free country-wide station name vs. a line ref +
                          a stop scoped to that specific line). */}
                      {leg.mode === "train" && (
                        <div className="flex gap-1.5">
                          {(["national", "local"] as const).map((scope) => {
                            const isActive = (leg.trainScope ?? "national") === scope;
                            return (
                              <button
                                key={scope}
                                type="button"
                                onClick={() => {
                                  if ((leg.trainScope ?? "national") === scope) return;
                                  updateMixedLeg(i, { trainScope: scope, vehicle: "", from_stop: "", to_stop: "", city: "" });
                                }}
                                className={cn(
                                  "flex-1 rounded-xl border p-2 text-xs font-medium transition",
                                  // Same active/inactive styling as the kind picker above this
                                  // dialog (border-primary/bg-primary), so the toggle reads as
                                  // part of the same form instead of an unrelated grey control.
                                  isActive
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card hover:bg-muted",
                                )}
                              >
                                {scope === "national" ? t("train_scope_national") : t("train_scope_local")}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {/* Local train only: pick which of the trip's own cities this
                          leg's metropolitan/suburban network search is scoped to —
                          BEFORE the line picker below, which stays disabled until a
                          city is chosen. Restricted to the trip's configured cities
                          (not a free-text/global search), since a local rail network
                          only makes sense for a city already on the itinerary. */}
                      {leg.mode === "train" && leg.trainScope === "local" && (
                        <LegCityCombobox
                          cities={tripCities}
                          value={leg.city ?? ""}
                          onChange={(city) => updateMixedLeg(i, { city, vehicle: "", from_stop: "", to_stop: "" })}
                        />
                      )}
                      {/* Line / vehicle picker — city comes from the trip's generic
                          `location` field for bus/metro/tram (unaffected), or from the
                          local-train city picker just above for a local train leg. */}
                      {usesLocalLinePicker(leg) && legCity(leg, form.location) ? (
                        <LineCombobox
                          mode={leg.mode}
                          city={legCity(leg, form.location)}
                          value={leg.vehicle}
                          onChange={(ref) => updateMixedLeg(i, { vehicle: ref })}
                          onPick={(line) => updateMixedLeg(i, { vehicle: line.ref, intercity: line.intercity, express: line.express })}
                        />
                      ) : leg.mode === "train" && leg.trainScope === "local" ? (
                        // Local train, no city picked yet — same disabled/placeholder
                        // look as LineCombobox itself uses while waiting for a city.
                        <Input value="" disabled placeholder={t("select_line")} />
                      ) : (
                        <Input
                          value={leg.vehicle}
                          onChange={(e) => updateMixedLeg(i, { vehicle: e.target.value })}
                          placeholder={t("vehicle_name").split("(")[0].trim()}
                        />
                      )}
                      {/* Stops — national train picks its country first (a
                          national network, not one city's points), then
                          stations scoped to exactly that country (same picker
                          as the outbound/return journey's train field).
                          Bus/metro/tram and LOCAL train keep the
                          city+line-scoped stop search. */}
                      {leg.mode === "train" && (leg.trainScope ?? "national") === "national" ? (
                        <div className="space-y-2">
                          <HubCombobox
                            mode="train"
                            countries={tripCountries}
                            value={leg.from_stop}
                            onChange={(v) => updateMixedLeg(i, { from_stop: v })}
                            placeholder={t("boarding_stop")}
                            usedPlaces={usedPlaces}
                          />
                          <HubCombobox
                            mode="train"
                            countries={tripCountries}
                            value={leg.to_stop}
                            onChange={(v) => updateMixedLeg(i, { to_stop: v })}
                            placeholder={t("alighting_stop")}
                            usedPlaces={usedPlaces}
                          />
                        </div>
                      ) : (
                        <MixedLegStops
                          mode={leg.mode}
                          city={legCity(leg, form.location)}
                          vehicle={leg.vehicle}
                          countries={tripCountries}
                          fromStop={leg.from_stop}
                          toStop={leg.to_stop}
                          onFrom={(v) => updateMixedLeg(i, { from_stop: v })}
                          onTo={(v) => updateMixedLeg(i, { to_stop: v })}
                          usedPlaces={usedPlaces}
                        />
                      )}
                    </>
                  )}
                  {/* Times — 2 columns are fine since time inputs are compact */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">{t("depart_time")}</p>
                      <TimeField
                        value={leg.depart_at}
                        onChange={(time) => updateMixedLeg(i, { depart_at: time })}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] text-muted-foreground">{t("arrive_time")}</p>
                      <TimeField
                        value={leg.arrive_at}
                        onChange={(time) => updateMixedLeg(i, { arrive_at: time })}
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
                  <DateField
                    className="w-full"
                    value={form.start_at ? form.start_at.slice(0, 10) : ""}
                    onChange={(date) => {
                      const time = form.start_at ? form.start_at.slice(11, 16) : "";
                      setForm({ ...form, start_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("start_time")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <TimeField
                    className="w-full"
                    value={form.start_at && form.start_at.slice(11, 16) !== "00:00" ? form.start_at.slice(11, 16) : ""}
                    onChange={(time) => {
                      const date = form.start_at ? form.start_at.slice(0, 10) : "";
                      setForm({ ...form, start_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("ends_at")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <DateField
                    className="w-full"
                    value={form.end_at ? form.end_at.slice(0, 10) : ""}
                    onChange={(date) => {
                      const time = form.end_at ? form.end_at.slice(11, 16) : "";
                      setForm({ ...form, end_at: date ? `${date}T${time || "00:00"}` : "" });
                    }}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label className="text-muted-foreground">{t("end_time")} <span className="text-xs opacity-70">{t("optional")}</span></Label>
                  <TimeField
                    className="w-full"
                    value={form.end_at && form.end_at.slice(11, 16) !== "00:00" ? form.end_at.slice(11, 16) : ""}
                    onChange={(time) => {
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

// City picker for a local-train leg — restricted to the trip's OWN configured
// cities (not a free-text/global search, since a local rail network only
// makes sense for a city already on the itinerary). Built as the same
// Popover+Command combobox (with flags) used everywhere else in this dialog
// — e.g. the activity's own "location" field just above — instead of a plain
// native <select>, which (a) looks inconsistent (no flags, different visual
// style) and (b) opens as the OS's own full-screen picker on mobile, which
// doesn't match the in-page dropdown pattern the rest of the form uses.
// Same custom absolute-positioned dropdown pattern as StopCombobox/"Luogo" —
// NOT Radix Popover, which anchored its width to `--radix-popover-trigger-
// width` and could render an unstable/collapsed width the same way the
// place picker did before that was fixed; this trigger is a plain button +
// text-filterable list, so its popup always spans the trigger's own width.
function LegCityCombobox({
  cities, value, onChange,
}: {
  cities: Array<{ name: string; country: string }>;
  value: string;
  onChange: (city: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = cities.find((c) => c.name === value);
  const nq = norm(query);
  const filtered = useMemo(
    () => (nq ? cities.filter((c) => norm(c.name).includes(nq)) : cities),
    [cities, nq],
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setQuery(""); setOpen((v) => !v); }}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm font-normal ring-offset-background hover:bg-accent/40"
      >
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {selected && <span className="shrink-0">{flagOf(selected.country)}</span>}
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : t("select_city_placeholder")}
          </span>
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          <Input
            autoFocus
            value={query}
            placeholder={t("search_type")}
            onChange={(e) => setQuery(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="mb-1"
          />
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">{t("no_cities")}</div>
          )}
          {filtered.map((c) => (
            <button
              type="button"
              key={`${c.country}|${c.name}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(c.name); setOpen(false); }}
              className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Check className={cn("h-4 w-4 shrink-0", value === c.name ? "opacity-100" : "opacity-0")} />
              <span className="shrink-0">{flagOf(c.country)}</span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Autocomplete for transit stops filtered by city + mode
// Boarding/alighting stops for one multi-modal leg. Fetches the selected
// line's stops so the suggestions are limited to that line (not other lines).
function MixedLegStops({
  mode, city, vehicle, countries, fromStop, toStop, onFrom, onTo, usedPlaces,
}: {
  mode: MixedLeg["mode"];
  city: string;
  vehicle: string;
  countries: string[];
  fromStop: string;
  toStop: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  usedPlaces?: string[];
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
        usedPlaces={usedPlaces}
      />
      <StopCombobox
        mode={mode}
        city={city}
        countries={countries}
        value={toStop}
        onChange={onTo}
        placeholder={t("alighting_stop")}
        extraOptions={lineStops}
        usedPlaces={usedPlaces}
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
  mode, city, countries, value, onChange, placeholder, extraOptions, usedPlaces,
}: {
  mode: MixedLeg["mode"];
  city: string;
  countries: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Line-specific stops (from Overpass) shown first among suggestions. */
  extraOptions?: string[];
  // Every place name already used elsewhere in the trip — same "already
  // used" badge/priority the HubCombobox pickers show (train/bus/ferry/
  // metro/tram's own from/to fields), so a repeat stop is easy to spot here
  // too.
  usedPlaces?: string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  useTranslationTick();
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

  // Every stop OSM knows about in this city for the given mode — a much wider
  // net than the hand-picked `hubsForMode` list (sometimes only 3-4 entries
  // per city), fetched once per city/mode and filtered client-side below as
  // the user types, same as `cityHubs`.
  const [cityStops, setCityStops] = useState<string[]>([]);
  useEffect(() => {
    const cityTrim = city.trim();
    if (!cityTrim) { setCityStops([]); return; }
    let alive = true;
    fetchCityStops(cityTrim, mode).then((res) => { if (alive) setCityStops(res); });
    return () => { alive = false; };
  }, [city, mode]);

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

  const cityStopsFiltered = useMemo(
    () =>
      nq && nq !== nCity
        ? cityStops.filter((s) => norm(s).includes(nq))
        : cityStops.slice(0, 40),
    [cityStops, nq, nCity],
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

  // When a line is selected, that line's own stops are shown FIRST as the
  // recommended set (they're exactly where the picked line actually stops),
  // but city hubs + the broader OSM stop search + remote (Nominatim) hits
  // are still appended afterward, deduped — a recommended set must never be
  // the ONLY thing shown, since the line's own stop list can be incomplete
  // (a stop mapped without the exact name typed, or a station shared with
  // another line) and the user still needs a way to find it.
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ name: string; city?: string }> = [];
    if (hasLineStops) {
      for (const name of extraFiltered) {
        const k = norm(name);
        if (seen.has(k)) continue;
        seen.add(k); out.push({ name });
      }
    }
    for (const h of [...localFiltered, ...remoteFiltered]) {
      const k = norm(h.name);
      if (seen.has(k)) continue;
      seen.add(k); out.push({ name: h.name, city: h.city });
    }
    for (const name of cityStopsFiltered) {
      const k = norm(name);
      if (seen.has(k)) continue;
      seen.add(k); out.push({ name });
    }
    // Already-used stops float to the top of whichever section they're in,
    // same treatment as every HubCombobox picker.
    return out
      .slice(0, 120)
      .sort((a, b) => Number(isUsedPlace(b.name, usedPlaces)) - Number(isUsedPlace(a.name, usedPlaces)))
      .slice(0, 60);
  }, [hasLineStops, extraFiltered, localFiltered, remoteFiltered, cityStopsFiltered, usedPlaces]);

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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map((h, idx) => {
            const used = isUsedPlace(h.name, usedPlaces);
            return (
              <button
                type="button"
                key={`${h.name}-${idx}`}
                onMouseDown={(e) => { e.preventDefault(); onChange(h.name); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                  used && "bg-sky-500/5",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{withRomanization(h.name, lang)}</span>
                </span>
                {used && <UsedPlaceBadge lang={lang} />}
              </button>
            );
          })}
          {!hasLineStops && remote.isFetching && suggestions.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("global_search")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Ferry destination picker: given the departure port already chosen in the
// sibling field, lists the REAL destinations served by an actual ferry route
// from that port (see fetchFerryDestinations) — a live Overpass lookup, not a
// hand-picked list, so it stays realistic for whatever port the user typed.
// Free text is still allowed (the input is a plain controlled value) for a
// route OSM doesn't have mapped.
function FerryDestinationCombobox({
  fromPort, value, onChange, placeholder, countries, cities, usedPlaces,
}: {
  fromPort: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // Every country the trip touches — used ONLY for the "other options"
  // fallback below (the curated port list), never to scope the Overpass
  // destinations lookup itself: a real ferry destination from the picked
  // port can legitimately be in a country the trip never declared (an
  // island reached from a mainland port, say).
  countries?: string[];
  // The trip's own cities — used to scope the REGIONAL port search (see
  // fetchPortsNearCity) around each one, same reasoning as HubCombobox's own
  // ferry branch: a whole-country area search is unreliable/too slow, while
  // per-city coverage directly matches the places the trip is about.
  cities?: Array<{ name: string; country: string }>;
  usedPlaces?: string[];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  useTranslationTick();
  const [open, setOpen] = useState(false);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const port = fromPort.trim();
    if (!port) { setDestinations([]); return; }
    let alive = true;
    setLoading(true);
    fetchFerryDestinations(port)
      .then((res) => { if (alive) setDestinations(res); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fromPort]);

  // "Other options" — the same broader port net the departure-port field
  // itself offers (curated ferry hubs + the regional Overpass port search),
  // plus a live free-text search. The Overpass destinations above are the
  // RECOMMENDED set (real routes confirmed to call at this exact port), but
  // that list can be incomplete (a route mapped without stop members, or one
  // OSM simply hasn't tagged yet) — recommended must never be the ONLY thing
  // shown, so every other known port is still reachable here too.
  const tripCountries = countries ?? [];
  const portCities = (cities ?? []).map((c) => c.name);
  const [regionalPorts, setRegionalPorts] = useState<Array<{ name: string; city?: string }>>([]);
  useEffect(() => {
    if (portCities.length === 0) { setRegionalPorts([]); return; }
    let alive = true;
    Promise.all(portCities.map((c) => fetchPortsNearCity(c)))
      .then((lists) => { if (alive) setRegionalPorts(lists.flat()); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portCities.join(",")]);
  const curatedPorts = useMemo(() => hubsForMode("ferry", tripCountries, true), [tripCountries]);
  const remote = useRemoteHubs("ferry", value);

  const nq = norm(value);
  const recommendedFiltered = useMemo(
    () => (nq ? destinations.filter((d) => norm(d).includes(nq)) : destinations),
    [destinations, nq],
  );
  const otherOptions = useMemo(() => {
    const seen = new Set(recommendedFiltered.map(norm));
    const out: string[] = [];
    for (const h of curatedPorts) {
      const label = formatHub(h);
      const k = norm(label);
      if (seen.has(k)) continue;
      if (nq && !norm(label).includes(nq)) continue;
      seen.add(k); out.push(label);
    }
    for (const p of regionalPorts) {
      const k = norm(p.name);
      if (seen.has(k)) continue;
      if (nq && !norm(p.name).includes(nq)) continue;
      seen.add(k); out.push(p.name);
    }
    for (const r of remote.data ?? []) {
      const k = norm(r.name);
      if (seen.has(k)) continue;
      seen.add(k); out.push(r.name);
    }
    return out;
  }, [recommendedFiltered, curatedPorts, regionalPorts, remote.data, nq]);

  const hasRecommended = recommendedFiltered.length > 0;

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        disabled={!fromPort.trim()}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && fromPort.trim() && (hasRecommended || otherOptions.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {hasRecommended && (
            <div className="py-0.5">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {wpL(lang).recommended}
              </p>
              {recommendedFiltered.slice(0, 40).map((d, idx) => {
                const used = isUsedPlace(d, usedPlaces);
                return (
                  <button
                    type="button"
                    key={`rec-${d}-${idx}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(d); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      used && "bg-sky-500/5",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{withRomanization(d, lang)}</span>
                    </span>
                    {used && <UsedPlaceBadge lang={lang} />}
                  </button>
                );
              })}
            </div>
          )}
          {otherOptions.length > 0 && (
            <div className={cn("py-0.5", hasRecommended && "border-t border-border/60")}>
              {hasRecommended && (
                <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("all_options")}
                </p>
              )}
              {otherOptions.slice(0, 40).map((d, idx) => {
                const used = isUsedPlace(d, usedPlaces);
                return (
                  <button
                    type="button"
                    key={`other-${d}-${idx}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(d); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      used && "bg-sky-500/5",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{withRomanization(d, lang)}</span>
                    </span>
                    {used && <UsedPlaceBadge lang={lang} />}
                  </button>
                );
              })}
            </div>
          )}
          {loading && !hasRecommended && otherOptions.length === 0 && (
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
  mode, city, value, onChange, onPick,
}: {
  mode: string;
  city: string;
  value: string;
  onChange: (ref: string) => void;
  // Fired (in addition to onChange) when a suggestion is actually picked, with
  // the full line info — lets the caller also record whether it's an
  // intercity/express bus (see fetchTransitLines) for the map's colour.
  onPick?: (line: { ref: string; name: string; intercity?: boolean; express?: boolean; color?: string }) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  useTranslationTick();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Array<{ ref: string; name: string; intercity?: boolean; express?: boolean; color?: string }>>([]);
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
    ),
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
        // overflow-y-auto ONLY (never overflow-x) + min-w-0 on every flex
        // child down the tree is what actually stops the list from becoming
        // horizontally scrollable — a `line.ref` badge with a fixed real OSM
        // colour is `shrink-0` by design (its width must stay true to its
        // text), so the truncating `desc` span next to it is what has to give
        // way first; without `min-w-0` a flex child's *content* width still
        // pushes the row (and the whole list) wider than the popover itself.
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] w-full min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {suggestions.map(line => {
            const desc = stripLineRef(line.name, line.ref);
            return (
              <button
                type="button"
                key={line.ref}
                onMouseDown={(e) => { e.preventDefault(); onChange(line.ref); onPick?.(line); setOpen(false); }}
                className="flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {line.color ? (
                  // Real OSM line colour: shown as a small filled badge (like
                  // the Extraurbano badge, but more vivid) with the ref/name
                  // in a contrasting text colour rather than the plain
                  // text-only ref used when no real colour is known.
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold leading-tight"
                    style={{ background: line.color, color: contrastTextColor(line.color) }}
                  >
                    {line.ref}
                  </span>
                ) : (
                  // No real OSM colour: still shown as a pill (not bare text)
                  // so every line reads consistently in the list — just a
                  // neutral/muted fill instead of a real, vivid line colour.
                  <span className="shrink-0 rounded-md bg-foreground/10 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-foreground/70">
                    {line.ref}
                  </span>
                )}
                {desc && (
                  <span className="min-w-0 flex-1 truncate text-xs opacity-55">{withRomanization(desc, lang)}</span>
                )}
                {/* Express/intercity/urban badges are mutually exclusive with
                    each other along the urban/extraurban axis (a line is
                    either one or the other), but express is independent and
                    can combine with either. rounded-md (not rounded-full) to
                    match the line-ref pill's own corner radius. */}
                {line.express && (
                  <span className="shrink-0 rounded-md bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
                    {wpL(lang).express}
                  </span>
                )}
                {line.intercity ? (
                  <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                    {wpL(lang).intercity}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-md bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                    {wpL(lang).urban}
                  </span>
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

// ── Road-leg waypoint search (corridor between start and end) ─────────────────
const _placeGeoCache = new Map<string, { lat: number; lng: number } | null>();
async function geocodePlaceName(q: string): Promise<{ lat: number; lng: number } | null> {
  const key = q.trim().toLowerCase();
  if (!key) return null;
  if (_placeGeoCache.has(key)) return _placeGeoCache.get(key)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`,
      { headers: { Accept: "application/json" } },
    );
    const hits = (await r.json()) as Array<{ lat: string; lon: string }>;
    const v = hits?.[0] ? { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon) } : null;
    _placeGeoCache.set(key, v);
    return v;
  } catch {
    _placeGeoCache.set(key, null);
    return null;
  }
}

// Determine which country an existing free-text station name actually
// belongs to — used to correctly re-seed the train leg editor's country step
// (see HubCombobox's isTrainMode branch) for a station that ISN'T in the
// curated static hub list for any trip country (e.g. a side leg like
// Belfast–Dublin on a trip whose declared countries are elsewhere). An
// unscoped Nominatim lookup (no countrycodes filter) finds the real place
// anywhere in the world and reads its country straight off the result.
const _stationCountryCache = new Map<string, string | null>();
async function geocodeStationCountry(q: string): Promise<string | null> {
  const key = q.trim().toLowerCase();
  if (!key) return null;
  if (_stationCountryCache.has(key)) return _stationCountryCache.get(key)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
      { headers: { Accept: "application/json" } },
    );
    const hits = (await r.json()) as Array<{ address?: { country_code?: string } }>;
    const iso = hits?.[0]?.address?.country_code ? hits[0].address.country_code.toUpperCase() : null;
    _stationCountryCache.set(key, iso);
    return iso;
  } catch {
    _stationCountryCache.set(key, null);
    return null;
  }
}

// Determine which city an existing free-text point (a POI, street address, or
// city-centre pick) actually belongs to — used to correctly re-seed the
// car/moto/taxi leg editor's city step (see HubCombobox's isCityMode branch)
// when editing an existing leg. Saved point values are always the bare
// place/POI name (never prefixed with the city), so an unscoped Nominatim
// lookup is the only reliable way to recover "which city" for an address or
// POI value; a city-centre value already matches `cityList` directly and
// doesn't need this.
const _placeCityCache = new Map<string, string | null>();
async function geocodePlaceCity(q: string): Promise<string | null> {
  const key = q.trim().toLowerCase();
  if (!key) return null;
  if (_placeCityCache.has(key)) return _placeCityCache.get(key)!;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
      { headers: { Accept: "application/json" } },
    );
    const hits = (await r.json()) as Array<{
      address?: { city?: string; town?: string; village?: string; municipality?: string };
    }>;
    const addr = hits?.[0]?.address;
    const city = addr?.city || addr?.town || addr?.village || addr?.municipality || null;
    _placeCityCache.set(key, city);
    return city;
  } catch {
    _placeCityCache.set(key, null);
    return null;
  }
}

type CorridorBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };
// `category` groups a POI result in the road-mode picker's dropdown
// (touristic sights vs. transport hubs vs. everything else); left undefined
// for non-POI suggestions (cities, live/free-text search results).
type PoiCategory = "touristic" | "transport" | "other";
type WpSuggestion = { name: string; label: string; country: string; lat: number; lng: number; category?: PoiCategory };

// Suggest cities matching `q` as the user types, biased to the corridor between
// the leg's start and end. Uses Photon (a type-ahead geocoder) which does proper
// prefix matching and returns names in the user's language — unlike Nominatim's
// /search, which only matched full names.
async function searchCorridorCities(q: string, box: CorridorBox | null, lang: string): Promise<WpSuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  try {
    const params = new URLSearchParams({ q: query, limit: "10", lang: (lang || "en").slice(0, 2) });
    if (box) {
      // Restrict to the corridor box + bias toward its centre.
      params.set("bbox", `${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`);
      params.set("lat", String((box.minLat + box.maxLat) / 2));
      params.set("lon", String((box.minLng + box.maxLng) / 2));
    }
    const r = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { headers: { Accept: "application/json" } });
    const data = (await r.json()) as {
      features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } }>;
    };
    const out: WpSuggestion[] = [];
    const seen = new Set<string>();
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      if (p.osm_key !== "place") continue;
      if (!["city", "town", "village", "municipality", "hamlet"].includes(p.osm_value ?? "")) continue;
      const nm = p.name;
      const coords = f.geometry?.coordinates;
      if (!nm || !coords) continue;
      const country = (p.countrycode || "").toUpperCase();
      const region = p.state || p.county || p.country || "";
      const key = `${nm}|${country}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: nm, label: region ? `${nm}, ${region}` : nm, country, lat: coords[1], lng: coords[0] });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Road-leg point-of-interest search (car/moto/taxi from/to fields) ─────────
// Named landmarks inside a city, so a road leg's start/end can be a specific
// place ("Colosseo") rather than only the whole city. Grouped into three
// categories so the dropdown can show them under sub-headers instead of one
// long undifferentiated list — capped at 50 total so it stays scannable.
const _poiCache = new Map<string, WpSuggestion[]>();
const POI_CATEGORIES: Array<{ key: PoiCategory; tags: Array<[string, string[]]> }> = [
  {
    key: "touristic",
    tags: [
      ["tourism", ["attraction", "museum", "gallery", "zoo", "aquarium", "theme_park", "viewpoint", "monument", "artwork"]],
      ["historic", ["monument", "castle", "memorial", "ruins", "archaeological_site", "fort", "church"]],
    ],
  },
  {
    key: "transport",
    tags: [
      ["railway", ["station", "halt"]],
      ["aeroway", ["aerodrome", "terminal"]],
      ["amenity", ["bus_station"]],
      ["public_transport", ["station"]],
    ],
  },
  {
    key: "other",
    tags: [
      ["leisure", ["park", "garden", "stadium", "water_park"]],
      ["amenity", ["theatre", "cinema", "arts_centre", "marketplace", "place_of_worship", "university"]],
      ["shop", ["mall"]],
    ],
  },
];
// `tag=value` → category, so a returned element's tags can be mapped back to
// the group it was fetched for without re-deriving the query logic.
const POI_TAG_CATEGORY = new Map<string, PoiCategory>();
POI_CATEGORIES.forEach((cat) => cat.tags.forEach(([k, vals]) => vals.forEach((v) => POI_TAG_CATEGORY.set(`${k}=${v}`, cat.key))));
function categorizePoi(tags: Record<string, string>): PoiCategory {
  for (const [k, v] of Object.entries(tags)) {
    const cat = POI_TAG_CATEGORY.get(`${k}=${v}`);
    if (cat) return cat;
  }
  return "other";
}
const POI_CAP = 50;

async function fetchCityPOIs(city: string, country: string): Promise<WpSuggestion[]> {
  const key = `${city}|${country}`;
  if (_poiCache.has(key)) return _poiCache.get(key)!;
  try {
    const areaQ = await getAreaQuery(city);
    const clauses = POI_CATEGORIES.flatMap((cat) => cat.tags)
      .flatMap(([k, vals]) => vals.map((v) => `node["${k}"="${v}"]["name"](area.c);way["${k}"="${v}"]["name"](area.c);`))
      .join("");
    const q = `[out:json][timeout:30];${areaQ};(${clauses});out center ${POI_CAP + 30};`;
    const data = (await overpassFetch(q, 20000)) as unknown as {
      elements: Array<{ tags?: Record<string, string>; lat?: number; lon?: number; center?: { lat: number; lon: number } }>;
    };
    const seen = new Set<string>();
    const out: WpSuggestion[] = [];
    for (const el of data.elements ?? []) {
      const name = el.tags?.name;
      if (!name || seen.has(name)) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (typeof lat !== "number" || typeof lon !== "number") continue;
      seen.add(name);
      out.push({ name, label: name, country, lat, lng: lon, category: categorizePoi(el.tags ?? {}) });
      if (out.length >= POI_CAP) break;
    }
    _poiCache.set(key, out);
    return out;
  } catch {
    // Deliberately NOT cached: a transient failure (Overpass timeout/rate
    // limit) must not permanently poison this city with an empty POI list
    // for the rest of the session — the next time the field is focused it
    // should retry rather than silently stay empty forever.
    return [];
  }
}

// Broad, mode-specific stop search (bus/tram/metro) for the boarding/
// alighting fields in `StopCombobox` — used as a suggestion source when no
// specific line is picked yet (or the typed line isn't among the proposed
// ones, so its real stops can't be looked up). The curated hub list
// (`hubsForMode`) is hand-picked and sometimes has only 3-4 entries for a
// given city, which isn't enough to reliably surface a match for whatever
// the user actually types — this queries every stop OSM knows about in the
// city instead, so typing any substring of a real stop's name has a real
// chance of finding it.
const STOP_CAP = 80;
const STOP_QUERY_CLAUSES: Record<string, string> = {
  bus: `node["highway"="bus_stop"]["name"](area.c);way["highway"="bus_stop"]["name"](area.c);node["amenity"="bus_station"]["name"](area.c);`,
  tram: `node["railway"="tram_stop"]["name"](area.c);`,
  metro: `node["railway"="station"]["station"="subway"]["name"](area.c);node["station"="subway"]["name"](area.c);node["railway"="subway_entrance"]["name"](area.c);`,
};
const _cityStopsCache = new Map<string, string[]>();
async function fetchCityStops(city: string, mode: string): Promise<string[]> {
  const clauses = STOP_QUERY_CLAUSES[mode];
  if (!clauses || !city) return [];
  const key = `${city}|${mode}`;
  if (_cityStopsCache.has(key)) return _cityStopsCache.get(key)!;
  try {
    const areaQ = await getAreaQuery(city);
    const q = `[out:json][timeout:30];${areaQ};(${clauses});out tags ${STOP_CAP + 50};`;
    const data = (await overpassFetch(q, 20000)) as { elements: Array<{ tags?: Record<string, string> }> };
    const seen = new Set<string>();
    const out: string[] = [];
    for (const el of data.elements ?? []) {
      const name = el.tags?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
      if (out.length >= STOP_CAP) break;
    }
    _cityStopsCache.set(key, out);
    return out;
  } catch {
    // Not cached — a transient Overpass hiccup shouldn't permanently starve
    // this city/mode of suggestions for the rest of the session.
    return [];
  }
}

// Live type-ahead search for POIs, street addresses AND cities as the user
// types (Photon covers all three) — biased toward the hinted city when known,
// so a near-miss/typo on a landmark name ("Colosseum" → "Colosseo") still
// surfaces the real place, and a free-form address resolves to a precise point.
async function searchRoadPoints(
  q: string,
  cityHint: { name: string; country: string } | null,
  lang: string,
): Promise<WpSuggestion[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  try {
    const params = new URLSearchParams({ q: query, limit: "12", lang: (lang || "en").slice(0, 2) });
    if (cityHint) {
      const c = await geocodePlaceName(cityHint.name);
      if (c) { params.set("lat", String(c.lat)); params.set("lon", String(c.lng)); }
    }
    const r = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, { headers: { Accept: "application/json" } });
    const data = (await r.json()) as {
      features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: [number, number] } }>;
    };
    // Photon does a loose substring match, so searching "airport" returns an
    // "XYZ Airport Hotel" or "Airport Shuttle" just as readily as the airport
    // itself. Score and re-rank: an exact/prefix name match, or a result
    // whose OSM category is a "primary" place the query is plausibly naming
    // directly (an airport, a station, a landmark…), outranks a business
    // whose name merely happens to contain the query word.
    const PRIMARY_OSM_KEYS = new Set(["aeroway", "railway", "tourism", "historic", "leisure", "natural", "waterway", "public_transport"]);
    const query_lower = query.toLowerCase();
    const seen = new Set<string>();
    const scored: Array<{ item: WpSuggestion; score: number }> = [];
    for (const f of data.features ?? []) {
      const p = f.properties ?? {};
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const nm = p.name || [p.street, p.housenumber].filter(Boolean).join(" ");
      if (!nm) continue;
      const country = (p.countrycode || "").toUpperCase();
      const context = [p.street !== nm ? p.street : null, p.city, p.state].filter(Boolean);
      const label = context.length ? `${nm}, ${context.join(", ")}` : nm;
      const key = `${nm}|${coords[1].toFixed(4)}|${coords[0].toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const n = nm.toLowerCase();
      let score = 0;
      if (n === query_lower) score += 100;
      else if (n.startsWith(query_lower)) score += 40;
      if (p.osm_key && PRIMARY_OSM_KEYS.has(p.osm_key)) score += 25;
      scored.push({ item: { name: nm, label, country, lat: coords[1], lng: coords[0] }, score });
    }
    // Stable sort — ties keep Photon's own relevance order.
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  } catch {
    return [];
  }
}

function WaypointCombobox({
  value, box, lang, placeholder, onPick, onType,
}: {
  value: string;
  box: CorridorBox | null;
  lang: string;
  placeholder?: string;
  onPick: (s: WpSuggestion) => void;
  onType: (name: string) => void;
}) {
  useTranslationTick();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WpSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) { setItems([]); return; }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await searchCorridorCities(q, box, lang);
      if (alive) { setItems(res); setLoading(false); }
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [value, box, lang]);

  return (
    <div className="relative flex-1">
      <Input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onType(e.target.value); setOpen(true); }}
      />
      {open && (items.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
          {loading && items.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">…</div>
          )}
          {items.map((s, i) => (
            <button
              type="button"
              key={`${s.name}-${s.country}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); onPick(s); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span>{flagOf(s.country)}</span>
              <span className="min-w-0 flex-1 truncate">{withRomanization(s.label, lang)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function HubCombobox({
  mode, countries, value, onChange, placeholder, suggested, cityHint, usedPlaces, journeyMode, cities,
}: {
  mode: TransportMode;
  countries: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // Ferry only: the trip's own cities — used to scope the regional port
  // search around each one (see fetchPortsNearCity) rather than the whole
  // country, which is both far more reliable (a country-wide Overpass area
  // query can time out and silently return nothing) and directly covers the
  // actual places the trip is about, e.g. a same-country island pair like
  // Ibiza/Formentera that a country-wide search still failed to surface.
  cities?: Array<{ name: string; country: string }>;
  // Endpoint of an adjacent leg (e.g. the train station or airport used just
  // before/after this car/moto/taxi leg), offered as the recommended first
  // option — so a multi-modal journey's road leg can pick up exactly where the
  // previous leg left off (or hand off exactly where the next leg starts).
  suggested?: string;
  // City to anchor the point-of-interest / address search at, for road-mode
  // legs — resolved by the caller (sibling field's city, else the adjacent
  // leg's handoff point, else the trip's first city).
  cityHint?: { name: string; country: string } | null;
  // Every place name already used elsewhere in the trip (lower-cased) — POI/
  // station suggestions matching one are flagged with a small "already used"
  // badge so re-picking the same spot is easy to spot in a long list.
  usedPlaces?: string[];
  // True ONLY for the outbound/return journey's own from/to fields (the top-
  // level "how do I get to this trip" legs) — NOT for a car/moto leg used as
  // a short in-city transfer inside `mixed_legs`. A car/moto journey leg is a
  // road trip between cities, so its natural reference points are highway
  // toll booths rather than a whole city (see isTollMode below); a mixed-leg
  // car/moto transfer stays city+address-based since it's a short local hop.
  journeyMode?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  // Re-renders once a background translation of a non-Latin suggestion
  // (Korean/Japanese/Chinese/etc. POI or stop name) resolves — otherwise the
  // suggestion list below would keep showing the untranslated original
  // forever, since nothing else here triggers a re-render when the async
  // translation cache fills in.
  useTranslationTick();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const isPlane = mode === "plane";
  // Train is handled by its own branch below (isTrainMode) — a national
  // network, so its station picker is scoped to one explicitly-chosen
  // country rather than the whole trip. bus/ferry/metro/tram keep the
  // original "search across all trip countries" behaviour.
  const isHub = mode === "bus" || mode === "ferry" || mode === "metro" || mode === "tram";
  const isTrainMode = mode === "train";
  // Car/moto on the outbound/return journey itself → toll booths, not cities.
  const isTollMode = !!journeyMode && (mode === "car" || mode === "moto");
  const isCityMode = !isTollMode && (mode === "car" || mode === "moto" || mode === "taxi");
  const airportsData = useAirports(true);
  const remote = useRemoteHubs(isHub ? modeToKind(mode) : null, isHub ? value : "");
  // Toll booths aren't scoped to one city — search across every country the
  // trip touches at once (Nominatim's countrycodes accepts a comma list).
  const tollRemote = useRemoteHubs(
    isTollMode ? "toll" : null,
    isTollMode ? value : "",
    isTollMode ? countries.join(",") : undefined,
  );

  // Ferry only: the curated per-country port list only has a handful of
  // "main" ports, missing most of the smaller ports that actually connect to
  // a given island — fetch the Overpass-derived port list around EACH of the
  // trip's own cities (see fetchPortsNearCity), so it's there even before the
  // user types anything. Scoped per-city rather than per-country: a whole-
  // country Overpass area query can be too large and time out silently.
  const [regionalPorts, setRegionalPorts] = useState<Array<{ name: string; city?: string }>>([]);
  const portCities = (cities ?? []).map((c) => c.name);
  useEffect(() => {
    if (mode !== "ferry" || portCities.length === 0) { setRegionalPorts([]); return; }
    let alive = true;
    Promise.all(portCities.map((c) => fetchPortsNearCity(c)))
      .then((lists) => { if (alive) setRegionalPorts(lists.flat()); })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, portCities.join(",")]);

  // ── Train-mode: pick the country first, then see (and search) exactly that
  // country's stations — trains connect cities on a national network, not a
  // single city's points, so scoping by country gives a far more precise
  // list than searching across every country the trip touches at once.
  const [trainCountry, setTrainCountry] = useState("");
  const [trainCountryOpen, setTrainCountryOpen] = useState(false);
  // Seed the country step once, on first mount — but from the ALREADY-SAVED
  // station's real country when editing an existing leg, not always the
  // trip's first/departure country. Without this, reopening a train leg to
  // tweak the station kept snapping the country picker back to the departure
  // country regardless of which country the saved station actually belongs
  // to, forcing the user to re-pick it every time. After this initial seed,
  // the country only ever changes via the user's own explicit pick below.
  useEffect(() => {
    if (!isTrainMode || trainCountry) return;
    const raw = value.trim();
    const q = raw.toLowerCase();
    if (q) {
      // Search EVERY known country, not just the trip's own — a saved
      // station can legitimately sit in a country the trip itself was never
      // tagged with (e.g. a Belfast–Dublin side leg on a trip whose declared
      // countries are just Italy). Restricting this lookup to `countries`
      // meant it could never find such a station and always fell back to
      // the trip's first/departure country instead.
      const hit = Object.keys(HUBS).find((iso) => hubsForMode("train", [iso], true).some((h) => formatHub(h).toLowerCase() === q));
      if (hit) { setTrainCountry(hit); return; }
      // Not in the curated static list for ANY country (e.g. a smaller
      // station only ever found via the live/global search when it was first
      // added) — fall back to an unscoped geocode lookup of the saved text
      // itself, which finds the real place anywhere and reports its country.
      let alive = true;
      geocodeStationCountry(raw).then((iso) => {
        if (alive) setTrainCountry(iso || countries[0] || "");
      });
      return () => { alive = false; };
    }
    if (countries[0]) setTrainCountry(countries[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTrainMode, value, countries[0]]);
  const trainRemote = useRemoteHubs(
    isTrainMode ? "train" : null,
    isTrainMode ? value : "",
    isTrainMode ? trainCountry : undefined,
  );

  // ── Road-mode: an explicit "which city" step, then POIs/addresses scoped to
  // EXACTLY that city — departure and arrival are edited independently, since
  // a car/moto/taxi leg may well start and end in two different cities.
  const cityList = countries.flatMap((iso) =>
    citiesOfCountry(iso).map((c) => ({ name: c.name, country: c.country })),
  );
  const [cityQuery, setCityQuery] = useState("");
  const [cityOpen, setCityOpen] = useState(false);
  // Seed the city step. When editing an existing leg, `value` already holds
  // the saved point — recover ITS city first (exact match against the known
  // city list, then a reverse-geocode for POI/address values) so the step
  // never resets to empty or to the wrong city. Only fall back to the
  // caller's hint (e.g. the adjacent leg's handoff point) for a genuinely new/
  // empty leg, or if the saved value can't be resolved at all. Never override
  // an explicit choice the user has already made in this session.
  useEffect(() => {
    // NB: only seeds the text — must NOT open the dropdown here. This effect
    // fires on mount for every road-mode field at once (the hint is usually
    // available immediately), so auto-opening here would pop every from/to
    // field's suggestion list open simultaneously as soon as the leg editor
    // renders. Opening on an explicit user action (picking a city below) is
    // fine because that only ever affects the one field being touched.
    if (!isCityMode || cityQuery) return;
    const raw = value.trim();
    if (raw) {
      const exact = cityList.find((c) => c.name.toLowerCase() === raw.toLowerCase());
      if (exact) { setCityQuery(exact.name); return; }
      let alive = true;
      geocodePlaceCity(raw).then((city) => {
        if (!alive) return;
        if (city) {
          const hit = cityList.find((c) => c.name.toLowerCase() === city.toLowerCase());
          setCityQuery(hit ? hit.name : city);
        } else if (cityHint) {
          setCityQuery(cityHint.name);
        }
      });
      return () => { alive = false; };
    }
    if (cityHint) setCityQuery(cityHint.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCityMode, value, cityHint?.name]);

  const cityMatch = cityList.find((c) => c.name.toLowerCase() === cityQuery.trim().toLowerCase());
  const activeCityCountry = cityMatch?.country ?? countries[0] ?? "";
  const hasActiveCity = isCityMode && cityQuery.trim().length >= 2;

  // Points of interest for the exact city just entered (up to 50), shown when
  // the point field is empty/short — and a live Photon search (POIs + street
  // addresses, typo-tolerant) once the user has typed something there.
  const [poiItems, setPoiItems] = useState<WpSuggestion[]>([]);
  useEffect(() => {
    if (!hasActiveCity) { setPoiItems([]); return; }
    let alive = true;
    fetchCityPOIs(cityQuery.trim(), activeCityCountry).then((res) => { if (alive) setPoiItems(res); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveCity, cityQuery, activeCityCountry]);

  const [liveItems, setLiveItems] = useState<WpSuggestion[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  // Network search kicks in from 3 characters — short enough to feel
  // immediate, but long enough that Photon's results are actually relevant
  // (1-2 letters mostly return noise). The LOCAL lists (POI cache, used
  // places) above are filtered instantly from the first character, so the
  // dropdown never looks empty while this is still debouncing/in flight.
  useEffect(() => {
    if (!hasActiveCity || value.trim().length < 3) { setLiveItems([]); return; }
    let alive = true;
    setLiveLoading(true);
    const timer = setTimeout(async () => {
      const res = await searchRoadPoints(value, { name: cityQuery.trim(), country: activeCityCountry }, lang);
      if (alive) { setLiveItems(res); setLiveLoading(false); }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveCity, value, cityQuery, activeCityCountry, lang]);

  if (isCityMode) {
    const cq = cityQuery.trim().toLowerCase();
    const filteredCities = (cq
      ? cityList.filter((c) => c.name.toLowerCase().includes(cq)).slice(0, 300)
      : cityList.slice(0, 300)
    );
    const showSuggested = !!suggested && !value.trim();
    const cityLabel = cityQuery.trim();
    const useCityLabel = wpL(lang).useCity.replace("{{city}}", cityLabel);
    const q = value.trim().toLowerCase();
    // Local, INSTANT filtering of the already-fetched POI list and the
    // "already used in this trip" list by whatever's typed so far — shown
    // from the very first character, unlike the network search below which
    // needs a round trip. This used to collapse to an empty list the moment
    // 2 characters were typed (kept ONLY while the field was near-empty),
    // leaving the dropdown blank until the debounced live search resolved —
    // which, for a short/partial query, often came back empty too, reading
    // as "no suggestions until the word is fully typed". Filtering the local
    // lists live instead means something relevant is on screen immediately,
    // and the network results below still arrive to extend it.
    const usedToShow = (usedPlaces ?? []).filter((p) => p.trim() && (!q || p.toLowerCase().includes(q)));
    const usedLower = new Set(usedToShow.map((p) => p.toLowerCase()));
    // Excluded from the POI groups below so an already-used POI isn't shown
    // twice (once in its dedicated section, once in its category).
    const poiToShow = poiItems
      .filter((s) => !usedLower.has(s.name.toLowerCase()) && (!q || s.name.toLowerCase().includes(q)))
      .slice(0, POI_CAP);
    const liveToShow = liveItems;
    // Group POIs by category (touristic sights, transport hubs, everything
    // else) so the dropdown reads as sections rather than one long list —
    // each capped to a tighter, more scannable size (touristic sights get
    // the most room since they're usually what matters most, "other" the
    // least). Empty groups are dropped entirely.
    const POI_GROUP_CAP: Record<PoiCategory, number> = { touristic: 30, transport: 15, other: 10 };
    const poiGroups: Array<{ key: PoiCategory; label: string; items: WpSuggestion[] }> = (
      ["touristic", "transport", "other"] as PoiCategory[]
    )
      .map((cat) => ({
        key: cat,
        label: cat === "touristic" ? wpL(lang).poiTouristic : cat === "transport" ? wpL(lang).poiTransport : wpL(lang).poiOther,
        items: poiToShow.filter((s) => (s.category ?? "other") === cat).slice(0, POI_GROUP_CAP[cat]),
      }))
      .filter((g) => g.items.length > 0);
    return (
      <div className="space-y-1.5">
        {showSuggested && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(suggested!);
              const hit = cityList.find((c) => c.name.toLowerCase() === suggested!.trim().toLowerCase());
              setCityQuery(hit ? hit.name : suggested!);
            }}
            className="flex w-full items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-2 py-1.5 text-left text-sm hover:bg-primary/20"
          >
            <span className="min-w-0 flex-1 truncate font-medium">{suggested}</span>
            <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {wpL(lang).recommended}
            </span>
          </button>
        )}

        {/* Step 1 — which city (independent for departure and arrival) */}
        <div className="relative">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{wpL(lang).city}</p>
          <Input
            value={cityQuery}
            placeholder={t("search_city")}
            onFocus={() => setCityOpen(true)}
            onBlur={() => setTimeout(() => setCityOpen(false), 150)}
            onChange={(e) => setCityQuery(e.target.value)}
            autoComplete="off"
          />
          {cityOpen && filteredCities.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
              {filteredCities.map((c, i) => {
                const sel = cityQuery === c.name;
                return (
                  <button
                    type="button"
                    key={`${c.country}-${c.name}-${i}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setCityQuery(c.name);
                      onChange(c.name); // default point = city centre until a POI is picked
                      setCityOpen(false);
                      // Immediately reveal that city's points of interest,
                      // rather than requiring a separate tap on the point field.
                      setOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                    <span className="mr-1">{flagOf(c.country)}</span>
                    <span className="min-w-0 flex-1 truncate">{withRomanization(c.name, lang)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2 — point of interest / address WITHIN that exact city */}
        {hasActiveCity && (
          <div className="relative">
            <Input
              value={value}
              placeholder={placeholder || t("search_type")}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onChange={(e) => { onChange(e.target.value); setOpen(true); }}
              autoComplete="off"
            />
            {open && (poiToShow.length > 0 || liveToShow.length > 0 || liveLoading || usedToShow.length > 0 || value.trim() !== cityLabel) && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
                {value.trim() !== cityLabel && (
                  <button
                    type="button"
                    key="use-city"
                    onMouseDown={(e) => { e.preventDefault(); onChange(cityLabel); setOpen(false); }}
                    className="mb-1 flex w-full items-center gap-2 rounded-sm border border-border px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{useCityLabel}</span>
                  </button>
                )}
                {/* Places already used elsewhere in this trip — always first
                    (right after "use city centre"), regardless of whether
                    Overpass happens to know them as a tagged POI. */}
                {usedToShow.length > 0 && (
                  <div className="mb-1 border-b border-border/60 pb-1">
                    <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-sky-600 dark:text-sky-400">
                      {wpL(lang).usedSectionTitle}
                    </p>
                    {usedToShow.map((name, i) => {
                      const sel = value === name;
                      return (
                        <button
                          type="button"
                          key={`used-${name}-${i}`}
                          onMouseDown={(e) => { e.preventDefault(); onChange(name); setOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-sm bg-sky-500/5 px-2 py-1.5 text-left text-sm hover:bg-sky-500/10"
                        >
                          <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                          <span className="min-w-0 flex-1 truncate">{withRomanization(name, lang)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {liveToShow.length > 0 && (
                  <div className="py-0.5">
                    {liveToShow.map((s, i) => {
                      const sel = value === s.name;
                      const used = isUsedPlace(s.name, usedPlaces);
                      return (
                        <button
                          type="button"
                          key={`live-${s.name}-${i}`}
                          onMouseDown={(e) => { e.preventDefault(); onChange(s.name); setOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                            used && "bg-sky-500/5",
                          )}
                        >
                          <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="min-w-0 flex-1 truncate">{withRomanization(s.label, lang)}</span>
                          {used && <UsedPlaceBadge lang={lang} />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {liveLoading && liveToShow.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground animate-pulse">{t("loading")}</div>
                )}
                {poiGroups.map((g) => (
                  <div key={g.key} className="py-0.5">
                    <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {g.label}
                    </p>
                    {g.items.map((s, i) => {
                      const sel = value === s.name;
                      const used = isUsedPlace(s.name, usedPlaces);
                      return (
                        <button
                          type="button"
                          key={`poi-${g.key}-${s.name}-${i}`}
                          onMouseDown={(e) => { e.preventDefault(); onChange(s.name); setOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                            used && "bg-sky-500/5",
                          )}
                        >
                          <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          <span className="min-w-0 flex-1 truncate">{withRomanization(s.label, lang)}</span>
                          {used && <UsedPlaceBadge lang={lang} />}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isTollMode) {
    const q = value.trim().toLowerCase();
    const tollHubs: Hub[] = tollRemote.data ?? [];
    return (
      <div className="relative">
        <Input
          value={value}
          placeholder={placeholder || t("toll_booth_placeholder")}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          autoComplete="off"
        />
        {open && q.length >= 3 && (tollHubs.length > 0 || tollRemote.isFetching) && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {tollHubs.length > 0 && (
              <div className="py-1">
                {tollHubs.map((h, i) => {
                  const label = formatHub(h);
                  const sel = value === label;
                  return (
                    <button
                      type="button"
                      key={`toll-${h.name}-${i}`}
                      onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{withRomanization(h.name, lang)}</span>
                        {h.city && <span className="ml-1.5 text-xs opacity-70">- {withRomanization(h.city, lang)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {tollRemote.isFetching && tollHubs.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">{t("global_search")}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (isTrainMode) {
    const countryLabel = (iso: string) => `${flagOf(iso)} ${countryNameLocalized(iso, lang)}`;
    const activeCountry = trainCountry || countries[0] || "";
    // The dropdown must always include whichever country is actually active —
    // even one outside the trip's own declared countries (see the seeding
    // effect above) — otherwise the button would correctly LABEL the right
    // country but the list wouldn't contain it as a selectable/checkable
    // entry when opened.
    const trainCountryOptions = countries.includes(activeCountry) || !activeCountry
      ? countries
      : [...countries, activeCountry];
    const stationsAll: Hub[] = activeCountry ? hubsForMode("train", [activeCountry], true) : [];
    const stationsMajor: Hub[] = activeCountry ? hubsForMode("train", [activeCountry], false) : [];
    const list: Hub[] = showAll ? stationsAll : stationsMajor;
    const q = value.trim().toLowerCase();
    const matchQuery = (h: Hub) =>
      [h.name, h.city].filter(Boolean).join(" ").toLowerCase().includes(q) &&
      formatHub(h).toLowerCase() !== q;
    const rawFiltered: Hub[] = q ? stationsAll.filter(matchQuery).slice(0, 80) : list;
    // A station already used elsewhere in the trip floats to the top —
    // easy to spot for a repeat boarding/alighting point.
    const filtered: Hub[] = [...rawFiltered].sort(
      (a, b) => Number(isUsedPlace(formatHub(b), usedPlaces)) - Number(isUsedPlace(formatHub(a), usedPlaces)),
    );
    const remoteHubs: Hub[] = (trainRemote.data ?? []).filter(
      (r) => !filtered.some((f) => f.name.toLowerCase() === r.name.toLowerCase() && f.city === r.city),
    );
    const hiddenCount = stationsAll.length - stationsMajor.length;

    return (
      <div className="space-y-1.5">
        {/* Step 1 — which country (independent of the other endpoint, since a
            train may well cross a border) */}
        <div className="relative">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{wpL(lang).country}</p>
          <button
            type="button"
            onClick={() => setTrainCountryOpen((v) => !v)}
            onBlur={() => setTimeout(() => setTrainCountryOpen(false), 150)}
            className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm"
          >
            <span className="truncate">{activeCountry ? countryLabel(activeCountry) : wpL(lang).selectCountry}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
          {trainCountryOpen && trainCountryOptions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
              {trainCountryOptions.map((iso) => {
                const sel = iso === activeCountry;
                return (
                  <button
                    type="button"
                    key={iso}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTrainCountry(iso);
                      setTrainCountryOpen(false);
                      setOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{countryLabel(iso)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 2 — station, scoped to exactly that country. Free text is
            still the saved value; matching stations (local list + live
            country-filtered search) are suggested below as it's typed. */}
        <div className="relative">
          <Input
            value={value}
            placeholder={placeholder || t("search_type")}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => { onChange(e.target.value); setOpen(true); }}
            autoComplete="off"
          />
          {open && (filtered.length > 0 || hiddenCount > 0 || (q && (remoteHubs.length > 0 || trainRemote.isFetching))) && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
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
                    const used = isUsedPlace(label, usedPlaces);
                    return (
                      <button
                        type="button"
                        key={`${h.city ?? ""}-${h.name}-${i}`}
                        onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                          used && "bg-sky-500/5",
                        )}
                      >
                        <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{withRomanization(h.city ?? h.name, lang)}</span>
                          {h.city && <span className="ml-1.5 text-xs opacity-70">- {withRomanization(h.name, lang)}</span>}
                        </span>
                        {used && <UsedPlaceBadge lang={lang} />}
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
                    const used = isUsedPlace(label, usedPlaces);
                    return (
                      <button
                        type="button"
                        key={`remote-${h.name}-${i}`}
                        onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                          used && "bg-sky-500/5",
                        )}
                      >
                        <Check className="h-4 w-4 shrink-0 opacity-0" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{withRomanization(h.city ?? h.name, lang)}</span>
                          {h.city && <span className="ml-1.5 text-xs opacity-70">- {withRomanization(h.name, lang)}</span>}
                        </span>
                        {used && <UsedPlaceBadge lang={lang} />}
                      </button>
                    );
                  })}
                </div>
              )}
              {q && trainRemote.isFetching && remoteHubs.length === 0 && (
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
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
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
  // Ferry: the curated list is widened with every regionally-found port
  // (see the effect above) — deduped by name+city against the curated
  // entries so a port already hand-picked doesn't show up twice.
  const dedupeHubs = (base: Hub[], extra: Array<{ name: string; city?: string }>): Hub[] => {
    const seen = new Set(base.map((h) => `${h.name.toLowerCase()}|${(h.city ?? "").toLowerCase()}`));
    const out = [...base];
    for (const e of extra) {
      const k = `${e.name.toLowerCase()}|${(e.city ?? "").toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k); out.push({ name: e.name, city: e.city });
    }
    return out;
  };
  const all: Hub[] = mode === "ferry"
    ? dedupeHubs(hubsForMode(mode, countries, true), regionalPorts)
    : hubsForMode(mode, countries, true);
  const allCountries = Object.keys(HUBS);
  const globalHubs: Hub[] = hubsForMode(mode, allCountries, true);
  const list: Hub[] = showAll ? all : major;
  const q = value.trim().toLowerCase();
  const matchQuery = (h: Hub) =>
    [h.name, h.city].filter(Boolean).join(" ").toLowerCase().includes(q) &&
    formatHub(h).toLowerCase() !== q;
  let filteredRaw: Hub[] = q ? all.filter(matchQuery).slice(0, 80) : list;
  if (q && filteredRaw.length === 0) {
    filteredRaw = globalHubs.filter(matchQuery);
  }
  // A port/stop already used elsewhere in the trip floats to the top — same
  // treatment as the train-mode station list below, so re-picking a repeat
  // boarding/alighting point is easy to spot regardless of transport mode.
  const filtered: Hub[] = [...filteredRaw].sort(
    (a, b) => Number(isUsedPlace(formatHub(b), usedPlaces)) - Number(isUsedPlace(formatHub(a), usedPlaces)),
  );
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
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[45dvh] overflow-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md">
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
                const used = isUsedPlace(label, usedPlaces);
                return (
                  <button
                    type="button"
                    key={`${h.city ?? ""}-${h.name}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      used && "bg-sky-500/5",
                    )}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", sel ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{withRomanization(h.city ?? h.name, lang)}</span>
                      {h.city && <span className="ml-1.5 text-xs opacity-70">- {withRomanization(h.name, lang)}</span>}
                    </span>
                    {used && <UsedPlaceBadge lang={lang} />}
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
                const used = isUsedPlace(label, usedPlaces);
                return (
                  <button
                    type="button"
                    key={`remote-${h.name}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(label); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent",
                      used && "bg-sky-500/5",
                    )}
                  >
                    <Check className="h-4 w-4 shrink-0 opacity-0" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{withRomanization(h.city ?? h.name, lang)}</span>
                      {h.city && <span className="ml-1.5 text-xs opacity-70">- {withRomanization(h.name, lang)}</span>}
                    </span>
                    {used && <UsedPlaceBadge lang={lang} />}
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

