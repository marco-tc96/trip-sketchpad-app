import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, Image as ImageIcon, Map as MapIcon, Sparkles, Upload, Palette, Check, Pencil, X, Plus, ChevronsUpDown, Briefcase, Palmtree, Footprints, LayoutDashboard, CalendarDays, Wallet, Clock, ChevronDown, Move } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { getTrip, deleteTrip, updateTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { FxAverageWidget } from "@/components/app/fx-avg-widget";
import { CityCover } from "@/components/app/city-cover";
import { TripMap } from "@/components/app/trip-map";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { countryNameLocalized, citiesOfCountry, flagOf } from "@/lib/country-data";
import { flagGradient } from "@/lib/flag-gradient";
import { Country } from "country-state-city";

export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = Route.useParams();
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const loc = useLocation();
  const { user } = useAuth();

  const tripFn = useServerFn(getTrip);
  const profileFn = useServerFn(getProfile);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const delFn = useServerFn(deleteTrip);
  const updateFn = useServerFn(updateTrip);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [signedPhoto, setSignedPhoto] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (trip.isLoading || !trip.data) {
    return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">{t("loading")}</main>;
  }

  const tripRow = trip.data as typeof trip.data & {
    cover_type?: "auto" | "map" | "photo" | "color";
    cover_url?: string | null;
    cover_bg?: string | null;
    countries?: string[];
    cities?: Array<{ name: string; country: string; lat?: number; lng?: number }>;
    trip_type?: "vacation" | "business" | "daytrip";
  };
  const coverType = (tripRow.cover_type ?? "auto") as "auto" | "map" | "photo" | "color";
  const cities = Array.isArray(tripRow.cities) ? tripRow.cities : [];
  const countries = Array.isArray(tripRow.countries) ? tripRow.countries : [];
  const tripType = (tripRow.trip_type ?? "vacation") as "vacation" | "business" | "daytrip";
  const typeIcon = tripType === "business" ? Briefcase : tripType === "daytrip" ? Footprints : Palmtree;
  const typeColor =
    tripType === "business"
      ? "bg-slate-700"
      : tripType === "daytrip"
        ? "bg-amber-600"
        : "bg-emerald-600";
  const TypeIcon = typeIcon;
  const lang = i18n.language || "it";
  const localizedCountries = countries.length > 0
    ? countries.map((iso) => countryNameLocalized(iso, lang)).join(" · ")
    : tripRow.country;
  const citiesLabel = cities.length > 0
    ? cities.map((c) => c.name).join(" · ")
    : tripRow.destination;
  const autoGradient = flagGradient(countries);

  async function setCoverType(next: "auto" | "map" | "photo" | "color") {
    if (next === coverType) return;
    try {
      await updateFn({ data: { id: tripId, patch: { cover_type: next } } });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  async function setCoverBg(bg: string | null) {
    try {
      await updateFn({
        data: { id: tripId, patch: { cover_bg: bg, cover_type: "color" } },
      });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  async function onPickPhoto(file: File) {
    if (!user) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${tripId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("trip-covers")
        .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
      if (error) throw error;
      await updateFn({
        data: { id: tripId, patch: { cover_url: path, cover_type: "photo" } },
      });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
      qc.invalidateQueries({ queryKey: ["trips"] });
      toast.success(t("saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    } finally {
      setUploading(false);
    }
  }

  const tabs: { to: "/trips/$tripId" | "/trips/$tripId/timeline" | "/trips/$tripId/expenses"; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }[] = [
    { to: "/trips/$tripId", label: t("overview"), icon: LayoutDashboard, exact: true },
    { to: "/trips/$tripId/timeline", label: t("timeline"), icon: CalendarDays },
    { to: "/trips/$tripId/expenses", label: t("expenses"), icon: Wallet },
  ];

  const isPhoto = coverType === "photo";
  // When `coverType === "photo"`, we reuse `cover_bg` to persist the focal
  // point as `"<x>% <y>%"`. Keeps the column from needing a migration.
  const initialFocal =
    isPhoto && tripRow.cover_bg && /^\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(tripRow.cover_bg)
      ? tripRow.cover_bg
      : "50% 50%";
  const [focal, setFocal] = useState<string>(initialFocal);
  useEffect(() => {
    setFocal(initialFocal);
  }, [initialFocal]);

  async function saveFocal(next: string) {
    if (!isPhoto) return;
    try {
      await updateFn({ data: { id: tripId, patch: { cover_bg: next } } });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  return (
    <div className="relative min-h-screen isolate">
      {/* Full-bleed gradient that stays behind the entire page */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            coverType === "color"
              ? tripRow.cover_bg ||
                "linear-gradient(135deg, oklch(0.78 0.1 55), oklch(0.66 0.14 38))"
              : autoGradient,
        }}
      />
      {/* Full-screen draggable photo cover. Sits fixed behind everything so
          the header floats over it; user can drag to reposition the focal
          point. The result is persisted to `cover_bg`. */}
      {isPhoto && (
        <FullScreenPhoto
          tripId={tripId}
          coverUrl={tripRow.cover_url ?? null}
          signedPhoto={signedPhoto}
          setSignedPhoto={setSignedPhoto}
          focal={focal}
          onFocalChange={setFocal}
          onCommit={saveFocal}
        />
      )}

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-12 pt-4">
        {/* First viewport: cover + header. Tabs/outlet are pushed below the
            fold so the trip page opens with the presentation card alone and
            reveals the rest as the user swipes/scrolls up. */}
        <section className="flex min-h-[100svh] flex-col">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/trips"
            className="inline-flex items-center gap-1 rounded-full bg-background/60 px-3 py-1.5 text-sm text-foreground backdrop-blur hover:bg-background/80"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("back")}
          </Link>
          {/* Always-visible cover selector */}
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 text-xs shadow-soft backdrop-blur">
            <CoverPill active={coverType === "auto"} onClick={() => setCoverType("auto")} icon={Sparkles} label={t("cover_auto")} />
            <CoverPill active={coverType === "map"} onClick={() => setCoverType("map")} icon={MapIcon} label={t("cover_map")} />
            <CoverPill
              active={coverType === "photo"}
              onClick={() => {
                // If a photo already exists, switching to the photo cover
                // just shows it — no re-upload. The user can replace it via
                // the dedicated "Change photo" button below.
                if (tripRow.cover_url) setCoverType("photo");
                else fileRef.current?.click();
              }}
              icon={ImageIcon}
              label={t("cover_photo")}
            />
            {coverType === "photo" && tripRow.cover_url && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-foreground/80 transition hover:bg-foreground/10"
              >
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("change_photo")}</span>
              </button>
            )}
            <ColorCoverPill
              active={coverType === "color"}
              current={tripRow.cover_bg}
              onPick={(bg) => setCoverBg(bg)}
            />
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickPhoto(f);
            e.target.value = "";
          }}
        />
        {uploading && (
          <div className="fixed inset-x-0 top-16 z-20 mx-auto w-fit rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
            <span className="inline-flex items-center gap-2"><Upload className="h-3.5 w-3.5" /> {t("upload_cover")}…</span>
          </div>
        )}

        {/* Map of visited cities — shown only when the user picks the map
            cover, so pins don't leak onto photo/gradient/color backgrounds. */}
        {coverType === "map" ? (
          <div className="relative my-4 min-h-[40vh] flex-1 overflow-hidden rounded-2xl">
            <TripMap
              cities={cities}
              countries={countries}
              className="absolute inset-0 h-full w-full"
              compact
            />
          </div>
        ) : (
          <div className="my-4 flex-1" />
        )}

        <header className="flex flex-col gap-3 rounded-3xl border border-border/50 bg-background/70 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl">
            {trip.data.cover_emoji ?? "✈️"}
            <span
              aria-label={t(tripType)}
              title={t(tripType)}
              className={cn(
                "absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-background text-primary-foreground shadow-soft",
                typeColor,
              )}
            >
              <TypeIcon className="h-3 w-3" />
            </span>
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              {trip.data.title}
            </h1>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {[citiesLabel, localizedCountries].filter(Boolean).join(", ")}
            </p>
            <p className="truncate text-xs text-muted-foreground/80">
              {fmt(trip.data.start_date)} → {fmt(trip.data.end_date)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
          {profile.data && (
            <div className="flex flex-col items-end gap-1">
              <FxAverageWidget
                from={profile.data.home_currency}
                to={trip.data.local_currency}
                start={trip.data.start_date}
                end={trip.data.end_date}
                fallback={trip.data.fx_rate_fallback}
              />
              <TimezoneBadge
                home={(profile.data as { home_country?: string | null }).home_country ?? null}
                destinations={countries}
                startDate={trip.data.start_date}
              />
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label={t("edit_trip")}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={async () => {
              if (!confirm(t("delete_confirm"))) return;
              try {
                await delFn({ data: { id: tripId } });
                qc.invalidateQueries({ queryKey: ["trips"] });
                nav({ to: "/trips" });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : t("error_generic"));
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>
        {/* Swipe-up hint shown only on the first screen */}
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: window.innerHeight * 0.85, behavior: "smooth" });
          }}
          aria-label="Mostra contenuti"
          className="mx-auto mt-2 inline-flex items-center gap-1 rounded-full bg-background/60 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur transition hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5 animate-bounce" />
          <span>Scorri per i dettagli</span>
        </button>
        </section>

      <nav
        aria-label="Sezioni viaggio"
        className="mt-8 mx-auto flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 text-xs shadow-soft backdrop-blur"
      >
        {tabs.map((tab) => {
          const active = tab.exact
            ? loc.pathname === `/trips/${tripId}`
            : loc.pathname.startsWith(`/trips/${tripId}${tab.to.replace("/trips/$tripId", "")}`);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ tripId }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition",
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

        <div className="pt-6"><Outlet /></div>
      </main>

      <EditTripDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialTitle={trip.data.title}
        initialCities={cities}
        initialCountries={countries}
        initialType={tripType}
        initialEmoji={trip.data.cover_emoji ?? "✈️"}
        initialStartDate={trip.data.start_date}
        initialEndDate={trip.data.end_date}
        onSave={async (patch) => {
          try {
            await updateFn({ data: { id: tripId, patch } });
            qc.invalidateQueries({ queryKey: ["trip", tripId] });
            qc.invalidateQueries({ queryKey: ["trips"] });
            toast.success(t("saved"));
            setEditOpen(false);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("error_generic"));
          }
        }}
      />
    </div>
  );
}

function EditTripDialog({
  open,
  onOpenChange,
  initialTitle,
  initialCities,
  initialCountries,
  initialType,
  initialEmoji,
  initialStartDate,
  initialEndDate,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTitle: string;
  initialCities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
  initialCountries: string[];
  initialType: "vacation" | "business" | "daytrip";
  initialEmoji: string;
  initialStartDate: string;
  initialEndDate: string;
  onSave: (patch: {
    title: string;
    cities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
    destination: string | null;
    trip_type: "vacation" | "business" | "daytrip";
    cover_emoji: string;
    start_date: string;
    end_date: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [cities, setCities] = useState(initialCities);
  const [type, setType] = useState(initialType);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setCities(initialCities);
      setType(initialType);
      setEmoji(initialEmoji || "✈️");
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setQuery("");
    }
  }, [open, initialTitle, initialCities, initialType, initialEmoji, initialStartDate, initialEndDate]);

  const available = initialCountries.flatMap((iso) => citiesOfCountry(iso));
  const q = query.trim().toLowerCase();
  const filtered = (q ? available.filter((c) => c.name.toLowerCase().includes(q)) : available).slice(0, 200);
  const canAddCustom =
    q.length >= 2 && !filtered.some((c) => c.name.toLowerCase() === q);

  function toggle(c: { name: string; country: string; lat?: number; lng?: number }) {
    setCities((prev) => {
      const key = `${c.country}|${c.name}`;
      const exists = prev.some((x) => `${x.country}|${x.name}` === key);
      return exists
        ? prev.filter((x) => `${x.country}|${x.name}` !== key)
        : [...prev, c];
    });
  }

  function addCustom() {
    const name = query.trim();
    if (!name) return;
    const iso = initialCountries[0];
    if (!iso) return;
    toggle({ name, country: iso });
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit_trip")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Icona</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                className="w-16 text-center text-2xl"
                maxLength={4}
              />
              <div className="flex flex-wrap gap-1.5">
                {["✈️","🏖️","🗺️","🏔️","🏛️","🏙️","🚆","🚗","⛵","🎒","💼","🍷"].map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-lg text-xl transition",
                      emoji === e ? "bg-primary/15 ring-2 ring-primary" : "bg-secondary hover:bg-secondary/80",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("start_date")}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("end_date")}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("trip_type")}</Label>
            <div className="inline-flex rounded-full border border-border bg-secondary/40 p-1 text-sm">
              {(["vacation", "business", "daytrip"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setType(v)}
                  className={cn(
                    "rounded-full px-3 py-1.5 transition",
                    type === v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(v)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("destination")}</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {cities.length === 0 ? "Cerca o aggiungi città…" : `${cities.length} città`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Digita per cercare…" value={query} onValueChange={setQuery} />
                  <CommandList className="max-h-72">
                    {filtered.length === 0 && !canAddCustom && <CommandEmpty>Nessuna città</CommandEmpty>}
                    {canAddCustom && (
                      <CommandGroup heading="Aggiungi">
                        <CommandItem onSelect={addCustom}>
                          <Plus className="mr-2 h-4 w-4" />
                          <span>Aggiungi "{query.trim()}"</span>
                        </CommandItem>
                      </CommandGroup>
                    )}
                    {filtered.length > 0 && (
                      <CommandGroup>
                        {filtered.map((c) => {
                          const key = `${c.country}|${c.name}`;
                          const sel = cities.some((x) => `${x.country}|${x.name}` === key);
                          return (
                            <CommandItem
                              key={key}
                              value={key}
                              onSelect={() => toggle({ name: c.name, country: c.country, lat: c.lat, lng: c.lng })}
                            >
                              <Check className={cn("mr-2 h-4 w-4", sel ? "opacity-100" : "opacity-0")} />
                              {initialCountries.length > 1 && <span className="mr-2">{flagOf(c.country)}</span>}
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
            {cities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {cities.map((c) => (
                  <Badge key={`${c.country}|${c.name}`} variant="secondary" className="gap-1 rounded-full pl-2 pr-1">
                    <span>{flagOf(c.country)}</span>
                    <span>{c.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-foreground/10"
                      aria-label={`Remove ${c.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button
            onClick={() =>
              onSave({
                title: title.trim() || initialTitle,
                cities,
                destination: cities[0]?.name ?? null,
                trip_type: type,
                cover_emoji: emoji || "✈️",
                start_date: startDate || initialStartDate,
                end_date: endDate || initialEndDate,
              })
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoverPill({
  active, onClick, icon: Icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-foreground/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

const COVER_BG_PRESETS = [
  "linear-gradient(135deg,#fcb69f,#ff8a65)",
  "linear-gradient(135deg,#a1c4fd,#c2e9fb)",
  "linear-gradient(135deg,#84fab0,#8fd3f4)",
  "linear-gradient(135deg,#f6d365,#fda085)",
  "linear-gradient(135deg,#5ee7df,#b490ca)",
  "linear-gradient(135deg,#243949,#517fa4)",
  "#0f172a",
  "#1e293b",
  "#f1f5f9",
];

function ColorCoverPill({
  active,
  current,
  onPick,
}: {
  active: boolean;
  current?: string | null;
  onPick: (bg: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition",
            active
              ? "bg-primary text-primary-foreground"
              : "text-foreground/80 hover:bg-foreground/10",
          )}
        >
          <Palette className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Colore</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Sfondo del viaggio
        </p>
        <div className="grid grid-cols-3 gap-2">
          {COVER_BG_PRESETS.map((bg) => {
            const sel = active && current === bg;
            return (
              <button
                key={bg}
                type="button"
                onClick={() => onPick(bg)}
                className={cn(
                  "relative h-12 rounded-lg border border-border/60",
                  sel && "ring-2 ring-primary",
                )}
                style={{ background: bg }}
                aria-label={bg}
              >
                {sel && (
                  <Check className="absolute right-1 top-1 h-3.5 w-3.5 text-white drop-shadow" />
                )}
              </button>
            );
          })}
        </div>
        <label className="mt-3 block text-xs text-muted-foreground">
          Custom (CSS color / gradient)
          <input
            type="text"
            defaultValue={current ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onPick(v);
            }}
            placeholder="#0f172a oppure linear-gradient(...)"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

function CoverContent({
  tripId,
  coverType,
  coverUrl,
  cities,
  gradient,
  signedPhoto,
  setSignedPhoto,
}: {
  tripId: string;
  coverType: "auto" | "photo";
  coverUrl: string | null;
  cities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
  gradient: string;
  signedPhoto: string | null;
  setSignedPhoto: (v: string | null) => void;
}) {
  // Resolve signed URL for private photo storage.
  useEffect(() => {
    let cancelled = false;
    setSignedPhoto(null);
    if (coverType === "photo" && coverUrl && !/^https?:\/\//i.test(coverUrl)) {
      supabase.storage
        .from("trip-covers")
        .createSignedUrl(coverUrl, 60 * 60)
        .then(({ data }) => {
          if (!cancelled) setSignedPhoto(data?.signedUrl ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [coverType, coverUrl, tripId, setSignedPhoto]);

  if (coverType === "photo") {
    const src = signedPhoto || (coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null);
    return <CityCover src={src} gradient={gradient} />;
  }

  // auto
  const src = coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null;
  return <CityCover src={src} gradient={gradient} />;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function PhotoBlurBackdrop({
  tripId, coverUrl, signedPhoto, setSignedPhoto,
}: {
  tripId: string;
  coverUrl: string | null;
  signedPhoto: string | null;
  setSignedPhoto: (v: string | null) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
      supabase.storage
        .from("trip-covers")
        .createSignedUrl(coverUrl, 60 * 60)
        .then(({ data }) => {
          if (!cancelled) setSignedPhoto(data?.signedUrl ?? null);
        });
    }
    return () => { cancelled = true; };
  }, [coverUrl, tripId, setSignedPhoto]);
  const src = signedPhoto || (coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null);
  if (!src) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 top-[58vh] z-0 overflow-hidden"
    >
      <img
        src={src}
        alt=""
        className="h-full w-full scale-110 object-cover opacity-50"
        style={{ filter: "blur(28px)" }}
      />
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
}

function TimezoneBadge({
  home,
  destinations,
  startDate,
}: {
  home: string | null;
  destinations: string[];
  startDate?: string;
}) {
  if (!home || destinations.length === 0) return null;
  const dest = destinations[0];
  if (dest.toUpperCase() === home.toUpperCase()) return null;
  const zoneOf = (iso: string) => {
    const c = Country.getCountryByCode(iso);
    return c?.timezones?.[0]?.zoneName ?? null;
  };
  const homeZone = zoneOf(home);
  const destZone = zoneOf(dest);
  if (!homeZone || !destZone) return null;
  const when = startDate ? new Date(`${startDate}T12:00:00Z`) : new Date();
  const offsetOn = (tz: string, d: Date): number | null => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      }).formatToParts(d);
      const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
      const m = name.match(/GMT([+-]?)(\d{1,2})(?::?(\d{2}))?/);
      if (!m) return name === "GMT" ? 0 : null;
      const sign = m[1] === "-" ? -1 : 1;
      return sign * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0));
    } catch {
      return null;
    }
  };
  const abbrOn = (tz: string, d: Date): string | null => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "short",
      }).formatToParts(d);
      return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
    } catch {
      return null;
    }
  };
  const h = offsetOn(homeZone, when);
  const d = offsetOn(destZone, when);
  if (h == null || d == null) return null;
  if (Math.abs(d - h) < 0.01) return null;
  const utcFmt = (n: number) => {
    const s = n >= 0 ? "+" : "−";
    const abs = Math.abs(n);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return mm ? `UTC${s}${hh}:${String(mm).padStart(2, "0")}` : `UTC${s}${hh}`;
  };
  const label = (tz: string, off: number) => {
    const abbr = abbrOn(tz, when);
    const utc = utcFmt(off);
    // If abbr is just a GMT/UTC form, only show that once.
    if (!abbr || /^(GMT|UTC)/i.test(abbr)) return utc;
    return `${abbr} (${utc})`;
  };
  const diff = Math.round((d - h) * 10) / 10;
  const diffLabel = `${diff > 0 ? "+" : "−"}${Math.abs(diff)}h`;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground shadow-soft backdrop-blur">
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">
        {label(homeZone, h)} → {label(destZone, d)} ({diffLabel})
      </span>
    </div>
  );
}

function FullScreenPhoto({
  tripId,
  coverUrl,
  signedPhoto,
  setSignedPhoto,
  focal,
  onFocalChange,
  onCommit,
}: {
  tripId: string;
  coverUrl: string | null;
  signedPhoto: string | null;
  setSignedPhoto: (v: string | null) => void;
  focal: string;
  onFocalChange: (v: string) => void;
  onCommit: (v: string) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    setSignedPhoto(null);
    if (coverUrl && !/^https?:\/\//i.test(coverUrl)) {
      supabase.storage
        .from("trip-covers")
        .createSignedUrl(coverUrl, 60 * 60)
        .then(({ data }) => {
          if (!cancelled) setSignedPhoto(data?.signedUrl ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [coverUrl, tripId, setSignedPhoto]);
  const src = signedPhoto || (coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null);
  const startRef = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function parseFocal(v: string): { x: number; y: number } {
    const m = v.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!src) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    const f = parseFocal(focal);
    startRef.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dx = ((e.clientX - startRef.current.x) / w) * 100;
    const dy = ((e.clientY - startRef.current.y) / h) * 100;
    const nx = Math.max(0, Math.min(100, startRef.current.fx - dx));
    const ny = Math.max(0, Math.min(100, startRef.current.fy - dy));
    onFocalChange(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return;
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
    setDragging(false);
    onCommit(focal);
  }

  if (!src) {
    return <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />;
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-0 touch-none select-none overflow-hidden",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Trascina per centrare"
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
          style={{ objectPosition: focal }}
        />
        {/* Legibility overlay for content above */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[11px] text-white backdrop-blur">
        <span className="inline-flex items-center gap-1">
          <Move className="h-3 w-3" /> Trascina la foto per centrarla
        </span>
      </div>
    </>
  );
}