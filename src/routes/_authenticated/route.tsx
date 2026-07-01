import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
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
  // independently scrolling container and has its own back button + compact header.
  const isTripDetail = /^\/trips\/[^/]+/.test(loc.pathname);

  return (
    <div className="min-h-screen bg-background">
      <div className={isTripDetail ? "" : "pb-24"}>
        <Outlet />
      </div>
      <BottomDock />
    </div>
  );
}
