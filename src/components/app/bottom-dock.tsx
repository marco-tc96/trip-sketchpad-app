import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Compass, User, Plus, Cloud } from "lucide-react";
import { useTranslation } from "react-i18next";
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

  const isNewTripPage = loc.pathname === "/trips/new";
  // loc.search is the parsed search object in TanStack Router
  const searchParams = loc.search as Record<string, unknown>;
  const isWishlistMode = isNewTripPage && Boolean(searchParams?.wishlist);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-border/60 bg-card/85 px-2 py-1.5 shadow-soft backdrop-blur-xl"
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
              "group flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </Link>
        );
      })()}

      {/* New trip action button */}
      <button
        type="button"
        onClick={() => nav({ to: "/trips/new" })}
        aria-label="Nuovo viaggio"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition",
          isNewTripPage && !isWishlistMode
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Nuovo</span>
      </button>

      {/* Wishlist action button */}
      <button
        type="button"
        onClick={() => nav({ to: "/trips/new", search: { wishlist: true } })}
        aria-label="Viaggio dei sogni"
        className={cn(
          "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition",
          isWishlistMode
            ? "bg-[oklch(0.55_0.13_255)] text-white shadow-soft"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Cloud className="h-4 w-4" />
        <span className="hidden sm:inline">Wishlist</span>
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
              "group flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition",
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t(labelKey)}</span>
          </Link>
        );
      })()}
    </nav>
  );
}
