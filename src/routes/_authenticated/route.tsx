import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app/header";
import { BottomDock } from "@/components/app/bottom-dock";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

// The single-trip page (/trips/:tripId/...) owns its own scroll container
// (so the snap-scroll cover/timeline experience works) and its own compact
// header that scrolls away with the page, so it opts out of the global
// sticky AppHeader. /trips and /trips/new are NOT single-trip pages and
// keep the normal app chrome.
function isSingleTripPath(pathname: string): boolean {
  return /^\/trips\/(?!new(?:\/|$))[^/]+/.test(pathname);
}

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth", replace: true });
  }, [user, loading, nav]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        …
      </div>
    );
  }

  const isTripPage = isSingleTripPath(loc.pathname);

  if (isTripPage) {
    // The trip page fills the screen and manages its own scroll, header and
    // bottom spacing for the dock — it just opts out of the sticky app
    // header, since the trip page provides its own compact one that scrolls
    // away with the page. The dock stays for primary navigation.
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
        <BottomDock />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="pb-24">
        <Outlet />
      </div>
      <BottomDock />
    </div>
  );
}