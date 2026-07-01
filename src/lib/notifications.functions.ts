import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type AppNotification = {
  id: string;
  type: "info" | "trip_upcoming" | "trip_ongoing" | "trip_ended";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
};

// ── Italian ordinals ──────────────────────────────────────────────────────────

/** Masculine: primo, secondo, terzo … (used for "paese") */
function ordinalItM(n: number): string {
  const map: Record<number, string> = {
    1: "primo", 2: "secondo", 3: "terzo", 4: "quarto", 5: "quinto",
    6: "sesto", 7: "settimo", 8: "ottavo", 9: "nono", 10: "decimo",
  };
  return map[n] ?? `${n}°`;
}

/** Feminine: prima, seconda, terza … (used for "volta") */
function ordinalItF(n: number): string {
  const map: Record<number, string> = {
    1: "prima", 2: "seconda", 3: "terza", 4: "quarta", 5: "quinta",
    6: "sesta", 7: "settima", 8: "ottava", 9: "nona", 10: "decima",
  };
  return map[n] ?? `${n}°`;
}

// ── Existing notification functions ──────────────────────────────────────────

/** Return up to 50 notifications for the current user, newest-first. */
export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, body, link, read, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as AppNotification[];
  });

/** Lightweight count query — used by the dock badge. */
export const countUnreadNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("read", false);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

/** Mark a single notification as read. */
export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
  });

/** Mark ALL unread notifications as read. */
export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("read", false);
    if (error) throw new Error(error.message);
  });

// ── Push subscription management ─────────────────────────────────────────────

/** Save (or refresh) a browser push subscription for the current user. */
export const subscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const {
      data: { user },
    } = await context.supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // push_subscriptions added by migration — cast until types are regenerated
    const { error } = await (context.supabase.from("push_subscriptions") as any).upsert(
      {
        user_id: user.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
      },
      { onConflict: "user_id,endpoint" }
    );
    if (error) throw new Error(error.message);
  });

/** Remove a push subscription (e.g. when the user denies permission). */
export const unsubscribePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const {
      data: { user },
    } = await context.supabase.auth.getUser();
    if (!user) return;

    const { error } = await (context.supabase.from("push_subscriptions") as any)
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(error.message);
  });

// ── Trip notification checker ─────────────────────────────────────────────────

/**
 * Checks and inserts trip-related notifications for the current user.
 * Safe to call frequently — notif_key unique index prevents duplicates.
 * Called by NotificationBootstrap every 5 minutes when the app is open.
 */
export const checkTripNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const {
      data: { user },
    } = await context.supabase.auth.getUser();
    if (!user) return;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Helper: upsert a notification — skips on duplicate notif_key
    const upsertNotif = async (row: Record<string, unknown>) => {
      await (context.supabase.from("notifications") as any).upsert(row, {
        onConflict: "user_id,notif_key",
        ignoreDuplicates: true,
      });
    };

    // ── 1. Trip-start — fires once on the calendar day the trip begins ────
    const { data: startingTrips } = await context.supabase
      .from("trips")
      .select("id, title, start_date")
      .eq("start_date", todayStr);

    for (const trip of startingTrips ?? []) {
      await upsertNotif({
        user_id: user.id,
        type: "trip_upcoming",
        title: "Un nuovo viaggio sta per iniziare",
        body: trip.title ?? null,
        link: `/trips/${trip.id}`,
        read: false,
        notif_key: `trip_start:${trip.id}:${trip.start_date}`,
        trip_id: trip.id,
      });
    }

    // ── 2. Departure — 1 hour before outbound start_at ───────────────────
    const dep55 = new Date(now.getTime() + 55 * 60_000).toISOString();
    const dep65 = new Date(now.getTime() + 65 * 60_000).toISOString();

    const { data: departures } = await context.supabase
      .from("itinerary_items")
      .select("id, trip_id, trips(title)")
      .eq("kind", "outbound")
      .gte("start_at", dep55)
      .lte("start_at", dep65);

    for (const item of departures ?? []) {
      const tripTitle =
        (item.trips as { title?: string } | null)?.title ?? null;
      await upsertNotif({
        user_id: user.id,
        type: "trip_upcoming",
        title: "Manca un'ora alla partenza",
        body: tripTitle,
        link: `/trips/${item.trip_id}`,
        read: false,
        notif_key: `departure_1h:${item.id}`,
        trip_id: item.trip_id,
      });
    }

    // ── 3. Arrival — at outbound end_at (window: -5 min / +2 min) ────────
    const arrFrom = new Date(now.getTime() - 5 * 60_000).toISOString();
    const arrTo = new Date(now.getTime() + 2 * 60_000).toISOString();

    const { data: arrivals } = await context.supabase
      .from("itinerary_items")
      .select("id, trip_id, trips(title, country)")
      .eq("kind", "outbound")
      .gte("end_at", arrFrom)
      .lte("end_at", arrTo);

    for (const item of arrivals ?? []) {
      const tripData = item.trips as {
        title?: string;
        country?: string | null;
      } | null;
      const country = tripData?.country ?? null;

      let title: string;
      let body: string | null = null;

      if (country) {
        // Fetch all past/current trips with a country to compute ordinals
        const { data: pastTrips } = await context.supabase
          .from("trips")
          .select("id, country")
          .not("country", "is", null)
          .lte("end_date", todayStr);

        const all = (pastTrips ?? []) as { id: string; country: string }[];
        const sameCountry = all.filter((t) => t.country === country);
        const uniqueCountries = new Set(all.map((t) => t.country));

        if (sameCountry.length <= 1) {
          // First visit: "Benvenuto in X. Questo è il tuo N° paese visitato"
          title = `Benvenuto in ${country}`;
          body = `Questo è il tuo ${ordinalItM(uniqueCountries.size)} paese visitato`;
        } else {
          // Return visit: "Bentornato in X. Questa è la N° volta in questo paese"
          title = `Bentornato in ${country}`;
          body = `Questa è la ${ordinalItF(sameCountry.length)} volta in questo paese`;
        }
      } else {
        title = "Benvenuto!";
        body = tripData?.title ?? null;
      }

      await upsertNotif({
        user_id: user.id,
        type: "trip_ongoing",
        title,
        body,
        link: `/trips/${item.trip_id}`,
        read: false,
        notif_key: `arrival:${item.id}`,
        trip_id: item.trip_id,
      });
    }
  });
