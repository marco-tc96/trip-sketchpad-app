import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2, Image as ImageIcon, Map as MapIcon, Sparkles, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { getTrip, deleteTrip, updateTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { FxAverageWidget } from "@/components/app/fx-avg-widget";
import { CityCover } from "@/components/app/city-cover";
import { TripMap } from "@/components/app/trip-map";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/trips/$tripId")({
  component: TripLayout,
});

function TripLayout() {
  const { tripId } = Route.useParams();
  const { t } = useTranslation();
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

  if (trip.isLoading || !trip.data) {
    return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">{t("loading")}</main>;
  }

  const tripRow = trip.data as typeof trip.data & {
    cover_type?: "auto" | "map" | "photo";
    cover_url?: string | null;
    countries?: string[];
    cities?: Array<{ name: string; country: string; lat?: number; lng?: number }>;
  };
  const coverType = tripRow.cover_type ?? "auto";
  const cities = Array.isArray(tripRow.cities) ? tripRow.cities : [];
  const countries = Array.isArray(tripRow.countries) ? tripRow.countries : [];

  async function setCoverType(next: "auto" | "map" | "photo") {
    if (next === coverType) return;
    try {
      await updateFn({ data: { id: tripId, patch: { cover_type: next } } });
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

  const tabs: { to: "/trips/$tripId" | "/trips/$tripId/timeline" | "/trips/$tripId/expenses"; label: string; exact?: boolean }[] = [
    { to: "/trips/$tripId", label: t("overview"), exact: true },
    { to: "/trips/$tripId/timeline", label: t("timeline") },
    { to: "/trips/$tripId/expenses", label: t("expenses") },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{t("back")}
      </Link>

      {/* Cover */}
      <section className="relative mt-4 h-48 overflow-hidden rounded-3xl border border-border shadow-soft sm:h-64">
        <CoverContent
          tripId={tripId}
          coverType={coverType}
          coverUrl={tripRow.cover_url ?? null}
          cities={cities}
          fallbackQuery={
            cities[0]?.name || tripRow.destination || countries[0] || tripRow.country || tripRow.title
          }
          signedPhoto={signedPhoto}
          setSignedPhoto={setSignedPhoto}
        />
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full border border-white/20 bg-black/40 p-1 text-xs backdrop-blur">
          <CoverPill active={coverType === "auto"} onClick={() => setCoverType("auto")} icon={Sparkles} label={t("cover_auto")} />
          <CoverPill active={coverType === "map"} onClick={() => setCoverType("map")} icon={MapIcon} label={t("cover_map")} />
          <CoverPill active={coverType === "photo"} onClick={() => fileRef.current?.click()} icon={ImageIcon} label={t("cover_photo")} />
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
          <div className="absolute inset-0 z-10 grid place-items-center bg-black/40 text-xs text-white backdrop-blur">
            <span className="inline-flex items-center gap-2"><Upload className="h-3.5 w-3.5" /> {t("upload_cover")}…</span>
          </div>
        )}
      </section>

      <header className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-3xl">
            {trip.data.cover_emoji ?? "✈️"}
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              {trip.data.title}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {[trip.data.destination, trip.data.country].filter(Boolean).join(", ")}
              {" · "}{fmt(trip.data.start_date)} → {fmt(trip.data.end_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {profile.data && (
            <FxAverageWidget
              from={profile.data.home_currency}
              to={trip.data.local_currency}
              start={trip.data.start_date}
              end={trip.data.end_date}
              fallback={trip.data.fx_rate_fallback}
            />
          )}
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

      <nav className="mt-6 flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const active = tab.exact
            ? loc.pathname === `/trips/${tripId}`
            : loc.pathname.startsWith(`/trips/${tripId}${tab.to.replace("/trips/$tripId", "")}`);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              params={{ tripId }}
              className={`relative px-4 py-2.5 text-sm font-medium transition ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </Link>
          );
        })}
      </nav>

      <div className="pt-6"><Outlet /></div>
    </main>
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
          ? "bg-white text-foreground"
          : "text-white/85 hover:bg-white/15",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

function CoverContent({
  tripId,
  coverType,
  coverUrl,
  cities,
  fallbackQuery,
  signedPhoto,
  setSignedPhoto,
}: {
  tripId: string;
  coverType: "auto" | "map" | "photo";
  coverUrl: string | null;
  cities: Array<{ name: string; country: string; lat?: number; lng?: number }>;
  fallbackQuery: string;
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

  if (coverType === "map") {
    return (
      <>
        <TripMap cities={cities} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </>
    );
  }

  if (coverType === "photo") {
    const src = signedPhoto || (coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null);
    return <CityCover query={fallbackQuery} src={src} />;
  }

  // auto
  const src = coverUrl && /^https?:\/\//i.test(coverUrl) ? coverUrl : null;
  return <CityCover query={fallbackQuery} src={src} />;
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}