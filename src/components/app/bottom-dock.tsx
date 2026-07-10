import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Compass, User, Plus, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { countUnreadNotifications } from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

type NavItem = {
  to: "/trips" | "/profile";
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  match: (path: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  // Trips nav: active only when NOT on the new-trip/wishlist creation page
  { to: "/trips", icon: Compass, labelKey: "trips", match: (p) => p.startsWith("/trips") && !p.startsWith("/trips/new") },
  { to: "/profile", icon: User, labelKey: "profile", match: (p) => p.startsWith("/profile") },
];

export function BottomDock() {
  const { t } = useTranslation();
  const loc = useLocation();
  const nav = useNavigate();

  const countFn = useServerFn(countUnreadNotifications);
  const { data: countData } = useQuery({
    queryKey: ["notifications-count"],
    queryFn: () => countFn(),
    staleTime: 5 * 60 * 1000, // refresh every 5 min in background
    refetchOnWindowFocus: true,
  });
  const unreadCount = countData?.count ?? 0;

  const isNewTripPage = loc.pathname === "/trips/new";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1 sm:gap-2 rounded-full border border-border/60 bg-card/85 px-2 sm:px-2.5 py-1.5 sm:py-2 shadow-soft backdrop-blur-xl"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* Compass nav */}
      {(() => {
        const { to, icon: Icon, labelKey, match } = NAV_ITEMS[0];
        const active = match(loc.pathname);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group flex items-center gap-1.5 rounded-full px-3.5 py-2 sm:px-4 sm:py-3 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </Link>
        );
      })()}

      {/* Nuovo — apre la pagina con toggle viaggio/wishlist interno */}
      <button
        type="button"
        onClick={() => nav({ to: "/trips/new" })}
        aria-label="Nuovo viaggio o wishlist"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-2 sm:px-4 sm:py-3 text-xs font-medium transition",
          isNewTripPage
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
        <span className="hidden sm:inline">Nuovo</span>
      </button>

      {/* Profile nav */}
      {(() => {
        const { to, icon: Icon, labelKey, match } = NAV_ITEMS[1];
        const active = match(loc.pathname);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "group flex items-center gap-1.5 rounded-full px-3.5 py-2 sm:px-4 sm:py-3 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </Link>
        );
      })()}

      {/* Notifications nav */}
      <Link
        to="/notifications"
        className={cn(
          "group flex items-center gap-1.5 rounded-full px-3.5 py-2 sm:px-4 sm:py-3 text-xs font-medium transition",
          loc.pathname.startsWith("/notifications")
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="relative">
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        <span className="hidden sm:inline">{t("notifications")}</span>
      </Link>
    </nav>
  );
}
