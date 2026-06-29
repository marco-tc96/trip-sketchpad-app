import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppHeader } from "@/components/app/header";
import { BottomDock } from "@/components/app/bottom-dock";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

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

  // The single-trip page (/trips/:tripId/...) manages its own full-screen,
  // independently scrolling container (data-trip-scroller) and already has
  // its own back button + compact pinned header that appears on scroll.
  // The global AppHeader is sticky to the page, not to that inner
  // scroller, so it would stay permanently visible on top of the trip
  // page's content instead of scrolling away with it. Hiding it here for
  // trip detail routes avoids that double-header overlap.
  const isTripDetail = /^\/trips\/[^/]+/.test(loc.pathname);

  return (
    <div className="min-h-screen bg-background">
      {!isTripDetail && <AppHeader />}
      <div className={isTripDetail ? "" : "pb-24"}>
        <Outlet />
      </div>
      <BottomDock />
    </div>
  );
}
