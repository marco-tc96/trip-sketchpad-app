import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Bell, Plane, Info, CheckCheck } from "lucide-react";
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import type { AppNotification } from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return lang === "it" ? "adesso" : "just now";
  if (mins < 60) return lang === "it" ? `${mins}m fa` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === "it" ? `${hrs}h fa` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === "it" ? `${days}g fa` : `${days}d ago`;
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

  const listFn = useServerFn(listNotifications);
  const markAllFn = useServerFn(markAllNotificationsRead);
  const markOneFn = useServerFn(markNotificationRead);

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

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            disabled={markAllMutation.isPending}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {t("mark_all_read")}
          </button>
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
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.read) markOneMutation.mutate(n.id);
                if (n.link) nav({ to: n.link as never });
              }}
              className={cn(
                "group flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition",
                n.read
                  ? "border-border bg-card"
                  : "border-primary/20 bg-primary/5",
                n.link
                  ? "cursor-pointer hover:bg-muted"
                  : "cursor-default",
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
                  {n.title}
                </p>
                {n.body && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {n.body}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-muted-foreground/60">
                  {timeAgo(n.created_at, lang)}
                </p>
              </div>

              {/* Unread dot */}
              {!n.read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
