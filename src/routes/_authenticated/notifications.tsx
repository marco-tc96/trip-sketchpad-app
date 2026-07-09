import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Bell, Plane, Info, CheckCheck, Trash2 } from "lucide-react";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
} from "@/lib/notifications.functions";
import type { AppNotification } from "@/lib/notifications.functions";
import { allCountries, countryNameLocalized } from "@/lib/country-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

// ── Legacy normalization ──────────────────────────────────────────────────────

/**
 * Multi-language country name → ISO map.
 * Built once at module load from allCountries() for all supported languages.
 * Used to normalise legacy Italian (and English) hardcoded notification titles.
 */
const COUNTRY_NAME_TO_ISO = (() => {
  const map: Record<string, string> = {};
  try {
    for (const c of allCountries()) {
      for (const lng of ["it", "en", "fr", "de", "es", "pt"]) {
        try {
          const name = countryNameLocalized(c.iso, lng).toLowerCase();
          if (name) map[name] = c.iso;
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore if called before ready */ }
  return map;
})();

const LEGACY_EXACT: Record<string, string> = {
  // Italian
  "Un nuovo viaggio sta per iniziare": "notif_trip_start",
  "Manca un'ora alla partenza": "notif_departure",
  "Benvenuto!": "notif_arrival_generic",
  // English (in case some were stored in English)
  "A new trip is about to begin": "notif_trip_start",
  "Departure in 1 hour": "notif_departure",
  "Welcome!": "notif_arrival_generic",
};

type NormalizedNotif = {
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
};

function normalizeNotif(n: AppNotification): NormalizedNotif {
  // Already using i18n keys → pass through as-is
  if (n.title.startsWith("notif_")) {
    return {
      title: n.title,
      body: n.body,
      meta: (n.meta ?? {}) as Record<string, unknown>,
    };
  }

  // Exact legacy match
  if (LEGACY_EXACT[n.title]) {
    return { title: LEGACY_EXACT[n.title], body: null, meta: {} };
  }

  // Arrival patterns — Italian: "Benvenuto in X" / "Bentornato in X"
  //                  — English: "Welcome to X" / "Welcome back to X"
  const isNewIt  = n.title.match(/^Benvenuto (?:a |in |nel(?:l[aeo'])? )?(.+)$/i);
  const isRetIt  = n.title.match(/^Bentornato (?:a |in |nel(?:l[aeo'])? )?(.+)$/i);
  const isNewEn  = n.title.match(/^Welcome to (.+)$/i);
  const isRetEn  = n.title.match(/^Welcome back to (.+)$/i);

  const arrMatch = isNewIt ?? isRetIt ?? isNewEn ?? isRetEn;
  const isNew    = !!(isNewIt ?? isNewEn);

  if (arrMatch) {
    const countryName = arrMatch[1].trim().toLowerCase();
    const iso = COUNTRY_NAME_TO_ISO[countryName] ?? null;
    const numMatch = n.body?.match(/\d+/);
    const visitN = numMatch ? parseInt(numMatch[0], 10) : 1;
    return {
      title: isNew ? "notif_arrival_new" : "notif_arrival_return",
      body:  isNew ? "notif_arrival_new_body" : "notif_arrival_return_body",
      meta:  iso ? { country_iso: iso, n: visitN } : { n: visitN },
    };
  }

  // Unknown legacy — show raw text, never translate
  return {
    title: n.title,
    body: n.body,
    meta: (n.meta ?? {}) as Record<string, unknown>,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t("time_just_now");
  if (mins < 60) return t("time_min_ago", { n: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time_hour_ago", { n: hrs });
  const days = Math.floor(hrs / 24);
  return t("time_day_ago", { n: days });
}

function NotifIcon({ type }: { type: AppNotification["type"] }) {
  if (type === "trip_upcoming" || type === "trip_ongoing" || type === "trip_ended") {
    return <Plane className="h-4 w-4" />;
  }
  return <Info className="h-4 w-4" />;
}

// ── Page ─────────────────────────────────────────────────────────────────────

function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "it";
  const qc = useQueryClient();
  const nav = useNavigate();

  const listFn      = useServerFn(listNotifications);
  const markAllFn   = useServerFn(markAllNotificationsRead);
  const markOneFn   = useServerFn(markNotificationRead);
  const deleteOneFn = useServerFn(deleteNotification);
  const deleteAllFn = useServerFn(deleteAllNotifications);

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn(),
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-count"] });
  };

  const markAllMutation = useMutation({
    mutationFn: () => markAllFn(),
    onSuccess: invalidate,
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markOneFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const deleteOneMutation = useMutation({
    mutationFn: (id: string) => deleteOneFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => deleteAllFn(),
    onSuccess: invalidate,
  });

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <h1 className="font-serif text-2xl font-bold">{t("notifications")}</h1>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>

        {notifications.length > 0 && (
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("mark_all_read")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteAllMutation.isPending}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("clear_all")}</span>
            </button>
          </div>
        )}
      </div>

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
          <Bell className="h-14 w-14 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">{t("no_notifications")}</p>
        </div>
      )}

      {/* List */}
      {!isLoading && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => {
            // Normalise legacy Italian/English raw text → i18n keys
            const norm = normalizeNotif(n);

            // Build display meta: translate country_iso → localised country name
            const displayMeta: Record<string, unknown> = { ...norm.meta };
            const isoVal = norm.meta.country_iso;
            if (isoVal && typeof isoVal === "string") {
              displayMeta.country = countryNameLocalized(isoVal, lang);
            }

            // Translate title / body if they are i18n keys
            const title = norm.title.startsWith("notif_")
              ? t(norm.title, displayMeta as Record<string, string>)
              : norm.title;

            const body = norm.body
              ? norm.body.startsWith("notif_")
                ? t(norm.body, displayMeta as Record<string, string>)
                : norm.body
              : null;

            const handleClick = () => {
              if (!n.read) markOneMutation.mutate(n.id);
              if (n.link) nav({ to: n.link as never });
            };

            return (
              <div
                key={n.id}
                className={cn(
                  "group relative flex w-full items-start gap-3 rounded-2xl border p-4 transition",
                  n.read
                    ? "border-border bg-card"
                    : "border-primary/20 bg-primary/5",
                )}
              >
                {/* Clickable main area */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleClick();
                  }}
                  className={cn(
                    "flex min-w-0 flex-1 items-start gap-3",
                    n.link ? "cursor-pointer" : "cursor-default",
                  )}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full",
                      n.read
                        ? "bg-muted text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <NotifIcon type={n.type} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-tight",
                        n.read ? "font-medium" : "font-semibold",
                      )}
                    >
                      {title}
                    </p>
                    {body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {timeAgo(n.created_at, t)}
                    </p>
                  </div>

                  {/* Unread dot */}
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                </div>

                {/* Delete button — always visible on mobile, hover-only on desktop */}
                <button
                  type="button"
                  aria-label={t("delete")}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteOneMutation.mutate(n.id);
                  }}
                  disabled={deleteOneMutation.isPending}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground/40 transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
