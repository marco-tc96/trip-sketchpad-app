import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, Image as ImageIcon, Map as MapIcon, Sparkles, Upload, Palette, Check, Pencil, X, Plus, ChevronsUpDown, Briefcase, Palmtree, LayoutDashboard, CalendarDays, Wallet, Clock } from "lucide-react";
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
    trip_type?: "vacation" | "business";
  };
  const coverType = (tripRow.cover_type ?? "auto") as "auto" | "map" | "photo" | "color";
  const cities = Array.isArray(tripRow.cities) ? tripRow.cities : [];
  const countries = Array.isArray(tripRow.countries) ? tripRow.countries : [];
  const tripType = (tripRow.trip_type ?? "vacation") as "vacation" | "business";
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
      {/* Header-only focal media (photo or map), centered, fades into the
          gradient below the first information block. */}
      {coverType === "photo" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[58vh] overflow-hidden"
          style={{
            WebkitMaskImage:
              "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
            maskImage:
              "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)",
          }}
        >
          <CoverContent
            tripId={tripId}
            coverType={coverType}
            coverUrl={tripRow.cover_url ?? null}
            cities={cities}
            gradient={autoGradient}
            signedPhoto={signedPhoto}
            setSignedPhoto={setSignedPhoto}
          />
        </div>
      )}

      {/* In photo mode, override the flag gradient behind the page with a
          theme-aware solid so the photo fades into dark/light, not into the
          flag colors. A blurred copy of the photo continues underneath the
          info blocks for visual continuity. */}
      {isPhoto && (
        <>
          <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />
          <PhotoBlurBackdrop
            tripId={tripId}
            coverUrl={tripRow.cover_url ?? null}
            signedPhoto={signedPhoto}
            setSignedPhoto={setSignedPhoto}
          />
        </>
      )}

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-12 pt-4">
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

        {/* Map of visited cities sits in the free space between the cover
            selector row and the title/info block. */}
        <div className="relative my-4 min-h-[40vh] flex-1 overflow-hidden rounded-2xl">
          <TripMap
            cities={cities}
            countries={countries}
            className="absolute inset-0 h-full w-full"
            noTiles={coverType !== "map"}
            compact
          />
        </div>

        <header className="flex flex-col gap-3 rounded-3xl border border-border/50 bg-background/70 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl">
            {trip.data.cover_emoji ?? "✈️"}
            <span
              aria-label={t(tripType)}
              title={t(tripType)}
              className={cn(
                "absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-2 border-background text-primary-foreground shadow-soft",
                tripType === "business" ? "bg-slate-700" : "bg-emerald-600",
              )}
            >
              {tripType === "business" ? <Briefcase className="h-3 w-3" /> : <Palmtree className="h-3 w-3" />}
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

      <nav
        aria-label="Sezioni viaggio"
        className="mt-5 mx-auto flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 text-xs shadow-soft backdrop-blur"
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
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTitle: string;
  initialCities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
  initialCountries: string[];
  initialType: "vacation" | "business";
  initialEmoji: string;
  onSave: (patch: {
    title: string;
    cities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
    destination: string | null;
    trip_type: "vacation" | "business";
    cover_emoji: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [cities, setCities] = useState(initialCities);
  const [type, setType] = useState(initialType);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setCities(initialCities);
      setType(initialType);
      setEmoji(initialEmoji || "✈️");
      setQuery("");
    }
  }, [open, initialTitle, initialCities, initialType, initialEmoji]);

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

          <div className="space-y-1.5">
            <Label>{t("trip_type")}</Label>
            <div className="inline-flex rounded-full border border-border bg-secondary/40 p-1 text-sm">
              {(["vacation", "business"] as const).map((v) => (
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

function TimezoneBadge({ home, destinations }: { home: string | null; destinations: string[] }) {
  if (!home || destinations.length === 0) return null;
  const dest = destinations[0];
  if (dest === home) return null;
  const offset = (iso: string) => {
    const c = Country.getCountryByCode(iso);
    const tz = c?.timezones?.[0];
    return tz ? tz.gmtOffset / 3600 : null;
  };
  const h = offset(home);
  const d = offset(dest);
  if (h == null || d == null) return null;
  const diff = Math.round(d - h);
  if (diff === 0) return null;
  const sign = diff > 0 ? "+" : "−";
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground shadow-soft backdrop-blur">
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">{sign}{Math.abs(diff)}h locale</span>
    </div>
  );
}