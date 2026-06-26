import { Link, useLocation } from "@tanstack/react-router";
import { Compass, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Item = {
  to: "/trips" | "/profile";
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  match: (path: string) => boolean;
};

const ITEMS: Item[] = [
  { to: "/trips", icon: Compass, labelKey: "trips", match: (p) => p.startsWith("/trips") },
  { to: "/profile", icon: User, labelKey: "profile", match: (p) => p.startsWith("/profile") },
];

export function BottomDock() {
  const { t } = useTranslation();
  const loc = useLocation();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-3 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] items-center gap-1 rounded-full border border-border/60 bg-card/85 px-2 py-1.5 shadow-soft backdrop-blur-xl"
    >
      {ITEMS.map(({ to, icon: Icon, labelKey, match }) => {
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
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}