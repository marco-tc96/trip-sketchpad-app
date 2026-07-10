import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, Image as ImageIcon, Map as MapIcon, Sparkles, Upload, Palette, Check, Pencil, X, Plus, ChevronsUpDown, Briefcase, Palmtree, Footprints, CalendarDays, Wallet, Clock, Move, Menu, ChevronUp, Heart } from "lucide-react";
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
import { countryNameLocalized, citiesOfCountry, flagOf, localizedCountries, cityNameLocalized, primaryTimezoneOfCountry, currencyForCountryAt } from "@/lib/country-data";
import { flagGradient } from "@/lib/flag-gradient";

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
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);
  const [focal, setFocal] = useState<string>("50% 50%");
  const [zoom, setZoom] = useState<number>(1);
  const [repositioning, setRepositioning] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const titleSentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = trip.data as { cover_type?: string; cover_bg?: string | null } | undefined;
    if (!row) return;
    if (row.cover_type === "photo" && row.cover_bg) {
      const m = row.cover_bg.match(/^(\d+(?:\.\d+)?%\s+\d+(?:\.\d+)?%)(?:\s+scale\((\d+(?:\.\d+)?)\))?$/);
      if (m) {
        setFocal(m[1]);
        setZoom(m[2] ? parseFloat(m[2]) : 1);
        return;
      }
    }
    setFocal("50% 50%");
    setZoom(1);
  }, [trip.data]);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-trip-scroller]");
    const sentinel = titleSentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [trip.data]);

  const [isFavorite, setIsFavorite] = useState(() => {
    try {
      const stored = localStorage.getItem("trip_favorites");
      return stored ? (JSON.parse(stored) as string[]).includes(tripId) : false;
    } catch { return false; }
  });

  function toggleFavorite() {
    setIsFavorite((prev) => {
      const next = !prev;
      try {
        const stored = localStorage.getItem("trip_favorites");
        const ids: string[] = stored ? (JSON.parse(stored) as string[]) : [];
        const updated = next
          ? [...new Set([...ids, tripId])]
          : ids.filter((id) => id !== tripId);
        localStorage.setItem("trip_favorites", JSON.stringify(updated));
      } catch { /* ignore */ }
      return next;
    });
  }

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
  const isWishlist = trip.data.start_date >= "2099-01-01";
  const todayISO = new Date().toISOString().slice(0, 10);
  const tripCurrencies: string[] = [...new Set(
    countries
      .map((iso) => currencyForCountryAt(iso, isWishlist ? todayISO : trip.data.start_date))
      .filter((c): c is string => !!c)
  )];
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
  const countriesLabel = countries.length > 0
    ? countries.map((iso) => countryNameLocalized(iso, lang)).join(" · ")
    : tripRow.country;
  const citiesLabel = cities.length > 0
    ? cities.map((c) => cityNameLocalized(c.name, lang)).join(" · ")
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

  const tabs: { to: "/trips/$tripId/timeline" | "/trips/$tripId/expenses"; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean }[] = [
    { to: "/trips/$tripId/timeline", label: t("timeline"), icon: CalendarDays },
    { to: "/trips/$tripId/expenses", label: t("expenses"), icon: Wallet },
  ];

  const isPhoto = coverType === "photo";
  async function saveFocalAndZoom(nextFocal: string, nextZoom: number) {
    if (!isPhoto) return;
    try {
      const z = Math.round(nextZoom * 100) / 100;
      const value = z !== 1 ? `${nextFocal} scale(${z})` : nextFocal;
      await updateFn({ data: { id: tripId, patch: { cover_bg: value } } });
      qc.invalidateQueries({ queryKey: ["trip", tripId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error_generic"));
    }
  }

  // Reserved space above the title card for "photo"/"map" covers: the
  // opening screen fills the FULL viewport with cover + title card only,
  // everything else (tabs, days) lives one swipe/scroll below the fold.
  const hasReservedSpace = coverType === "map" || coverType === "photo";

  return (
    <div data-trip-scroller className="relative h-[100svh] overflow-y-auto scroll-smooth isolate">
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
      {isPhoto && (
        <FullScreenPhoto
          tripId={tripId}
          coverUrl={tripRow.cover_url ?? null}
          signedPhoto={signedPhoto}
          setSignedPhoto={setSignedPhoto}
          focal={focal}
          onFocalChange={setFocal}
          zoom={zoom}
          onZoomChange={setZoom}
          onCommit={saveFocalAndZoom}
          repositioning={repositioning}
          onDone={() => setRepositioning(false)}
          showControls={!scrolled}
        />
      )}

      {/* Top bar — back arrow + hamburger. ALWAYS the same fixed element,
          pinned to the very top of the viewport for the whole page
          lifetime (never lives inside the scrolling section), so it can
          never "disappear" after the swipe. Its vertical position is
          fixed; the compact title pill below is what animates in next to
          it once the user has scrolled past the title card, so the two
          end up visually aligned on the same row. Own stacking context
          well above the map/photo cover and the BottomDock. */}
      <div
        className="fixed inset-x-0 z-[55] isolate mx-auto flex max-w-5xl items-center justify-between gap-2 px-4"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <Link
          to="/trips"
          aria-label={t("back")}
          className="inline-flex items-center justify-center rounded-full bg-background/60 p-2.5 text-foreground backdrop-blur hover:bg-background/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-2">
          {/* Heart visible in top bar only when the compact island is NOT showing */}
          {!scrolled && (
            <button
              type="button"
              onClick={toggleFavorite}
              aria-label={isFavorite ? t("remove_from_favorites") : t("add_to_favorites")}
              className="inline-flex items-center justify-center rounded-full bg-background/60 p-2.5 text-foreground backdrop-blur hover:bg-background/80"
            >
              <Heart
                className="h-4 w-4 transition-colors"
                style={isFavorite ? { fill: "oklch(0.58 0.22 25)", color: "oklch(0.58 0.22 25)" } : undefined}
              />
            </button>
          )}
        {/* Hamburger trigger. Options stack top-to-bottom in a vertical
            menu to the left of the trigger button, not as a row of pills. */}
        <Popover open={coverMenuOpen} onOpenChange={setCoverMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("cover_auto")}
              className="inline-flex items-center justify-center rounded-full border border-border/60 bg-background/70 p-2.5 text-foreground shadow-soft backdrop-blur hover:bg-background/90"
            >
              <Menu className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1.5">
            <div className="flex flex-col items-stretch gap-0.5 text-sm">
              {/* Heart option moves into the menu when the compact island is visible */}
              {scrolled && (
                <>
                  <button
                    type="button"
                    onClick={() => { toggleFavorite(); setCoverMenuOpen(false); }}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition text-foreground/80 hover:bg-foreground/10"
                  >
                    <Heart
                      className="h-3.5 w-3.5 shrink-0 transition-colors"
                      style={isFavorite ? { fill: "oklch(0.58 0.22 25)", color: "oklch(0.58 0.22 25)" } : undefined}
                    />
                    <span className="truncate">{isFavorite ? t("remove_from_favorites") : t("add_to_favorites")}</span>
                  </button>
                  <div className="my-1 h-px bg-border/60" aria-hidden />
                </>
              )}
              <CoverMenuRow active={coverType === "auto"} onClick={() => setCoverType("auto")} icon={Sparkles} label={t("cover_auto")} />
              <CoverMenuRow active={coverType === "map"} onClick={() => setCoverType("map")} icon={MapIcon} label={t("cover_map")} />
              <CoverMenuRow
                active={coverType === "photo"}
                onClick={() => {
                  if (tripRow.cover_url) setCoverType("photo");
                  else fileRef.current?.click();
                }}
                icon={ImageIcon}
                label={t("cover_photo")}
              />
              {coverType === "photo" && tripRow.cover_url && (
                <>
                  <CoverMenuRow
                    active={repositioning}
                    onClick={() => {
                      setRepositioning((v) => !v);
                      setCoverMenuOpen(false);
                    }}
                    icon={Move}
                    label={t("move_photo")}
                  />
                  <CoverMenuRow
                    active={false}
                    onClick={() => fileRef.current?.click()}
                    icon={Upload}
                    label={t("change_photo")}
                  />
                </>
              )}
              <ColorCoverMenuRow
                active={coverType === "color"}
                current={tripRow.cover_bg}
                onPick={(bg) => setCoverBg(bg)}
              />
              <div className="my-1 h-px bg-border/60" aria-hidden />
              <CoverMenuRow
                active={false}
                onClick={() => {
                  setCoverMenuOpen(false);
                  setEditOpen(true);
                }}
                icon={Pencil}
                label={t("edit_trip")}
              />
              <CoverMenuRow
                active={false}
                onClick={async () => {
                  setCoverMenuOpen(false);
                  if (!confirm(t("delete_confirm"))) return;
                  try {
                    await delFn({ data: { id: tripId } });
                    qc.invalidateQueries({ queryKey: ["trips"] });
                    nav({ to: "/trips" });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("error_generic"));
                  }
                }}
                icon={Trash2}
                label={t("delete_trip")}
              />
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      {/* Compact pinned title pill — fades in once the title-card sentinel
          scrolls out of view, vertically aligned with the fixed top bar
          above so they read as one cohesive header once the swipe happens. */}
      {/* Compact pinned island — padded horizontally so it NEVER overlaps
          the fixed back button (left ~52 px) or menu button (right ~52 px).
          px-16 (64 px each side) gives a comfortable 12 px buffer.
          top matches the top-bar so both sit on the same visual row. */}
      <div
        aria-hidden={!scrolled}
        className={cn(
          "pointer-events-none fixed inset-x-0 z-30 mx-auto flex max-w-5xl justify-center px-16 transition-all duration-300 ease-out",
          scrolled ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
        )}
        style={{ top: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 shadow-soft backdrop-blur">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-base">
            {trip.data.cover_emoji ?? "✈️"}
          </span>
          <div className="min-w-0">
            <p className="truncate font-serif text-sm font-semibold leading-tight">{trip.data.title}</p>
            <p className="truncate text-[10px] text-muted-foreground leading-tight">
              {citiesLabel || ""}
              {!isWishlist && `${citiesLabel ? " · " : ""}${fmt(trip.data.start_date, lang)} → ${fmt(trip.data.end_date, lang)}`}
            </p>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-32">
        {/* Presentation block: cover + title card. For "photo"/"map"
            covers this fills the FULL viewport (100svh) so on first paint
            ONLY the cover and the title card are visible — everything
            else sits one swipe below the fold, as requested. "auto"/
            "color" covers (flat backgrounds) keep their natural, shorter
            height. */}
        <section
          className="relative flex flex-col snap-start"
          style={{
            ...(hasReservedSpace ? { minHeight: "100svh" } : {}),
            viewTransitionName: `card-${tripId}`,
          } as React.CSSProperties}
        >
        {/* Spacer reserving room for the fixed top bar above, so cover
            content never sits underneath it. */}
        <div aria-hidden style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px) + 2.5rem)" }} />

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

        {coverType === "map" && (
          <div className="relative z-0 my-3 flex-1 min-h-[30vh] overflow-hidden rounded-2xl">
            <TripMap
              cities={cities}
              countries={countries}
              className="absolute inset-0 h-full w-full"
              compact
            />
          </div>
        )}

        {/* Photo spacer: pointer-events-none so touches fall through to
            the fixed photo beneath (z-[2]), allowing free pan/zoom
            without needing to enable repositioning mode first. */}
        {coverType === "photo" && <div className="flex-1 pointer-events-none" aria-hidden />}

        {/* Swipe-up hint — bigger tappable target, also scrolls the
            content into view when tapped/clicked, not just decorative. */}
        {hasReservedSpace && (
          <button
            type="button"
            aria-label={t("scroll_hint")}
            onClick={() => {
              document
                .querySelector<HTMLElement>("[data-trip-scroller]")
                ?.scrollBy({ top: window.innerHeight * 0.7, behavior: "smooth" });
            }}
            className="mx-auto -mb-1 flex h-9 w-14 items-center justify-center rounded-full bg-background/55 text-foreground/90 backdrop-blur transition hover:bg-background/70"
          >
            <ChevronUp className="h-5 w-5 animate-bounce" />
          </button>
        )}

        <header
          className={cn(
            "flex flex-col items-center gap-3 rounded-3xl border border-border/50 bg-background/70 p-4 text-center shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:text-left",
            hasReservedSpace ? "mt-3 mb-6" : "mt-3 mb-10",
          )}
        >
        <div className="flex min-w-0 flex-col items-center gap-3 sm:flex-row sm:items-center">
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
            {/* No truncate / no single-line clamp here: long titles now
                wrap onto multiple lines on narrow (mobile) viewports
                instead of being cut off mid-word. */}
            <h1 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              {trip.data.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {[citiesLabel, countriesLabel].filter(Boolean).join(", ")}
            </p>
            {!isWishlist && (
              <p className="text-xs text-muted-foreground/80">
                {fmt(trip.data.start_date, lang)} → {fmt(trip.data.end_date, lang)}
              </p>
            )}
          </div>
        </div>
        {profile.data && (
          // Centered as its own block on mobile (not pinned to the right
          // edge next to action icons, which have moved into the
          // hamburger menu), still right-aligned on wider screens.
          <div className="flex flex-col items-center gap-1 sm:items-end">
            {tripCurrencies
              .filter((c) => c !== profile.data!.home_currency)
              .map((cur) => (
                <FxAverageWidget
                  key={cur}
                  from={profile.data!.home_currency}
                  to={cur}
                  start={isWishlist ? todayISO : trip.data.start_date}
                  end={isWishlist ? todayISO : trip.data.end_date}
                  fallback={trip.data.fx_rate_fallback}
                />
              ))
            }
            <TimezoneBadge
              home={(profile.data as { home_country?: string | null }).home_country ?? null}
              destinations={countries}
              startDate={isWishlist ? undefined : trip.data.start_date}
            />
          </div>
        )}
      </header>
        <div ref={titleSentinelRef} aria-hidden className="h-px w-full" />
        </section>

      <section className="flex flex-col pt-2">
      <nav
        aria-label={t("trip_sections")}
        className="mx-auto flex w-fit items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 text-xs shadow-soft backdrop-blur"
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
      </section>
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
    countries: string[];
    destination: string | null;
    trip_type: "vacation" | "business" | "daytrip";
    cover_emoji: string;
    start_date: string;
    end_date: string;
  }) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const [title, setTitle] = useState(initialTitle);
  const [cities, setCities] = useState(initialCities);
  const [countries, setCountries] = useState(initialCountries);
  const [type, setType] = useState(initialType);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setCities(initialCities);
      setCountries(initialCountries);
      setType(initialType);
      setEmoji(initialEmoji || "✈️");
      setStartDate(initialStartDate);
      setEndDate(initialEndDate);
      setQuery("");
      setCountryQuery("");
    }
  }, [open, initialTitle, initialCities, initialCountries, initialType, initialEmoji, initialStartDate, initialEndDate]);

  const allCountriesLocalized = localizedCountries(lang);
  const cq = countryQuery.trim().toLowerCase();
  const filteredCountries = cq
    ? allCountriesLocalized.filter((c) => c.name.toLowerCase().includes(cq))
    : allCountriesLocalized;

  function toggleCountry(iso: string) {
    setCountries((prev) => {
      const exists = prev.includes(iso);
      const next = exists ? prev.filter((c) => c !== iso) : [...prev, iso];
      // Dropping a country also drops any selected cities that belonged
      // only to it, so the city list never references a removed country.
      if (exists) {
        setCities((cs) => cs.filter((c) => c.country !== iso));
      }
      return next;
    });
  }

  // Cities available for selection, derived from the currently selected
  // countries (not the trip's original countries) so adding a new country
  // immediately surfaces its cities here.
  const available = countries.flatMap((iso) => citiesOfCountry(iso));
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
    const iso = countries[0];
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
            <Label>{t("icon_label")}</Label>
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

          {/* Country multi-select. Previously the trip's countries were
              fixed at creation time and could never be changed here; now
              they're a first-class editable field, and the cities picker
              below recomputes its options from this state. */}
          <div className="space-y-1.5">
            <Label>{t("country")}</Label>
            <Popover open={countryPickerOpen} onOpenChange={setCountryPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {countries.length === 0 ? t("country") : `${countries.length} ${t("countries").toLowerCase()}`}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="..." value={countryQuery} onValueChange={setCountryQuery} />
                  <CommandList className="max-h-72">
                    {filteredCountries.length === 0 && <CommandEmpty>—</CommandEmpty>}
                    {filteredCountries.length > 0 && (
                      <CommandGroup>
                        {filteredCountries.slice(0, 250).map((c) => {
                          const sel = countries.includes(c.iso);
                          return (
                            <CommandItem
                              key={c.iso}
                              value={c.iso}
                              onSelect={() => toggleCountry(c.iso)}
                            >
                              <Check className={cn("mr-2 h-4 w-4", sel ? "opacity-100" : "opacity-0")} />
                              <span className="mr-2">{flagOf(c.iso)}</span>
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
            {countries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-2">
                {countries.map((iso) => (
                  <Badge key={iso} variant="secondary" className="gap-1 rounded-full pl-2 pr-1">
                    <span>{flagOf(iso)}</span>
                    <span>{countryNameLocalized(iso, lang)}</span>
                    <button
                      type="button"
                      onClick={() => toggleCountry(iso)}
                      className="ml-0.5 grid h-4 w-4 place-items-center rounded-full hover:bg-foreground/10"
                      aria-label={`Remove ${iso}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("destination")}</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate text-muted-foreground">
                    {cities.length === 0 ? t("search_add_city") : (cities.length === 1 ? t("cities_selected_one") : t("cities_selected_other", { count: cities.length }))}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder={t("type_to_search")} value={query} onValueChange={setQuery} />
                  <CommandList className="max-h-72">
                    {filtered.length === 0 && !canAddCustom && <CommandEmpty>{t("no_cities")}</CommandEmpty>}
                    {canAddCustom && (
                      <CommandGroup heading={t("add")}>
                        <CommandItem onSelect={addCustom}>
                          <Plus className="mr-2 h-4 w-4" />
                          <span>{t("add_city", { name: query.trim() })}</span>
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
                              {countries.length > 1 && <span className="mr-2">{flagOf(c.country)}</span>}
                              <span>{cityNameLocalized(c.name, lang)}</span>
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
                    <span>{cityNameLocalized(c.name, lang)}</span>
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
                countries,
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

function CoverMenuRow({
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
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
        active
          ? "bg-primary text-primary-foreground"
          : "text-foreground/80 hover:bg-foreground/10",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
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

function ColorCoverMenuRow({
  active,
  current,
  onPick,
}: {
  active: boolean;
  current?: string | null;
  onPick: (bg: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
            active
              ? "bg-primary text-primary-foreground"
              : "text-foreground/80 hover:bg-foreground/10",
          )}
        >
          <Palette className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{t("color")}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("trip_background")}
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
          {t("custom_bg")}
          <input
            type="text"
            defaultValue={current ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onPick(v);
            }}
            placeholder={t("custom_bg_placeholder")}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
        </label>
      </PopoverContent>
    </Popover>
  );
}

function fmt(d: string, lang?: string) {
  return new Date(d).toLocaleDateString(lang, { day: "2-digit", month: "short", year: "numeric" });
}

// TZ_ABBR: IANA timezone → [stdAbbr, dstAbbr | null]
const TZ_ABBR: Record<string, [string, string | null]> = {
  // Africa
  "Africa/Abidjan":["GMT",null],"Africa/Accra":["GMT",null],"Africa/Addis_Ababa":["EAT",null],
  "Africa/Algiers":["CET",null],"Africa/Asmara":["EAT",null],"Africa/Bamako":["GMT",null],
  "Africa/Bangui":["WAT",null],"Africa/Banjul":["GMT",null],"Africa/Bissau":["GMT",null],
  "Africa/Blantyre":["CAT",null],"Africa/Brazzaville":["WAT",null],"Africa/Bujumbura":["CAT",null],
  "Africa/Cairo":["EET",null],"Africa/Casablanca":["WET","+01"],"Africa/Conakry":["GMT",null],
  "Africa/Dakar":["GMT",null],"Africa/Dar_es_Salaam":["EAT",null],"Africa/Djibouti":["EAT",null],
  "Africa/Douala":["WAT",null],"Africa/Freetown":["GMT",null],"Africa/Gaborone":["CAT",null],
  "Africa/Harare":["CAT",null],"Africa/Johannesburg":["SAST",null],"Africa/Juba":["EAT",null],
  "Africa/Kampala":["EAT",null],"Africa/Khartoum":["EAT",null],"Africa/Kigali":["CAT",null],
  "Africa/Kinshasa":["WAT",null],"Africa/Lagos":["WAT",null],"Africa/Libreville":["WAT",null],
  "Africa/Lome":["GMT",null],"Africa/Luanda":["WAT",null],"Africa/Lubumbashi":["CAT",null],
  "Africa/Lusaka":["CAT",null],"Africa/Malabo":["WAT",null],"Africa/Maputo":["CAT",null],
  "Africa/Maseru":["SAST",null],"Africa/Mbabane":["SAST",null],"Africa/Mogadishu":["EAT",null],
  "Africa/Monrovia":["GMT",null],"Africa/Nairobi":["EAT",null],"Africa/Ndjamena":["WAT",null],
  "Africa/Niamey":["WAT",null],"Africa/Nouakchott":["GMT",null],"Africa/Ouagadougou":["GMT",null],
  "Africa/Porto-Novo":["WAT",null],"Africa/Sao_Tome":["GMT",null],"Africa/Tripoli":["EET",null],
  "Africa/Tunis":["CET",null],"Africa/Windhoek":["WAT","CAT"],
  // America
  "America/Antigua":["AST",null],"America/Argentina/Buenos_Aires":["ART",null],
  "America/Asuncion":["PYT","PYST"],"America/Barbados":["AST",null],"America/Belize":["CST",null],
  "America/Bogota":["COT",null],"America/Caracas":["VET",null],"America/Costa_Rica":["CST",null],
  "America/Dominica":["AST",null],"America/El_Salvador":["CST",null],
  "America/Godthab":["WGT","WGST"],"America/Grenada":["AST",null],"America/Guatemala":["CST",null],
  "America/Guayaquil":["ECT",null],"America/Guyana":["GYT",null],"America/Havana":["CST","CDT"],
  "America/Jamaica":["EST",null],"America/La_Paz":["BOT",null],"America/Lima":["PET",null],
  "America/Managua":["CST",null],"America/Martinique":["AST",null],
  "America/Mexico_City":["CST","CDT"],"America/Montevideo":["UYT",null],
  "America/Nassau":["EST","EDT"],"America/New_York":["EST","EDT"],"America/Panama":["EST",null],
  "America/Paramaribo":["SRT",null],"America/Port-au-Prince":["EST","EDT"],
  "America/Port_of_Spain":["AST",null],"America/Puerto_Rico":["AST",null],
  "America/Santo_Domingo":["AST",null],"America/Sao_Paulo":["BRT","BRST"],
  "America/St_Kitts":["AST",null],"America/St_Lucia":["AST",null],"America/St_Vincent":["AST",null],
  "America/Tegucigalpa":["CST",null],"America/Toronto":["EST","EDT"],
  // Asia
  "Asia/Almaty":["ALMT",null],"Asia/Amman":["EET","EEST"],"Asia/Ashgabat":["TMT",null],
  "Asia/Baghdad":["AST",null],"Asia/Bahrain":["AST",null],"Asia/Baku":["AZT","AZST"],
  "Asia/Bangkok":["ICT",null],"Asia/Beirut":["EET","EEST"],"Asia/Bishkek":["KGT",null],
  "Asia/Brunei":["BNT",null],"Asia/Colombo":["IST",null],"Asia/Damascus":["EET","EEST"],
  "Asia/Dhaka":["BST",null],"Asia/Dili":["TLT",null],"Asia/Dubai":["GST",null],
  "Asia/Dushanbe":["TJT",null],"Asia/Gaza":["EET","EEST"],"Asia/Ho_Chi_Minh":["ICT",null],
  "Asia/Hong_Kong":["HKT",null],"Asia/Jakarta":["WIB",null],"Asia/Jerusalem":["IST","IDT"],
  "Asia/Kabul":["AFT",null],"Asia/Karachi":["PKT",null],"Asia/Kathmandu":["NPT",null],
  "Asia/Kolkata":["IST",null],"Asia/Kuala_Lumpur":["MYT",null],"Asia/Kuwait":["AST",null],
  "Asia/Macau":["CST",null],"Asia/Manila":["PHT",null],"Asia/Muscat":["GST",null],
  "Asia/Nicosia":["EET","EEST"],"Asia/Phnom_Penh":["ICT",null],"Asia/Pyongyang":["KST",null],
  "Asia/Qatar":["AST",null],"Asia/Rangoon":["MMT",null],"Asia/Riyadh":["AST",null],
  "Asia/Seoul":["KST",null],"Asia/Shanghai":["CST",null],"Asia/Singapore":["SGT",null],
  "Asia/Taipei":["CST",null],"Asia/Tashkent":["UZT",null],"Asia/Tbilisi":["GET",null],
  "Asia/Tehran":["IRST","IRDT"],"Asia/Thimphu":["BTT",null],"Asia/Tokyo":["JST",null],
  "Asia/Ulaanbaatar":["ULAT",null],"Asia/Vientiane":["ICT",null],"Asia/Yerevan":["AMT","AMST"],
  // Atlantic
  "Atlantic/Cape_Verde":["CVT",null],"Atlantic/Reykjavik":["GMT",null],
  // Australia
  "Australia/Adelaide":["ACST","ACDT"],"Australia/Brisbane":["AEST",null],
  "Australia/Darwin":["ACST",null],"Australia/Hobart":["AEST","AEDT"],
  "Australia/Perth":["AWST",null],"Australia/Sydney":["AEST","AEDT"],
  // Europe
  "Europe/Amsterdam":["CET","CEST"],"Europe/Andorra":["CET","CEST"],
  "Europe/Athens":["EET","EEST"],"Europe/Belgrade":["CET","CEST"],
  "Europe/Berlin":["CET","CEST"],"Europe/Bratislava":["CET","CEST"],
  "Europe/Brussels":["CET","CEST"],"Europe/Bucharest":["EET","EEST"],
  "Europe/Budapest":["CET","CEST"],"Europe/Chisinau":["EET","EEST"],
  "Europe/Copenhagen":["CET","CEST"],"Europe/Dublin":["GMT","IST"],
  "Europe/Gibraltar":["CET","CEST"],"Europe/Helsinki":["EET","EEST"],
  "Europe/Istanbul":["TRT",null],"Europe/Kiev":["EET","EEST"],"Europe/Kyiv":["EET","EEST"],
  "Europe/Lisbon":["WET","WEST"],"Europe/Ljubljana":["CET","CEST"],
  "Europe/London":["GMT","BST"],"Europe/Luxembourg":["CET","CEST"],
  "Europe/Madrid":["CET","CEST"],"Europe/Malta":["CET","CEST"],"Europe/Minsk":["FET",null],
  "Europe/Monaco":["CET","CEST"],"Europe/Moscow":["MSK",null],"Europe/Oslo":["CET","CEST"],
  "Europe/Paris":["CET","CEST"],"Europe/Podgorica":["CET","CEST"],
  "Europe/Prague":["CET","CEST"],"Europe/Riga":["EET","EEST"],"Europe/Rome":["CET","CEST"],
  "Europe/San_Marino":["CET","CEST"],"Europe/Sarajevo":["CET","CEST"],
  "Europe/Skopje":["CET","CEST"],"Europe/Sofia":["EET","EEST"],"Europe/Stockholm":["CET","CEST"],
  "Europe/Tallinn":["EET","EEST"],"Europe/Tirane":["CET","CEST"],"Europe/Vaduz":["CET","CEST"],
  "Europe/Vatican":["CET","CEST"],"Europe/Vienna":["CET","CEST"],"Europe/Vilnius":["EET","EEST"],
  "Europe/Warsaw":["CET","CEST"],"Europe/Zagreb":["CET","CEST"],"Europe/Zurich":["CET","CEST"],
  // Indian
  "Indian/Antananarivo":["EAT",null],"Indian/Comoro":["EAT",null],"Indian/Mahe":["SCT",null],
  "Indian/Maldives":["MVT",null],"Indian/Mauritius":["MUT",null],"Indian/Reunion":["RET",null],
  // Pacific
  "Pacific/Apia":["WST",null],"Pacific/Auckland":["NZST","NZDT"],"Pacific/Efate":["VUT",null],
  "Pacific/Fiji":["FJT","FJST"],"Pacific/Funafuti":["TVT",null],
  "Pacific/Guadalcanal":["SBT",null],"Pacific/Majuro":["MHT",null],
  "Pacific/Palau":["PWT",null],"Pacific/Pohnpei":["PONT",null],"Pacific/Port_Moresby":["PGT",null],
  "Pacific/Tongatapu":["TOT",null],
};

function tzOffset(tz: string, d: Date): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, timeZoneName: "shortOffset",
    }).formatToParts(d);
    const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    const m = name.match(/GMT([+-]?)(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return name === "GMT" ? 0 : null;
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 60 : 0));
  } catch { return null; }
}

function tzIsDst(tz: string, d: Date): boolean {
  const jan = tzOffset(tz, new Date(d.getFullYear(), 0, 15));
  const jul = tzOffset(tz, new Date(d.getFullYear(), 6, 15));
  if (jan == null || jul == null || jan === jul) return false;
  const curr = tzOffset(tz, d);
  if (curr == null) return false;
  return curr > Math.min(jan, jul);
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
  const zoneOf = (iso: string) => primaryTimezoneOfCountry(iso);
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
      // 1. Native short abbreviation (Chrome/Safari).
      const shortParts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, timeZoneName: "short",
      }).formatToParts(d);
      const short = shortParts.find((p) => p.type === "timeZoneName")?.value ?? "";
      if (short && !/^(GMT|UTC)/i.test(short)) return short;
      // 2. Hardcoded table — reliable on Node.js SSR.
      const entry = TZ_ABBR[tz];
      if (entry) {
        const [std, dst] = entry;
        if (!dst) return std;
        return tzIsDst(tz, d) ? dst : std;
      }
      // 3. Long-name acronym fallback.
      const longParts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, timeZoneName: "long",
      }).formatToParts(d);
      const long = longParts.find((p) => p.type === "timeZoneName")?.value ?? "";
      if (!long) return null;
      const filtered = long.replace(/\bStandard\b\s*/i, "");
      const acronym = filtered.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("");
      return acronym.length >= 2 ? acronym : null;
    } catch { return null; }
  };
  const h = offsetOn(homeZone, when);
  const d = offsetOn(destZone, when);
  if (h == null || d == null) return null;
  if (Math.abs(d - h) < 0.01) return null;
  const offFmt = (n: number) => {
    const s = n >= 0 ? "+" : "−";
    const abs = Math.abs(n);
    const hh = Math.floor(abs);
    const mm = Math.round((abs - hh) * 60);
    return mm ? `${s}${hh}:${String(mm).padStart(2, "0")}` : `${s}${hh}`;
  };
  const label = (tz: string, off: number) => {
    const abbr = abbrOn(tz, when);
    const off2 = offFmt(off);
    if (!abbr) return `UTC${off2}`;
    return `${abbr}${off2}`;
  };
  const diff = Math.round((d - h) * 10) / 10;
  const diffLabel = `${diff > 0 ? "+" : "−"}${Math.abs(diff)}h`;
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground shadow-soft backdrop-blur">
      <Clock className="h-3 w-3" />
      <span className="tabular-nums">
        {label(homeZone, h)} → {label(destZone, d)}
      </span>
      <span
        className={`inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
          diff > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {diffLabel}
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
  zoom,
  onZoomChange,
  onCommit,
  repositioning,
  onDone,
  showControls = false,
}: {
  tripId: string;
  coverUrl: string | null;
  signedPhoto: string | null;
  setSignedPhoto: (v: string | null) => void;
  focal: string;
  onFocalChange: (v: string) => void;
  zoom: number;
  onZoomChange: (v: number) => void;
  onCommit: (focal: string, zoom: number) => void;
  repositioning: boolean;
  onDone: () => void;
  /** When true (photo is visible / not scrolled), enable pan/zoom and show controls. */
  showControls?: boolean;
}) {
  const { t } = useTranslation();
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
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.5;
  const ZOOM_STEP = 0.15;

  // Tracks active pointers for pinch-to-zoom: when a second finger touches
  // down, we switch from single-finger pan to two-finger pinch, using the
  // change in distance between the two touch points to scale the photo.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  // The photo is interactive when it's visible (showControls) OR when the
  // user has explicitly activated repositioning mode from the menu.
  const isActive = showControls || repositioning;

  function parseFocal(v: string): { x: number; y: number } {
    const m = v.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
    return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 50, y: 50 };
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!src) return;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      // Second finger landed — start a pinch gesture, abandoning any
      // single-finger pan in progress.
      startRef.current = null;
      const pts = [...pointersRef.current.values()];
      pinchRef.current = { dist: dist(pts[0], pts[1]), zoom };
      setDragging(false);
    } else {
      const f = parseFocal(focal);
      startRef.current = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
      setDragging(true);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const d = dist(pts[0], pts[1]);
      const ratio = d / (pinchRef.current.dist || 1);
      const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(pinchRef.current.zoom * ratio * 100) / 100));
      onZoomChange(next);
      return;
    }
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
    (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (!startRef.current && pointersRef.current.size === 0) {
      setDragging(false);
      onCommit(focal, zoom);
      return;
    }
    if (startRef.current) {
      startRef.current = null;
      setDragging(false);
      onCommit(focal, zoom);
    }
  }

  function adjustZoom(delta: number) {
    const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((zoom + delta) * 100) / 100));
    onZoomChange(next);
    onCommit(focal, next);
  }

  if (!src) {
    return <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-background" />;
  }

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 touch-none select-none overflow-hidden",
          // In repositioning mode: raise above everything (z-50) for fine-tuning.
          // When photo is visible (showControls): z-[2] so touches can reach it
          // through the pointer-events-none spacer in main.
          // Otherwise: hidden from pointer events entirely.
          repositioning ? "z-50" : isActive ? "z-[2]" : "z-0 pointer-events-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        onPointerDown={isActive ? onPointerDown : undefined}
        onPointerMove={isActive ? onPointerMove : undefined}
        onPointerUp={isActive ? onPointerUp : undefined}
        onPointerCancel={isActive ? onPointerUp : undefined}
        title={t("drag_photo_hint")}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover transition-transform duration-150"
          style={{
            objectPosition: focal,
            transform: zoom !== 1 ? `scale(${zoom})` : undefined,
            // Makes the zoom pivot on the focal point instead of the
            // viewport center, so pan + zoom stay visually consistent.
            transformOrigin: focal,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>

      {/* Zoom/pan controls — only shown in explicit repositioning mode
          (activated from the hamburger menu). The photo remains pannable
          when visible, but the toolbar stays hidden until the user asks. */}
      {repositioning && (
        <div
          className="fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-[12px] text-white backdrop-blur"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Move className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("drag_photo_hint")}</span>
          <span className="mx-1 h-4 w-px bg-white/25" />
          <button
            type="button"
            onClick={() => adjustZoom(-ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label={t("zoom_out")}
            className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-sm font-semibold hover:bg-white/25 disabled:opacity-30"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label={t("zoom_in")}
            className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-sm font-semibold hover:bg-white/25 disabled:opacity-30"
          >
            +
          </button>
          {repositioning && (
            <button
              type="button"
              onClick={onDone}
              className="ml-1 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-white/25"
            >
              {t("done")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

