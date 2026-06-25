import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getTrip, deleteTrip } from "@/lib/trips.functions";
import { getProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { FxWidget } from "@/components/app/fx-widget";
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

  const tripFn = useServerFn(getTrip);
  const profileFn = useServerFn(getProfile);
  const trip = useQuery({ queryKey: ["trip", tripId], queryFn: () => tripFn({ data: { id: tripId } }) });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const delFn = useServerFn(deleteTrip);

  if (trip.isLoading || !trip.data) {
    return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted-foreground">{t("loading")}</main>;
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
            <FxWidget
              from={profile.data.home_currency}
              to={trip.data.local_currency}
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

function fmt(d: string) {
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}